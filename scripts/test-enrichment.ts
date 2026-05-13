/**
 * Test enrichment script — Phase 1 prompt v1.1 against 10 sample products.
 *
 * Reads sample-candidates.json, filters to the 10 we chose, runs each through
 * Claude Opus 4.7 with the web_search tool grounded on the manufacturer's
 * domain (when known), and writes results to test-enrichment-results.json.
 *
 * Run: npx ts-node --project tsconfig.scripts.json scripts/test-enrichment.ts
 *
 * Requires in .env.local:
 *   ANTHROPIC_API_KEY=sk-ant-...
 */

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import * as fs from 'fs'
import * as path from 'path'

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const PROMPT_VERSION = 'v1.4'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
if (!ANTHROPIC_KEY) {
  console.error('Missing ANTHROPIC_API_KEY in .env.local')
  process.exit(1)
}
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })

// ─── Brand → domain map ───────────────────────────────────────────────────
// "Trusted" brands: we're confident in the domain, so we restrict web_search
// to it via allowed_domains for higher-confidence results.
// "Untrusted" brands: we have a guess but let Claude search freely so it
// can correct us. We'll update the manufacturer_brands seed based on results.
const TRUSTED_BRAND_DOMAINS: Record<string, string> = {
  Husqvarna: 'husqvarna.com',
  Echo: 'echo-usa.com',
  Toro: 'toro.com',
  Ferris: 'ferrisindustries.com',
}

const UNTRUSTED_BRAND_DOMAINS: Record<string, string> = {
  'Tsurumi Pump': 'tsurumi.com',
  'LB WHITE': 'lbwhite.com',
  'Greenworks North America': 'greenworkstools.com',
  'Mean Green': 'meangreenproducts.com',
}

// ─── The 10 test products (by make + part_number) ────────────────────────
const TEST_KEYS: Array<{ make: string; part_number: string }> = [
  { make: 'Toro',                     part_number: '77502' },
  { make: 'Husqvarna',                part_number: '967682101' },
  { make: 'Husqvarna',                part_number: '967276612' },
  { make: 'Echo',                     part_number: 'CWT-7410' },
  { make: 'Ferris',                   part_number: '5901459' },
  { make: 'Toro',                     part_number: '77404' },
  { make: 'Tsurumi Pump',             part_number: 'IHSTDAA3' },
  { make: 'LB WHITE',                 part_number: 'CP175FK' },
  { make: 'Greenworks North America', part_number: '82BD500' },
  { make: 'Mean Green',               part_number: 'VQS52S220' },
]

// ─── Output schema (Zod) ──────────────────────────────────────────────────
const EnrichmentSchema = z.object({
  display_name: z.string().describe(
    'Brand Series PrimarySpec Category — e.g. "Toro TimeMaster 21\\" Walk-Behind Mower". Empty string if not extracted.'
  ),
  series: z.string().describe(
    'Family/marketing name only, no part number. Empty string if no distinct series.'
  ),
  short_description: z.string().describe('1–2 sentences, max ~200 chars.'),
  description: z.string().describe('3–4 sentences, ~400–600 chars.'),
  specs: z.record(z.string(), z.string()).describe('5–8 spec name → value entries.'),
  features: z.array(z.string()).describe('4–6 key feature bullets.'),
  source_url: z.string().describe('Direct manufacturer product page URL.'),
  image_url: z.string().describe('Main product image URL (og:image preferred).'),
  discontinued: z.boolean().describe(
    'True if the page indicates the product is discontinued, archived, or replaced.'
  ),
  confidence: z.enum(['high', 'medium', 'low']),
  confidence_notes: z.string(),
})
type Enrichment = z.infer<typeof EnrichmentSchema>

// ─── System prompt v1.2 (cacheable) ───────────────────────────────────────
const SYSTEM_PROMPT = `You are enriching a product catalog for Ready Equipment, an authorized equipment dealer in Meredith, NH.

Your job: find the official manufacturer product page for the product described in the user message, OPEN that page using web_fetch, and extract structured data from the actual page contents. You have TWO tools available:
  - web_search: find candidate URLs
  - web_fetch:  open a URL and read its full contents

You MUST use both. DO NOT answer from search snippets alone. DO NOT answer from memory.

STEPS
─────
1. Search the web for the product. If a brand_domain is provided, prefer "site:{brand_domain} {part_number}" first.
2. Identify the most likely manufacturer product page from search results.
3. Use web_fetch to OPEN that page and read its actual contents.
4. Verify: the part_number from the user message MUST appear verbatim in the FETCHED page contents (not just in search snippets). If not, search again or fetch a different candidate.
5. Check for discontinued markers (rule 6 below).
6. If active, extract the fields per the schema FROM THE FETCHED PAGE. Not from search snippets. Not from memory.

RULES
─────

1. CRITICAL — DO NOT SUBSTITUTE A DIFFERENT SKU.
   If you cannot confirm the EXACT part_number from the user message on a manufacturer page you successfully fetched, you MUST NOT:
     - Use a similar-looking SKU's name, specs, or description
     - Fall back to the product family's general info as if it were this SKU
     - Infer the product from category + price
     - Describe a related product that has a different part number
   Instead: return all string fields as "" (empty), specs={}, features=[], discontinued=false, confidence="low". In confidence_notes, explain what you tried, the closest near-match part number you found (if any), and the URL of that near-match page. A human will decide whether to manually map this SKU.

2. source_url should be a direct manufacturer product page (any subdomain of the brand's official site is ok). Not a category page, not a dealer/retailer/Amazon listing. If you found a strong candidate URL in search results but could not successfully fetch it, include the URL anyway and note in confidence_notes that fetch was not completed.

3. NEVER invent specs. Only include specs that actually appear in the FETCHED page. Fewer than 5 is fine. Empty specs={} is acceptable — do NOT pad with guesses.

4. "series" = the marketing family name only. NOT the part number. NOT generic words like "mower" or "saw". Examples:
   - "TimeMaster", "TimeCutter", "Z Master"             (Toro)
   - "572 XP", "562 XP", "Automower"                    (Husqvarna)
   - "MS 261", "FS 91 R", "BR 800"                      (Stihl)
   - "GP6500", "Guardian"                               (Generac)
   If the product genuinely has no distinct series (e.g. an accessory, or the part_number IS the marketing name), return series="" and note it in confidence_notes.

5. "display_name" pattern: "{Make} {Series} {PrimarySpec} {Category}".
   PrimarySpec = the single most identifying number with units. Examples:
     - "Toro TimeMaster 21\\" Walk-Behind Mower"
     - "Husqvarna 572 XP 20\\" Professional Chainsaw"
     - "Generac GP6500 6500W Portable Generator"
   If PrimarySpec isn't obvious, omit it: "Toro TimeMaster Walk-Behind Mower"

6. DISCONTINUED PRODUCTS — flag, do not extract.
   If the fetched page indicates the product is discontinued, archived, "no longer in production", "replaced by [other model]", or similar — OR the manufacturer site redirects this part_number to a generic/replacement page — then:
     - Return all string fields as "" (display_name, series, short_description, description, image_url)
     - Return arrays as [] and specs as {}
     - Set discontinued = true
     - Set confidence = "low"
     - source_url should still point to the tombstone/replacement page
     - confidence_notes should QUOTE the discontinued language verbatim, e.g. "Page header reads 'This product has been discontinued.'"

7. If you cannot find ANY manufacturer page after 2-3 search+fetch attempts:
   Return all string fields as "", arrays as [], specs as {}, discontinued=false, confidence="low". Put your search/fetch history in confidence_notes so a human can pick up where you left off.

8. IMAGES. In the fetched HTML, scan for an og:image meta tag (e.g. <meta property="og:image" content="..."> or content="..." property="og:image">) or a twitter:image meta tag. Use that URL as image_url. If neither is present, look for the primary product image URL on the page (often in a hero <img> or a product gallery). Empty image_url="" is acceptable if no clear hero image is identifiable.

CONFIDENCE LEVELS — based on verification, not completeness
───────────────────────────────────────────────────────────
- "high"   = part_number appears verbatim on a manufacturer-domain page that you FETCHED, AND display_name + series extracted from that page. Specs may be missing/partial — that does NOT downgrade confidence.
- "medium" = part_number appears verbatim on a fetched manufacturer page, but the page is sparse, archived, redirected, or a model-family variant page.
- "low"    = part_number NOT verified verbatim on a successfully fetched page (snippets only doesn't count) — OR — you only found a family/category page, not the specific SKU page — OR — see Rule 1 (substitution refused).

BAIL-OUT BUDGET
───────────────
You have a HARD CAP of 3 web_search calls and 2 web_fetch calls. After you've used them, STOP. Do not search again. Do not fetch again. Return whatever you have with the appropriate confidence level (likely "low" if you couldn't verify).

Specifically: if after 2-3 searches you cannot find a manufacturer URL whose snippet shows the exact part_number, the SKU is most likely a dealer-internal identifier, a typo, or a product that has no per-SKU manufacturer page. STOP IMMEDIATELY. Return all string fields as "", arrays as [], specs={}, confidence="low", and use confidence_notes to explain the search history and any near-match found. Do NOT keep trying — fast failure with good notes is better than slow failure.

THOROUGH EXTRACTION ON SUCCESS
──────────────────────────────
When you DO successfully fetch a manufacturer product page with the part_number verbatim:
  - Extract the FULL spec table if one exists. Include every numbered spec (engine displacement, deck size, cutting widths, weights, dimensions, voltages, runtimes, etc.) with units exactly as shown on the page.
  - Extract 4-6 key features from the page's features/highlights section.
  - Both arrays should be populated unless the page genuinely lacks that section.
Do not return empty specs={} or features=[] for a high-confidence product unless the manufacturer page truly has nothing to extract.

OUTPUT
──────
Your final response MUST be a single JSON object matching the schema. Nothing else. No preamble like "Here is the JSON". No commentary after. No markdown fences. The JSON object is your entire response.`

// ─── Main ─────────────────────────────────────────────────────────────────
interface Sample {
  id: string
  make: string
  part_number: string
  category: string
  condition: string
  list_price_cents: number
  image_url: string | null
  flags: Record<string, boolean>
}

interface Result {
  prompt_version: string
  product: Sample
  input: {
    brand_domain: string | null
    brand_domain_trusted: boolean
    user_message: string
  }
  enrichment: Enrichment | null
  raw_text: string
  parse_error: string | null
  stop_reason: string | null
  usage: any
  content_block_types: string[]
  error: string | null
  timing_ms: number
}

async function main() {
  // Load sample candidates
  const samplePath = path.join(__dirname, '..', 'sample-candidates.json')
  if (!fs.existsSync(samplePath)) {
    console.error(`Missing ${samplePath}. Run scripts/sample-selection.ts first.`)
    process.exit(1)
  }
  const samples = JSON.parse(fs.readFileSync(samplePath, 'utf-8')) as Sample[]

  // Filter to our 10
  const candidates: Sample[] = TEST_KEYS.map(key => {
    const found = samples.find(s => s.make === key.make && s.part_number === key.part_number)
    if (!found) {
      console.error(`Could not find ${key.make} ${key.part_number} in sample-candidates.json`)
      process.exit(1)
    }
    return found
  })

  console.log(`\nRunning enrichment prompt ${PROMPT_VERSION} against ${candidates.length} products`)
  console.log(`Model: claude-opus-4-7  |  Web search: web_search_20260209  |  Effort: high\n`)

  const results: Result[] = []

  for (let idx = 0; idx < candidates.length; idx++) {
    const product = candidates[idx]
    const trustedDomain = TRUSTED_BRAND_DOMAINS[product.make]
    const untrustedDomain = UNTRUSTED_BRAND_DOMAINS[product.make]
    const brand_domain = trustedDomain || untrustedDomain || null
    const trusted = !!trustedDomain

    const tag = `[${idx + 1}/${candidates.length}]`
    const domainHint = brand_domain
      ? `${brand_domain}${trusted ? ' (trusted)' : ' (guess)'}`
      : 'NONE — open web'
    console.log(`${tag} ${product.make} ${product.part_number}  →  ${domainHint}`)

    const start = Date.now()
    try {
      const r = await enrichOne(product, brand_domain, trusted)
      const status = r.parsed
        ? `${r.parsed.confidence}${r.parsed.discontinued ? ' DISCONTINUED' : ''} — ${r.parsed.display_name || '(no display_name)'}`
        : '(no parsed output)'
      console.log(`     ✓ ${status}\n`)
      results.push({
        prompt_version: PROMPT_VERSION,
        product,
        input: {
          brand_domain,
          brand_domain_trusted: trusted,
          user_message: r.userMessage,
        },
        enrichment: r.parsed,
        raw_text: r.raw_text,
        parse_error: r.parse_error,
        stop_reason: r.stop_reason,
        usage: r.usage,
        content_block_types: r.content_block_types,
        error: null,
        timing_ms: Date.now() - start,
      })
    } catch (err: any) {
      const msg = err?.message ?? String(err)
      console.error(`     ✗ ERROR: ${msg}\n`)
      results.push({
        prompt_version: PROMPT_VERSION,
        product,
        input: { brand_domain, brand_domain_trusted: trusted, user_message: '' },
        enrichment: null,
        raw_text: '',
        parse_error: null,
        stop_reason: null,
        usage: null,
        content_block_types: [],
        error: msg,
        timing_ms: Date.now() - start,
      })
    }
  }

  const outPath = path.join(__dirname, '..', `test-enrichment-results-${PROMPT_VERSION}.json`)
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2))
  console.log(`\nResults written to: ${outPath}`)

  // Summary
  const ok = results.filter(r => r.enrichment && !r.error).length
  const high = results.filter(r => r.enrichment?.confidence === 'high').length
  const medium = results.filter(r => r.enrichment?.confidence === 'medium').length
  const low = results.filter(r => r.enrichment?.confidence === 'low').length
  const disc = results.filter(r => r.enrichment?.discontinued).length
  const failed = results.filter(r => r.error).length

  console.log(`\nSummary:`)
  console.log(`  Extracted:    ${ok}/${results.length}`)
  console.log(`  Confidence:   ${high} high · ${medium} medium · ${low} low`)
  console.log(`  Discontinued: ${disc}`)
  console.log(`  Errors:       ${failed}`)

  // Cost accounting — Opus 4.7 published rates per 1M tokens:
  //   input:           $5.00
  //   output:          $25.00
  //   cache creation:  $6.25  (1.25x input, 5-min TTL)
  //   cache read:      $0.50  (0.1x input)
  // Plus web_search: $10 per 1000 searches (≈ $0.01 each)
  // web_fetch:        unknown public rate at time of writing; omitted
  const sum = (key: string) => results.reduce(
    (s, r) => s + (r.usage?.[key] ?? 0), 0
  )
  const sumNested = (path: string[]) => results.reduce((s, r) => {
    let v: any = r.usage
    for (const k of path) v = v?.[k]
    return s + (v ?? 0)
  }, 0)

  const inputTokens   = sum('input_tokens')
  const outputTokens  = sum('output_tokens')
  const cacheCreate   = sum('cache_creation_input_tokens')
  const cacheRead     = sum('cache_read_input_tokens')
  const webSearches   = sumNested(['server_tool_use', 'web_search_requests'])
  const webFetches    = sumNested(['server_tool_use', 'web_fetch_requests'])

  const costInput     = inputTokens   * 5     / 1_000_000
  const costOutput    = outputTokens  * 25    / 1_000_000
  const costCacheW    = cacheCreate   * 6.25  / 1_000_000
  const costCacheR    = cacheRead     * 0.5   / 1_000_000
  const costSearch    = webSearches   * 0.01
  const costTotal     = costInput + costOutput + costCacheW + costCacheR + costSearch

  console.log(`\nUsage:`)
  console.log(`  Input tokens:     ${inputTokens.toLocaleString().padStart(10)}  $${costInput.toFixed(3)}`)
  console.log(`  Output tokens:    ${outputTokens.toLocaleString().padStart(10)}  $${costOutput.toFixed(3)}`)
  console.log(`  Cache writes:     ${cacheCreate.toLocaleString().padStart(10)}  $${costCacheW.toFixed(3)}`)
  console.log(`  Cache reads:      ${cacheRead.toLocaleString().padStart(10)}  $${costCacheR.toFixed(3)}`)
  console.log(`  Web searches:     ${webSearches.toString().padStart(10)}  $${costSearch.toFixed(3)}`)
  console.log(`  Web fetches:      ${webFetches.toString().padStart(10)}  (rate unknown — not counted)`)
  console.log(`  ─────────────────────────────────────`)
  console.log(`  Floor estimate:                $${costTotal.toFixed(3)}`)
  console.log(`  Actual will be higher (web_fetch + any failed/retry calls).`)
  console.log(`  Verify in https://console.anthropic.com/settings/usage`)
}

async function enrichOne(
  product: Sample,
  brand_domain: string | null,
  trusted: boolean,
) {
  const price = product.list_price_cents > 0
    ? `$${(product.list_price_cents / 100).toFixed(0)}`
    : 'unknown'

  const userMessage = `Enrich this product:

- Make:           ${product.make}
- Part number:    ${product.part_number}
- Category hint:  ${product.category}  (from dealer inventory; coarse)
- Dealer price:   ${price}              (sanity-check only)
- Brand domain:   ${brand_domain ?? '(unknown — search the web freely for the manufacturer)'}

Find the manufacturer page and extract per the system instructions. Return ONLY the JSON object.`

  const webSearchTool: any = {
    type: 'web_search_20260209',
    name: 'web_search',
    max_uses: 3, // matches prompt bail-out budget
  }
  // Only constrain to a domain if we trust it. For guessed domains, let
  // Claude search freely so it can correct us if the guess is wrong.
  if (brand_domain && trusted) {
    webSearchTool.allowed_domains = [brand_domain]
  }

  // web_fetch lets Claude actually open candidate URLs from search results.
  // No domain restriction — Claude can only fetch URLs that appeared in
  // search results, which are already constrained by web_search.
  const webFetchTool: any = {
    type: 'web_fetch_20260209',
    name: 'web_fetch',
    max_uses: 2, // matches prompt bail-out budget
  }

  // Stream the response — eliminates the 10-min SDK HTTP timeout that killed
  // Ferris and LB White in v1.2. We don't process individual events; just
  // await finalMessage() to get the complete Message object.
  const stream = anthropic.messages.stream({
    model: 'claude-opus-4-7',
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    // v1.4 experiment: removed `format: zodOutputFormat(EnrichmentSchema)`.
    // Theory — strict structured output was causing the model to satisfy the
    // schema with empty defaults rather than populate all fields. Without it,
    // JSON output is enforced by the prompt only; we validate with Zod after.
    output_config: {
      effort: 'high',
    },
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    tools: [webSearchTool, webFetchTool],
    messages: [{ role: 'user', content: userMessage }],
  })

  const finalMessage = await stream.finalMessage()

  // Extract the final text block (the JSON output per output_config.format)
  const textBlock = finalMessage.content.find((b: any) => b.type === 'text') as any
  const rawText: string = textBlock?.text ?? ''

  // Parse manually so we can see exactly what Claude produced (and diagnose
  // the empty-specs/features issue we saw in v1.2).
  let parsed: Enrichment | null = null
  let parseError: string | null = null
  try {
    const data = JSON.parse(rawText)
    parsed = EnrichmentSchema.parse(data)
  } catch (e: any) {
    parseError = e?.message ?? String(e)
  }

  return {
    parsed,
    raw_text: rawText,
    parse_error: parseError,
    stop_reason: finalMessage.stop_reason,
    usage: finalMessage.usage,
    content_block_types: finalMessage.content.map((b: any) => b.type),
    userMessage,
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
