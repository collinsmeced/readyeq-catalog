/**
 * Phase 1 enrichment service — production version of the v1.4 test pipeline.
 *
 * Pure function: takes product info, calls Claude with web_search + web_fetch,
 * returns the parsed result and an audit log entry. Does NOT touch the database.
 * Callers (bulk script, /admin re-enrich button) handle persistence.
 *
 * Reuses the v1.4 prompt that gave us 42 specs on Toro 77502 and clean
 * "Tsurumi IHSTDAA3 not found" diagnostic refusals.
 */

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

export const PROMPT_VERSION = 'v1.4'

// ─── Output schema (Zod) ────────────────────────────────────────────────
export const EnrichmentSchema = z.object({
  display_name:      z.string(),
  series:            z.string(),
  short_description: z.string(),
  description:       z.string(),
  specs:             z.record(z.string(), z.string()),
  features:          z.array(z.string()),
  source_url:        z.string(),
  image_url:         z.string(),
  discontinued:      z.boolean(),
  confidence:        z.enum(['high', 'medium', 'low']),
  confidence_notes:  z.string(),
})
export type Enrichment = z.infer<typeof EnrichmentSchema>

// ─── System prompt v1.4 (same as the test script) ───────────────────────
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

// ─── Types ──────────────────────────────────────────────────────────────
export interface EnrichmentInput {
  make: string
  part_number: string
  category_hint?: string
  price_cents?: number
  brand_domain?: string | null  // pre-resolved via resolveBrandDomain()
  trusted_domain?: boolean      // true if brand_domain comes from manufacturer_brands
  starting_url?: string         // user-pasted URL to fetch FIRST before searching
}

export interface EnrichmentResult {
  enrichment: Enrichment | null
  raw_text: string
  parse_error: string | null
  stop_reason: string | null
  passes_gate: boolean              // 4-of-4 auto-approval gate result
  attempt: EnrichmentAttemptLog     // for products.enrichment_log
  usage: any                        // raw Anthropic usage object
}

export interface EnrichmentAttemptLog {
  at: string                        // ISO timestamp
  prompt_version: string
  input: EnrichmentInput
  source_url: string | null
  confidence: 'high' | 'medium' | 'low' | null
  confidence_notes: string          // Claude's reasoning — surface in UI on failure
  discontinued: boolean
  passes_gate: boolean
  parse_error: string | null
  stop_reason: string | null
  usage_summary: {
    input_tokens: number
    output_tokens: number
    cache_read: number
    cache_write: number
    searches: number
    fetches: number
  }
}

// ─── Core enrichment call ───────────────────────────────────────────────
export async function enrichProduct(input: EnrichmentInput): Promise<EnrichmentResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')
  const anthropic = new Anthropic({ apiKey })

  const price = input.price_cents && input.price_cents > 0
    ? `$${(input.price_cents / 100).toFixed(0)}`
    : 'unknown'

  const startingUrlBlock = input.starting_url
    ? `

⚠ MANUAL OVERRIDE — REVIEWER-PROVIDED URL: ${input.starting_url}

A human reviewer has manually verified that this URL is the correct
page for this SKU. This OVERRIDES the normal flow AND all website rules:

1. Use web_fetch on this exact URL. DO NOT search for alternatives.
   DO NOT use web_search at all — this is a fetch-only override.
2. The URL can be on ANY website — manufacturer's site, dealer page,
   archived spec sheet, regional subdomain, third-party catalog,
   anywhere. ALL website restrictions are waived for this override.
   The reviewer has chosen this URL deliberately.
3. Extract all fields per the schema FROM THE FETCHED PAGE — even if
   the user's part_number "${input.part_number}" does NOT appear
   verbatim on the page. Many dealer SKUs are variants of a base model
   (e.g. "SRM-2620-2A" maps to Echo's "SRM-2620"; "77502-A" maps to
   Toro's "77502"). The reviewer has accepted this mapping.
4. Rule 1 (no SKU substitution) is **RELAXED** for this override —
   confidently use whatever name, specs, description, and image the
   fetched page provides.
5. In confidence_notes, state:
   - If "${input.part_number}" appears verbatim on the page →
     "User-provided URL verified — part_number matches."
   - If it does NOT appear verbatim →
     "User-provided URL is for [manufacturer's SKU/name]; user's
     part_number ${input.part_number} appears to be a dealer variant.
     Reviewer has accepted this mapping."
   - If the URL is not the manufacturer's official site (e.g. a dealer
     or third-party catalog), additionally state:
     "Source is non-manufacturer ([domain]). Reviewer has accepted it."
6. Set confidence:
   - "high" if part_number matches verbatim AND source is the brand's
     manufacturer domain
   - "medium" if either condition above is missing (variant mapping
     OR non-manufacturer source)
   - "low" only if the page itself contains nothing extractable

All other rules (specs from page only, image extraction, etc.) still apply.`
    : ''

  const userMessage = `Enrich this product:

- Make:           ${input.make}
- Part number:    ${input.part_number}
- Category hint:  ${input.category_hint || '(none)'}  (from dealer inventory; coarse)
- Dealer price:   ${price}              (sanity-check only)
- Brand domain:   ${input.brand_domain ?? '(unknown — search the web freely for the manufacturer)'}${startingUrlBlock}

Find the manufacturer page and extract per the system instructions. Return ONLY the JSON object.`

  // For manual-URL overrides, drop web_search entirely so the model can't
  // be tempted to look elsewhere. Only web_fetch with no domain restrictions.
  const tools: any[] = []
  if (!input.starting_url) {
    const webSearchTool: any = {
      type: 'web_search_20260209',
      name: 'web_search',
      max_uses: 3,
    }
    if (input.brand_domain && input.trusted_domain) {
      webSearchTool.allowed_domains = [input.brand_domain]
    }
    tools.push(webSearchTool)
  }
  tools.push({
    type: 'web_fetch_20260209',
    name: 'web_fetch',
    max_uses: input.starting_url ? 3 : 2,  // a bit more headroom for override
    // No allowed_domains — fetch any URL when overriding, brand or otherwise.
  })

  // Streaming + manual JSON parse — matches v1.4 test script exactly
  const stream = anthropic.messages.stream({
    model: 'claude-opus-4-7',
    max_tokens: 16000,
    thinking: { type: 'adaptive' } as any,
    output_config: { effort: 'high' } as any,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } } as any,
    ],
    tools: tools,
    messages: [{ role: 'user', content: userMessage }],
  } as any)

  const finalMessage = await stream.finalMessage()
  const textBlock = finalMessage.content.find((b: any) => b.type === 'text') as any
  const rawText: string = textBlock?.text ?? ''

  let parsed: Enrichment | null = null
  let parseError: string | null = null
  try {
    const data = JSON.parse(rawText)
    parsed = EnrichmentSchema.parse(data)
  } catch (e: any) {
    parseError = e?.message ?? String(e)
  }

  const passesGate = parsed ? passesAutoApprovalGate(parsed, input.brand_domain ?? null) : false

  const u: any = finalMessage.usage
  const stu: any = u?.server_tool_use ?? {}
  const attempt: EnrichmentAttemptLog = {
    at: new Date().toISOString(),
    prompt_version: PROMPT_VERSION,
    input,
    source_url: parsed?.source_url || null,
    confidence: parsed?.confidence ?? null,
    confidence_notes: parsed?.confidence_notes ?? '',
    discontinued: parsed?.discontinued ?? false,
    passes_gate: passesGate,
    parse_error: parseError,
    stop_reason: finalMessage.stop_reason,
    usage_summary: {
      input_tokens:  u?.input_tokens ?? 0,
      output_tokens: u?.output_tokens ?? 0,
      cache_read:    u?.cache_read_input_tokens ?? 0,
      cache_write:   u?.cache_creation_input_tokens ?? 0,
      searches:      stu?.web_search_requests ?? 0,
      fetches:       stu?.web_fetch_requests ?? 0,
    },
  }

  return {
    enrichment: parsed,
    raw_text: rawText,
    parse_error: parseError,
    stop_reason: finalMessage.stop_reason,
    passes_gate: passesGate,
    attempt,
    usage: finalMessage.usage,
  }
}

// ─── 4-of-4 auto-approval gate ──────────────────────────────────────────
export function passesAutoApprovalGate(
  enrichment: Enrichment,
  brand_domain: string | null,
): boolean {
  // Discontinued items never auto-approve — always need human decision
  if (enrichment.discontinued) return false

  // Confidence must be high
  if (enrichment.confidence !== 'high') return false

  // Must have a brand domain to verify against
  if (!brand_domain) return false

  // Check 1: source_url is on the brand domain (subdomains ok)
  if (!enrichment.source_url) return false
  let urlHost: string
  try {
    urlHost = new URL(enrichment.source_url).hostname.toLowerCase()
  } catch {
    return false
  }
  const domain = brand_domain.toLowerCase()
  if (urlHost !== domain && !urlHost.endsWith('.' + domain)) return false

  // Check 2: part_number verbatim verification — Claude already attested
  //   to this by setting confidence='high'. We trust it for gate purposes.

  // Check 3: series AND display_name both non-empty
  if (!enrichment.series.trim() || !enrichment.display_name.trim()) return false

  // Check 4: image_url present (Claude only sets this if it found one in the fetched HTML)
  if (!enrichment.image_url.trim()) return false

  return true
}
