/**
 * Import products from Flyntlok CSV export into Supabase.
 * Run: npm run import -- --file=path/to/export.csv
 *
 * Logic:
 * - Deduplicates by make + model (one product row per unique combo)
 * - Upserts: creates new products, updates inventory counts on existing ones
 * - Sets availability badge based on units_available + units_on_order
 * - Skips rows with null/empty categories (Parts, Miscellaneous, etc.)
 */

import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'
import { cleanCategory, makeBaseSlug, CATEGORY_MAP } from '../src/lib/types'

// Load env from .env.local
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// --- CSV Row shape from Flyntlok export ---
interface FlyntlokRow {
  'Allow Rent': string
  Make: string
  Model: string
  Description: string | null
  'Machine ID': string
  Status: string
  'Serial Number': string
  'Acquisition Type': string
  Comments: string | null
  'List Price': number | string
  'Primary Class': string
  Floored: string
  'Paid Off': string
}

// Parse Excel/CSV via xlsx library
function parseFile(filePath: string): FlyntlokRow[] {
  const XLSX = require('xlsx')
  const wb = XLSX.readFile(filePath)
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws)
}

function deriveAvailability(unitsAvail: number, unitsOnOrder: number): string {
  if (unitsAvail > 0) return 'in_stock'
  if (unitsOnOrder > 0) return 'on_order'
  return 'available_to_order'
}

async function main() {
  const args = process.argv.slice(2)
  const fileArg = args.find(a => a.startsWith('--file='))
  const filePath = fileArg
    ? fileArg.replace('--file=', '')
    : path.join(__dirname, '..', '..', 'data', 'catalog_products.csv')

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`)
    process.exit(1)
  }

  console.log(`\nReading: ${filePath}`)
  const rows: FlyntlokRow[] = parseFile(filePath)
  console.log(`Raw rows: ${rows.length}`)

  // ---- Aggregate by make + part_number ----
  // Flyntlok's CSV column header is "Model" but the value is a SKU / part number.
  const productMap = new Map<string, {
    make: string
    part_number: string
    category: string
    condition: string
    list_price_cents: number
    units_available: number
    units_on_order: number
  }>()

  let skipped = 0

  for (const row of rows) {
    const make = (row.Make || '').trim()
    const part_number = (row.Model || '').trim()
    const primaryClass = (row['Primary Class'] || '').trim()
    const status = (row.Status || '').trim()

    if (!make || !part_number) { skipped++; continue }

    // Skip non-product categories
    const category = cleanCategory(primaryClass)
    if (!category) { skipped++; continue }

    const key = `${make.toLowerCase()}||${part_number.toLowerCase()}`
    const price = typeof row['List Price'] === 'number'
      ? Math.round(row['List Price'] * 100)
      : 0

    const existing = productMap.get(key)
    if (!existing) {
      productMap.set(key, {
        make,
        part_number,
        category,
        condition: row['Acquisition Type'] === 'New' ? 'New' : 'Pre-Owned',
        list_price_cents: price,
        units_available: status === 'Avail' ? 1 : 0,
        units_on_order: status === 'OnOrder' ? 1 : 0,
      })
    } else {
      if (status === 'Avail') existing.units_available++
      if (status === 'OnOrder') existing.units_on_order++
      if (price > 0 && existing.list_price_cents === 0) existing.list_price_cents = price
    }
  }

  const products = Array.from(productMap.values())
  console.log(`Unique products to upsert: ${products.length}`)
  console.log(`Rows skipped (no category/make/model): ${skipped}`)

  // ---- Upsert into Supabase ----
  let created = 0, updated = 0, errors = 0

  const BATCH = 50
  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH)

    const upsertRows = batch.map(p => ({
      make: p.make,
      part_number: p.part_number,
      slug: makeBaseSlug(p.make, p.part_number),
      category: p.category,
      condition: p.condition,
      list_price_cents: p.list_price_cents,
      units_available: p.units_available,
      units_on_order: p.units_on_order,
      availability: deriveAvailability(p.units_available, p.units_on_order),
      source: 'inventory',
      is_active: true,
    }))

    const { data, error } = await supabase
      .from('products')
      .upsert(upsertRows, {
        onConflict: 'slug',
        ignoreDuplicates: false,
      })
      .select('id')

    if (error) {
      console.error(`Batch ${i}-${i + BATCH} error:`, error.message)
      errors += batch.length
    } else {
      // Rough count (upsert doesn't distinguish create vs update easily)
      created += data?.length || 0
      process.stdout.write(`\r  Progress: ${Math.min(i + BATCH, products.length)}/${products.length}`)
    }
  }

  console.log(`\n\nDone!`)
  console.log(`  Upserted: ${created}`)
  console.log(`  Errors:   ${errors}`)

  // ---- Log the import ----
  await supabase.from('import_log').insert({
    filename: path.basename(filePath),
    rows_total: rows.length,
    rows_created: created,
    rows_updated: 0,
    rows_skipped: skipped,
    notes: `Import from ${new Date().toISOString()}`,
  })

  console.log(`  Import logged in Supabase.\n`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
