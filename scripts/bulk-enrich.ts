/**
 * Bulk re-enrichment of all products in review_status='enriched'.
 *
 * Reads products + manufacturer_brands via direct pg connection (SUPABASE_DB_URL).
 * For each product:
 *   1. Resolve brand → manufacturer_brands (with alias matching)
 *   2. Call enrichProduct() — Claude with web_search + web_fetch
 *   3. If passes the 4-of-4 auto-approval gate → flip review_status='approved'
 *      and write enrichment fields. If discontinued → flag, deactivate.
 *      Otherwise → write enrichment fields, keep review_status='enriched'.
 *   4. Append the attempt to products.enrichment_log
 *   5. Snapshot the old enrichment fields the FIRST time we run on a product
 *      so we can compare/rollback if needed.
 *
 * Concurrency: 5 parallel. Resumable: skips products whose latest attempt has
 * the current prompt version + no parse error.
 *
 * Run: npx ts-node --project tsconfig.scripts.json scripts/bulk-enrich.ts
 *      npx ts-node ... scripts/bulk-enrich.ts --limit=10           # just 10 for testing
 *      npx ts-node ... scripts/bulk-enrich.ts --product-id=<uuid>  # just one product
 *      npx ts-node ... scripts/bulk-enrich.ts --force              # re-enrich even if up to date
 */

import * as path from 'path'
import { Client } from 'pg'
import { enrichProduct, passesAutoApprovalGate, PROMPT_VERSION, type Enrichment, type EnrichmentAttemptLog } from '../src/lib/enrichment'

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), override: true })

const CONCURRENCY = 5

interface ProductRow {
  id: string
  make: string
  part_number: string
  category: string
  list_price_cents: number
  display_name: string | null
  short_description: string | null
  description: string | null
  specs: Record<string, string>
  features: string[]
  image_url: string | null
  series: string | null
  source_url: string | null
  review_status: string
  enrichment_log: any[]
  human_edited_fields: string[]
}

interface BrandRow {
  brand: string
  domain: string
  aliases: string[]
}

// ─── Brand resolver ─────────────────────────────────────────────────────
function buildBrandResolver(brands: BrandRow[]) {
  // Build a case-insensitive lookup map: every brand name + every alias → BrandRow
  const lookup = new Map<string, BrandRow>()
  for (const b of brands) {
    lookup.set(b.brand.toLowerCase(), b)
    for (const alias of b.aliases) {
      lookup.set(alias.toLowerCase(), b)
    }
  }
  return (make: string): { brand_domain: string | null, trusted_domain: boolean } => {
    const hit = lookup.get(make.toLowerCase().trim())
    if (hit) return { brand_domain: hit.domain, trusted_domain: true }
    return { brand_domain: null, trusted_domain: false }
  }
}

// ─── Decide what to write for one product ───────────────────────────────
interface WriteDecision {
  fields: Record<string, any>
  reason: 'auto-approved' | 'flagged-discontinued' | 'enriched-stays' | 'parse-error'
}

function decideWrite(
  row: ProductRow,
  enrichment: Enrichment | null,
  passesGate: boolean,
  parseError: string | null,
  attempt: EnrichmentAttemptLog,
): WriteDecision {
  // The new log entry (always appended)
  const newLog = [...(row.enrichment_log || []), attempt]

  // Parse error → store nothing useful, log the attempt, leave content unchanged
  if (parseError || !enrichment) {
    return {
      fields: { enrichment_log: JSON.stringify(newLog) },
      reason: 'parse-error',
    }
  }

  // Build new content, respecting human-edited fields
  const protectedSet = new Set(row.human_edited_fields ?? [])
  const writeIf = (field: string, newValue: any, currentValue: any) =>
    protectedSet.has(field) ? currentValue : newValue

  // For discontinued items: flag for review, hide from live catalog, log it
  if (enrichment.discontinued) {
    return {
      fields: {
        // Don't overwrite content with empty strings — keep the old content
        // so the reviewer can see what the product WAS
        source_url:      enrichment.source_url || row.source_url,
        review_status:   'flagged',
        is_active:       false,
        enrichment_log:  JSON.stringify(newLog),
        enriched_at:     new Date().toISOString(),
      },
      reason: 'flagged-discontinued',
    }
  }

  // High-confidence + gate passes → auto-approve, content goes live
  if (passesGate) {
    return {
      fields: {
        display_name:      writeIf('display_name',      enrichment.display_name,      row.display_name),
        series:            writeIf('series',            enrichment.series || null,    row.series),
        short_description: writeIf('short_description', enrichment.short_description, row.short_description),
        description:       writeIf('description',       enrichment.description,       row.description),
        specs:             writeIf('specs',             JSON.stringify(enrichment.specs),    JSON.stringify(row.specs)),
        features:          writeIf('features',          enrichment.features,          row.features),
        image_url:         writeIf('image_url',         enrichment.image_url || null, row.image_url),
        source_url:        writeIf('source_url',        enrichment.source_url || null, row.source_url),
        review_status:     'approved',
        approved_at:       new Date().toISOString(),
        approved_by:       'auto-gate',
        enrichment_log:    JSON.stringify(newLog),
        enriched_at:       new Date().toISOString(),
      },
      reason: 'auto-approved',
    }
  }

  // Medium/low confidence → write the new content (it's still better than the
  // old hallucinations) but leave for human review. The review UI compares old
  // vs new — we have both in enrichment_log if needed.
  return {
    fields: {
      display_name:      writeIf('display_name',      enrichment.display_name      || row.display_name,      row.display_name),
      series:            writeIf('series',            enrichment.series || null,    row.series),
      short_description: writeIf('short_description', enrichment.short_description || row.short_description, row.short_description),
      description:       writeIf('description',       enrichment.description       || row.description,       row.description),
      specs:             writeIf('specs',             JSON.stringify(Object.keys(enrichment.specs).length ? enrichment.specs : row.specs), JSON.stringify(row.specs)),
      features:          writeIf('features',          enrichment.features.length ? enrichment.features : row.features, row.features),
      image_url:         writeIf('image_url',         enrichment.image_url || row.image_url, row.image_url),
      source_url:        writeIf('source_url',        enrichment.source_url || row.source_url, row.source_url),
      review_status:    'enriched',
      enrichment_log:   JSON.stringify(newLog),
      enriched_at:      new Date().toISOString(),
    },
    reason: 'enriched-stays',
  }
}

// ─── Per-product worker ─────────────────────────────────────────────────
async function processOne(
  client: Client,
  row: ProductRow,
  resolveBrand: (make: string) => { brand_domain: string | null, trusted_domain: boolean },
) {
  const { brand_domain, trusted_domain } = resolveBrand(row.make)

  // Snapshot old content into enrichment_log the FIRST time we run on this product
  // (so we can show "before/after" in the review UI even if v1.4 overwrites the
  // display_name etc.).
  const hasOldSnapshot = (row.enrichment_log || []).some((e: any) => e?.kind === 'initial-snapshot')
  if (!hasOldSnapshot) {
    const snapshot = {
      at: new Date().toISOString(),
      kind: 'initial-snapshot',
      prompt_version: 'pre-v1.4',
      content: {
        display_name:      row.display_name,
        short_description: row.short_description,
        description:       row.description,
        specs:             row.specs,
        features:          row.features,
        image_url:         row.image_url,
      },
    }
    row.enrichment_log = [...(row.enrichment_log || []), snapshot]
  }

  const result = await enrichProduct({
    make:          row.make,
    part_number:   row.part_number,
    category_hint: row.category,
    price_cents:   row.list_price_cents,
    brand_domain,
    trusted_domain,
  })

  const decision = decideWrite(row, result.enrichment, result.passes_gate, result.parse_error, result.attempt)

  // Single UPDATE with all the new fields
  const setClauses: string[] = []
  const values: any[] = []
  let i = 1
  for (const [k, v] of Object.entries(decision.fields)) {
    setClauses.push(`${k} = $${i}`)
    values.push(v)
    i++
  }
  values.push(row.id)
  await client.query(
    `UPDATE products SET ${setClauses.join(', ')} WHERE id = $${i}`,
    values,
  )

  return { row, decision, result }
}

// ─── Main ───────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2)
  const limit       = parseInt((args.find(a => a.startsWith('--limit=')) || '').replace('--limit=', '')) || null
  const productId   = (args.find(a => a.startsWith('--product-id=')) || '').replace('--product-id=', '') || null
  const force       = args.includes('--force')

  if (!process.env.SUPABASE_DB_URL) {
    console.error('Missing SUPABASE_DB_URL in .env.local')
    process.exit(1)
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Missing ANTHROPIC_API_KEY in .env.local')
    process.exit(1)
  }

  const client = new Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()

  // Load manufacturer_brands once, build a fast lookup
  const brandRes = await client.query<BrandRow>(
    `SELECT brand, domain, aliases FROM manufacturer_brands`,
  )
  const resolveBrand = buildBrandResolver(brandRes.rows)
  console.log(`Loaded ${brandRes.rows.length} manufacturer_brands\n`)

  // Find products to enrich
  let where = `review_status = 'enriched' AND is_active = true`
  const params: any[] = []
  if (productId) {
    where = `id = $1`
    params.push(productId)
  }
  if (limit && !productId) {
    // No need to inject limit as param
  }

  const q = `
    SELECT id, make, part_number, category, list_price_cents,
           display_name, short_description, description,
           COALESCE(specs, '{}'::jsonb) AS specs,
           COALESCE(features, ARRAY[]::text[]) AS features,
           image_url, series, source_url, review_status,
           COALESCE(enrichment_log, '[]'::jsonb) AS enrichment_log,
           COALESCE(human_edited_fields, ARRAY[]::text[]) AS human_edited_fields
    FROM products
    WHERE ${where}
    ORDER BY make, part_number
    ${limit && !productId ? `LIMIT ${limit}` : ''}
  `
  const { rows } = await client.query<ProductRow>(q, params)

  if (rows.length === 0) {
    console.log('No products to enrich.')
    await client.end()
    return
  }

  // Filter out already-up-to-date (unless --force)
  const toProcess = force ? rows : rows.filter(r => {
    const lastV14 = (r.enrichment_log || []).slice().reverse().find((e: any) =>
      e?.prompt_version === PROMPT_VERSION && !e?.parse_error
    )
    return !lastV14
  })

  console.log(`Candidates: ${rows.length}`)
  console.log(`To process: ${toProcess.length}  (${rows.length - toProcess.length} already enriched with ${PROMPT_VERSION})`)
  console.log()

  // Cost estimate (based on v1.4 actuals: ~$0.18 floor + ~$0.10 web_fetch / product)
  const estLow  = toProcess.length * 0.18
  const estHigh = toProcess.length * 0.35
  console.log(`Estimated cost: $${estLow.toFixed(2)} - $${estHigh.toFixed(2)}  (Opus 4.7 + web search + fetch)`)
  console.log(`Concurrency: ${CONCURRENCY}  |  Approx duration: ${Math.ceil(toProcess.length / CONCURRENCY * 1.2)} min\n`)

  // ─── Process in parallel batches ──────────────────────────────────────
  const stats = {
    approved: 0,
    flagged: 0,
    enriched: 0,
    parse_error: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    cache_read: 0,
    cache_write: 0,
    searches: 0,
    fetches: 0,
  }

  let done = 0
  const start = Date.now()

  for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
    const batch = toProcess.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(
      batch.map(row => processOne(client, row, resolveBrand)),
    )

    for (let j = 0; j < results.length; j++) {
      const r = results[j]
      const row = batch[j]
      done++

      if (r.status === 'rejected') {
        console.log(`  [${done}/${toProcess.length}] ✗ ${row.make} ${row.part_number}  ERROR: ${r.reason?.message || r.reason}`)
        continue
      }

      const { decision, result } = r.value
      const u = result.attempt.usage_summary
      stats.total_input_tokens += u.input_tokens
      stats.total_output_tokens += u.output_tokens
      stats.cache_read += u.cache_read
      stats.cache_write += u.cache_write
      stats.searches += u.searches
      stats.fetches += u.fetches

      let label = ''
      switch (decision.reason) {
        case 'auto-approved':         stats.approved++;    label = '✓ APPROVED'; break
        case 'flagged-discontinued':  stats.flagged++;     label = '⚠ DISCONTINUED'; break
        case 'enriched-stays':        stats.enriched++;    label = '○ for review'; break
        case 'parse-error':           stats.parse_error++; label = '✗ parse error'; break
      }
      const displayName = result.enrichment?.display_name || '(no display_name)'
      console.log(`  [${done}/${toProcess.length}] ${label}  ${row.make} ${row.part_number}  →  ${displayName}`)
    }
  }

  await client.end()

  const elapsedMin = ((Date.now() - start) / 60_000).toFixed(1)
  console.log('\n═══ Summary ═══')
  console.log(`  Approved (auto-gate):  ${stats.approved}`)
  console.log(`  Flagged (discontinued):${stats.flagged}`)
  console.log(`  Enriched (for review): ${stats.enriched}`)
  console.log(`  Parse errors:          ${stats.parse_error}`)
  console.log(`  Total:                 ${done}  in ${elapsedMin} min`)

  console.log('\nTokens:')
  console.log(`  Input:        ${stats.total_input_tokens.toLocaleString().padStart(10)}  $${(stats.total_input_tokens * 5 / 1_000_000).toFixed(3)}`)
  console.log(`  Output:       ${stats.total_output_tokens.toLocaleString().padStart(10)}  $${(stats.total_output_tokens * 25 / 1_000_000).toFixed(3)}`)
  console.log(`  Cache writes: ${stats.cache_write.toLocaleString().padStart(10)}  $${(stats.cache_write * 6.25 / 1_000_000).toFixed(3)}`)
  console.log(`  Cache reads:  ${stats.cache_read.toLocaleString().padStart(10)}  $${(stats.cache_read * 0.5 / 1_000_000).toFixed(3)}`)
  console.log(`  Web searches: ${stats.searches.toString().padStart(10)}  $${(stats.searches * 0.01).toFixed(3)}`)
  console.log(`  Web fetches:  ${stats.fetches.toString().padStart(10)}  (rate unknown)`)

  const floor = (stats.total_input_tokens * 5 + stats.total_output_tokens * 25 + stats.cache_write * 6.25 + stats.cache_read * 0.5) / 1_000_000 + stats.searches * 0.01
  console.log(`\nFloor cost:   $${floor.toFixed(3)}`)
  console.log(`Verify in https://console.anthropic.com/settings/usage`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
