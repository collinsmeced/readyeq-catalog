import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cleanCategory, makeSlug } from '@/lib/types'

function deriveAvailability(avail: number, onOrder: number): string {
  if (avail > 0) return 'in_stock'
  if (onOrder > 0) return 'on_order'
  return 'available_to_order'
}

function parseXlsx(buffer: ArrayBuffer) {
  // Dynamic import to keep bundle size down
  const XLSX = require('xlsx')
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]
}

export async function POST(req: NextRequest) {
  // Auth check
  const formData = await req.formData()
  const password = formData.get('password') as string
  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  let rows: Record<string, unknown>[]

  try {
    rows = parseXlsx(buffer)
  } catch {
    return NextResponse.json({ error: 'Could not parse file. Upload a .xlsx, .xls, or .csv.' }, { status: 400 })
  }

  // Aggregate by make + model
  const productMap = new Map<string, {
    make: string; model: string; category: string; condition: string
    list_price_cents: number; units_available: number; units_on_order: number
  }>()

  let skipped = 0

  for (const row of rows) {
    const make = String(row['Make'] || '').trim()
    const model = String(row['Model'] || '').trim()
    const primaryClass = String(row['Primary Class'] || '').trim()
    const status = String(row['Status'] || '').trim()
    const acquisitionType = String(row['Acquisition Type'] || '').trim()

    if (!make || !model) { skipped++; continue }

    const category = cleanCategory(primaryClass)
    if (!category) { skipped++; continue }

    const key = `${make.toLowerCase()}||${model.toLowerCase()}`
    const rawPrice = row['List Price']
    const price = typeof rawPrice === 'number' ? Math.round(rawPrice * 100) : 0

    const existing = productMap.get(key)
    if (!existing) {
      productMap.set(key, {
        make, model, category,
        condition: acquisitionType === 'New' ? 'New' : 'Pre-Owned',
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
  const db = supabaseAdmin()

  let created = 0, updated = 0, errors: string[] = []
  const BATCH = 50

  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH)
    const upsertRows = batch.map(p => ({
      make: p.make,
      model: p.model,
      slug: makeSlug(p.make, p.model),
      category: p.category,
      condition: p.condition,
      list_price_cents: p.list_price_cents,
      units_available: p.units_available,
      units_on_order: p.units_on_order,
      availability: deriveAvailability(p.units_available, p.units_on_order),
      source: 'inventory',
      is_active: true,
    }))

    const { data, error } = await db
      .from('products')
      .upsert(upsertRows, { onConflict: 'slug', ignoreDuplicates: false })
      .select('id')

    if (error) {
      errors.push(`Batch ${i}: ${error.message}`)
    } else {
      created += data?.length || 0
    }
  }

  // Log it
  await db.from('import_log').insert({
    filename: file.name,
    rows_total: rows.length,
    rows_created: created,
    rows_updated: updated,
    rows_skipped: skipped,
    notes: `Web import ${new Date().toISOString()}`,
  })

  return NextResponse.json({
    created,
    updated,
    skipped,
    total: rows.length,
    errors,
  })
}
