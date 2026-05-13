/**
 * Sample-selection script — Phase 1 prompt testing prep.
 *
 * READ-ONLY. Queries Supabase with the anon key, prints catalog stats,
 * picks ~30 candidate products spanning brand/enrichment/condition variation,
 * and writes them to sample-candidates.json for review.
 *
 * Writes NOTHING back to Supabase.
 *
 * Run: npx ts-node --project tsconfig.scripts.json scripts/sample-selection.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

// Load .env.local
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !anonKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, anonKey)

// Brands seeded in migration 002 — anything outside this set has no brand→domain mapping yet.
const SEED_BRANDS = new Set([
  'Husqvarna', 'Echo', 'Toro', 'Kress', 'Ferris', 'Exmark',
  'Generac', 'Wacker Neuson', 'Makita', 'Billy Goat', 'Greenworks',
])

interface ProductRow {
  id: string
  make: string
  part_number: string               // renamed from `model` in migration 002
  category: string
  condition: string
  display_name: string | null
  short_description: string | null
  description: string | null
  list_price_cents: number
  image_url: string | null
  enriched_at: string | null
  is_active: boolean
}

interface Candidate extends ProductRow {
  _reasons: string[]
}

function addReason(map: Map<string, Candidate>, p: ProductRow, reason: string) {
  const existing = map.get(p.id)
  if (existing) {
    if (!existing._reasons.includes(reason)) existing._reasons.push(reason)
  } else {
    map.set(p.id, { ...p, _reasons: [reason] })
  }
}

async function main() {
  console.log('Querying Supabase...\n')

  const { data, error } = await supabase
    .from('products')
    .select('id, make, part_number, category, condition, display_name, short_description, description, list_price_cents, image_url, enriched_at, is_active')

  if (error) {
    console.error('Query failed:', error.message)
    process.exit(1)
  }
  if (!data || data.length === 0) {
    console.error('No products returned. RLS may be blocking, or the catalog is empty.')
    process.exit(1)
  }

  const products = data as ProductRow[]

  // ─── Aggregate stats ───────────────────────────────────────────────
  const byMake = new Map<string, ProductRow[]>()
  const byCategory = new Map<string, number>()
  for (const p of products) {
    if (!byMake.has(p.make)) byMake.set(p.make, [])
    byMake.get(p.make)!.push(p)
    byCategory.set(p.category, (byCategory.get(p.category) ?? 0) + 1)
  }
  const sortedBrands = Array.from(byMake.entries()).sort((a, b) => b[1].length - a[1].length)

  const enriched   = products.filter(p => p.enriched_at).length
  const withImage  = products.filter(p => p.image_url).length
  const withDesc   = products.filter(p => p.description).length
  const preOwned   = products.filter(p => p.condition === 'Pre-Owned').length

  console.log('═══ Catalog shape ═══')
  console.log(`Total visible (is_active=true via RLS): ${products.length}`)
  console.log(`Brands:                                  ${byMake.size}`)
  console.log(`Categories:                              ${byCategory.size}`)
  console.log(`Has enriched_at:                         ${enriched}  (${pct(enriched, products.length)})`)
  console.log(`Has image_url:                           ${withImage}  (${pct(withImage, products.length)})`)
  console.log(`Has description:                         ${withDesc}  (${pct(withDesc, products.length)})`)
  console.log(`Pre-Owned:                               ${preOwned}`)
  console.log()
  console.log('Top brands by SKU count:')
  for (const [brand, rows] of sortedBrands.slice(0, 15)) {
    const seed = SEED_BRANDS.has(brand) ? '✓ in seed' : '✗ NOT in seed (needs domain map)'
    console.log(`  ${brand.padEnd(22)} ${rows.length.toString().padStart(4)}    ${seed}`)
  }
  console.log()

  // ─── Pick candidates ───────────────────────────────────────────────
  const picks = new Map<string, Candidate>()

  // a) Top 3 brands: 2 enriched each (test "did Claude get it right?")
  for (const [brand, rows] of sortedBrands.slice(0, 3)) {
    const enrichedRows = rows.filter(r => r.enriched_at)
    enrichedRows.slice(0, 2).forEach(p =>
      addReason(picks, p, `top-brand (${brand}) — enriched, audit AI quality`)
    )
  }

  // b) Top 3 brands: 1 NOT enriched each (clean slate)
  for (const [brand, rows] of sortedBrands.slice(0, 3)) {
    const fresh = rows.filter(r => !r.enriched_at)
    fresh.slice(0, 1).forEach(p =>
      addReason(picks, p, `top-brand (${brand}) — never enriched, baseline test`)
    )
  }

  // c) Obscure brands (≤3 SKUs total)
  const obscure = sortedBrands.filter(([, rows]) => rows.length <= 3).slice(0, 4)
  for (const [brand, rows] of obscure) {
    rows.slice(0, 1).forEach(p =>
      addReason(picks, p, `obscure brand (${brand}) — long-tail accuracy test`)
    )
  }

  // d) Brands NOT in seed list (no brand_domain → tests search fallback)
  const offSeed = sortedBrands.filter(([brand]) => !SEED_BRANDS.has(brand))
  for (const [brand, rows] of offSeed.slice(0, 3)) {
    rows.slice(0, 1).forEach(p =>
      addReason(picks, p, `brand not in seed (${brand}) — fallback search test`)
    )
  }

  // e) Pre-owned items
  const preOwnedRows = products.filter(p => p.condition === 'Pre-Owned')
  preOwnedRows.slice(0, 2).forEach(p =>
    addReason(picks, p, 'pre-owned — discontinued-detection candidate')
  )

  // f) Enriched but missing image (likely the AI found wrong/no page)
  const enrichedNoImg = products.filter(p => p.enriched_at && !p.image_url)
  enrichedNoImg.slice(0, 3).forEach(p =>
    addReason(picks, p, 'enriched but no image — likely wrong page')
  )

  // g) High-ticket items (top 3 by price among enriched) — easy to spot bad copy
  const expensiveEnriched = products
    .filter(p => p.enriched_at && p.list_price_cents > 0)
    .sort((a, b) => b.list_price_cents - a.list_price_cents)
    .slice(0, 3)
  expensiveEnriched.forEach(p =>
    addReason(picks, p, `high-ticket ($${(p.list_price_cents / 100).toFixed(0)}) — high stakes if wrong`)
  )

  const candidates = Array.from(picks.values())

  // ─── Output ────────────────────────────────────────────────────────
  const outPath = path.join(__dirname, '..', 'sample-candidates.json')

  const output = candidates.map(c => ({
    id: c.id,
    make: c.make,
    part_number: c.part_number,
    category: c.category,
    condition: c.condition,
    display_name_current: c.display_name,
    short_description_current: c.short_description,
    list_price_cents: c.list_price_cents,
    image_url: c.image_url,
    flags: {
      enriched: !!c.enriched_at,
      has_image: !!c.image_url,
      has_description: !!c.description,
      brand_in_seed: SEED_BRANDS.has(c.make),
    },
    selection_reasons: c._reasons,
  }))

  fs.writeFileSync(outPath, JSON.stringify(output, null, 2))

  console.log(`═══ ${candidates.length} sample candidates ═══`)
  for (const c of output) {
    const flags = [
      c.flags.enriched   ? 'E' : '-',
      c.flags.has_image  ? 'I' : '-',
      c.flags.has_description ? 'D' : '-',
      c.flags.brand_in_seed ? 'S' : '-',
    ].join('')
    const title = `${c.make} ${c.part_number}`
    console.log(`  [${flags}] ${title.padEnd(36)} ${c.selection_reasons[0]}`)
  }
  console.log()
  console.log('Flag legend: E=enriched · I=has image · D=has description · S=brand in seed list')
  console.log(`\nWritten to: ${outPath}`)
  console.log('Review the JSON and tell me which ~10 to use (or "use the first 10", or "swap X for Y").')
}

function pct(n: number, total: number): string {
  return total === 0 ? '0%' : `${Math.round((100 * n) / total)}%`
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
