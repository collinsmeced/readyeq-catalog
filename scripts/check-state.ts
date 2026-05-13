/**
 * Read-only snapshot of DB + live-site state.
 * Tells us where things stand before/after the migration.
 * Run: npx ts-node --project tsconfig.scripts.json scripts/check-state.ts
 */

import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(url, anon)

async function main() {
  console.log('═══ Pre/Post migration state ═══\n')

  // 1. Probe schema: does part_number exist yet?
  const probePart = await supabase.from('products').select('part_number').limit(1)
  const probeModel = await supabase.from('products').select('model' as any).limit(1)
  const probeSeries = await supabase.from('products').select('series' as any).limit(1)
  const probeReview = await supabase.from('products').select('review_status' as any).limit(1)
  const probeBrands = await supabase.from('manufacturer_brands' as any).select('brand').limit(1)

  console.log('Schema probe:')
  console.log(`  products.part_number      ${probePart.error  ? '❌ ' + probePart.error.message  : '✓ exists'}`)
  console.log(`  products.model            ${probeModel.error ? '❌ ' + probeModel.error.message : '✓ exists (pre-migration)'}`)
  console.log(`  products.series           ${probeSeries.error ? '❌ ' + probeSeries.error.message : '✓ exists'}`)
  console.log(`  products.review_status    ${probeReview.error ? '❌ ' + probeReview.error.message : '✓ exists'}`)
  console.log(`  manufacturer_brands table ${probeBrands.error ? '❌ ' + probeBrands.error.message : '✓ exists'}`)
  console.log()

  // 2. Row counts
  const { count: total } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
  console.log(`Products total:    ${total}`)

  // 3. If review_status exists, distribution (avoid typed .eq() — TS chokes)
  if (!probeReview.error) {
    const { data } = await supabase
      .from('products')
      .select('review_status' as any) as any
    const dist: Record<string, number> = {}
    for (const r of (data || [])) {
      const s = r.review_status || 'null'
      dist[s] = (dist[s] || 0) + 1
    }
    console.log('  review_status distribution:')
    for (const [s, n] of Object.entries(dist).sort()) {
      console.log(`    ${s.padEnd(13)} ${n}`)
    }
  }

  // 4. If manufacturer_brands exists, count
  if (!probeBrands.error) {
    const { count } = await supabase
      .from('manufacturer_brands' as any)
      .select('*', { count: 'exact', head: true })
    console.log(`\nManufacturer_brands: ${count} rows`)
  }
  console.log()

  // 5. Live site probe
  console.log('Live site probe:')
  try {
    const res = await fetch('https://readyeq-catalog.vercel.app/', { signal: AbortSignal.timeout(15000) })
    console.log(`  HTTP ${res.status} from readyeq-catalog.vercel.app`)
    if (res.ok) {
      const html = await res.text()
      const productCount = (html.match(/View Details/g) || []).length
      console.log(`  Found ~${productCount} product cards rendered`)
    }
  } catch (e: any) {
    console.log(`  fetch error: ${e?.message}`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
