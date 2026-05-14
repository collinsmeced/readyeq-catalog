'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth-cookie'
import { db } from '@/lib/db'
import { enrichProduct, passesAutoApprovalGate, type Enrichment } from '@/lib/enrichment'

// Note: server-action timeout is set via maxDuration on the route segment
// (src/app/admin/review/page.tsx) — can't export it from a 'use server' file.

// ─── Approve ─────────────────────────────────────────────────────────────
// Marks product approved + active. Used both for "looks good as-is" and
// after edits — actually if there were edits, the save action ran first.
export async function approveProduct(productId: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin()
  try {
    await db().query(
      `UPDATE products
       SET review_status='approved',
           approved_at = NOW(),
           approved_by = 'human',
           is_active = true
       WHERE id = $1`,
      [productId],
    )
    revalidatePath('/admin/review')
    revalidatePath('/')
    revalidatePath(`/products/${productId}`)
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'approve failed' }
  }
}

// ─── Reject ──────────────────────────────────────────────────────────────
// Hide from live catalog. Status='rejected', is_active=false. Reviewer
// usually picks this for products that don't belong in the catalog at all.
export async function rejectProduct(productId: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin()
  try {
    await db().query(
      `UPDATE products
       SET review_status='rejected',
           is_active = false,
           approved_at = NULL,
           approved_by = NULL
       WHERE id = $1`,
      [productId],
    )
    revalidatePath('/admin/review')
    revalidatePath('/')
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'reject failed' }
  }
}

// ─── Flag ────────────────────────────────────────────────────────────────
// Set aside, deal with later. Stays out of approved/rejected counts.
export async function flagProduct(productId: string, notes?: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin()
  try {
    if (notes) {
      await db().query(
        `UPDATE products
         SET review_status='flagged',
             enrichment_log = enrichment_log || $2::jsonb
         WHERE id = $1`,
        [productId, JSON.stringify([{ at: new Date().toISOString(), kind: 'flag-note', note: notes }])],
      )
    } else {
      await db().query(
        `UPDATE products SET review_status='flagged' WHERE id = $1`,
        [productId],
      )
    }
    revalidatePath('/admin/review')
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'flag failed' }
  }
}

// ─── Save edits ──────────────────────────────────────────────────────────
// Updates the editable fields. Tracks which fields the human touched so
// future re-enrichments don't clobber human edits.
export interface EditableFields {
  display_name?: string | null
  series?: string | null
  short_description?: string | null
  description?: string | null
  specs?: Record<string, string>
  features?: string[]
  image_url?: string | null
  source_url?: string | null
}

export async function saveEdits(
  productId: string,
  edits: EditableFields,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin()
  try {
    const cleanedEntries = Object.entries(edits).filter(([, v]) => v !== undefined)
    if (cleanedEntries.length === 0) return { ok: true }

    const setParts: string[] = []
    const vals: any[] = []
    let i = 1
    for (const [k, v] of cleanedEntries) {
      // JSON columns need explicit stringification
      if (k === 'specs') {
        setParts.push(`${k} = $${i}::jsonb`)
        vals.push(JSON.stringify(v))
      } else {
        setParts.push(`${k} = $${i}`)
        vals.push(v)
      }
      i++
    }

    // Track human-edited fields (use array_cat + DISTINCT semantics via subquery)
    const editedFieldNames = cleanedEntries.map(([k]) => k)
    setParts.push(`human_edited_fields = (
      SELECT ARRAY(SELECT DISTINCT unnest(human_edited_fields || $${i}::text[]))
    )`)
    vals.push(editedFieldNames)
    i++

    vals.push(productId)
    await db().query(
      `UPDATE products SET ${setParts.join(', ')} WHERE id = $${i}`,
      vals,
    )

    revalidatePath('/admin/review')
    revalidatePath(`/products/${productId}`)
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'save failed' }
  }
}

// ─── Re-enrich ───────────────────────────────────────────────────────────
// Re-runs the v1.4 Claude pipeline on this one product. Writes results
// the same way bulk-enrich does (auto-approves if it now passes the gate).
export async function reenrichProduct(
  productId: string,
  options?: { starting_url?: string },
): Promise<{
  ok: boolean
  error?: string
  result?: {
    confidence: string
    passesGate: boolean
    reviewStatus: string
    confidence_notes: string
    extractedAnything: boolean    // false when Claude's content fields are all empty
                                  // (e.g. JS-rendered page that web_fetch can't read)
  }
}> {
  await requireAdmin()
  try {
    // 1. Fetch the product + resolve brand domain
    const { rows } = await db().query<any>(`
      SELECT p.id, p.make, p.part_number, p.category, p.list_price_cents,
             p.display_name, p.short_description, p.description,
             COALESCE(p.specs, '{}'::jsonb) AS specs,
             COALESCE(p.features, ARRAY[]::text[]) AS features,
             p.image_url, p.series, p.source_url,
             COALESCE(p.enrichment_log, '[]'::jsonb) AS enrichment_log,
             COALESCE(p.human_edited_fields, ARRAY[]::text[]) AS human_edited_fields,
             mb.domain AS brand_domain
      FROM products p
      LEFT JOIN manufacturer_brands mb ON (
        LOWER(mb.brand) = LOWER(p.make)
        OR LOWER(p.make) = ANY(SELECT LOWER(unnest(mb.aliases)))
      )
      WHERE p.id = $1
      LIMIT 1
    `, [productId])
    if (rows.length === 0) return { ok: false, error: 'product not found' }
    const row = rows[0]

    // 2. Call Claude (optionally with a user-provided starting URL)
    const result = await enrichProduct({
      make: row.make,
      part_number: row.part_number,
      category_hint: row.category,
      price_cents: row.list_price_cents,
      brand_domain: row.brand_domain || null,
      trusted_domain: !!row.brand_domain,
      starting_url: options?.starting_url,
    })

    // 3. Decide write — mirrors scripts/bulk-enrich.ts decideWrite()
    const newLog = [...(row.enrichment_log || []), result.attempt]
    const e = result.enrichment
    const protectedSet = new Set<string>(row.human_edited_fields ?? [])
    const writeIf = (field: string, newValue: any, oldValue: any) =>
      protectedSet.has(field) ? oldValue : newValue

    // Detect "extraction produced nothing useful" — most common when the
    // user pasted a URL on a JS-rendered SPA (shop.exmark.com, some
    // Salesforce Commerce sites). Without this, the fallback writes nothing
    // new and silently surfaces a "ready for re-review" toast — confusing.
    const extractedAnything = !!(e && (
      e.display_name?.trim() ||
      e.description?.trim() ||
      e.short_description?.trim() ||
      (e.specs && Object.keys(e.specs).length > 0) ||
      (e.features && e.features.length > 0) ||
      e.image_url?.trim()
    ))

    // If a starting_url was provided BUT extraction produced nothing,
    // log the attempt and return a clear error with Claude's reason —
    // don't pollute the product fields with a no-op "re-review" badge.
    if (options?.starting_url && e && !e.discontinued && !extractedAnything) {
      await db().query(
        `UPDATE products SET enrichment_log = $1::jsonb WHERE id = $2`,
        [JSON.stringify(newLog), productId],
      )
      return {
        ok: false,
        error: e.confidence_notes
          ? `Pulled the URL but couldn't extract anything. Claude's reason: ${e.confidence_notes}`
          : 'Pulled the URL but the page appears empty or JavaScript-rendered. web_fetch can\'t see content that loads via JS. Try a different URL (manufacturer\'s main site, not a shop/SPA).',
        result: {
          confidence: 'low',
          passesGate: false,
          reviewStatus: row.review_status,
          confidence_notes: e.confidence_notes ?? '',
          extractedAnything: false,
        },
      }
    }

    let fields: Record<string, any>
    let reason: string
    if (result.parse_error || !e) {
      fields = { enrichment_log: JSON.stringify(newLog) }
      reason = 'parse-error'
    } else if (e.discontinued) {
      fields = {
        source_url: e.source_url || row.source_url,
        review_status: 'flagged',
        is_active: false,
        enrichment_log: JSON.stringify(newLog),
        enriched_at: new Date().toISOString(),
      }
      reason = 'discontinued'
    } else if (result.passes_gate) {
      fields = {
        display_name:      writeIf('display_name',      e.display_name,      row.display_name),
        series:            writeIf('series',            e.series || null,    row.series),
        short_description: writeIf('short_description', e.short_description, row.short_description),
        description:       writeIf('description',       e.description,       row.description),
        specs:             writeIf('specs',             e.specs,             row.specs),
        features:          writeIf('features',          e.features,          row.features),
        image_url:         writeIf('image_url',         e.image_url || null, row.image_url),
        source_url:        writeIf('source_url',        e.source_url || null, row.source_url),
        review_status:     'approved',
        approved_at:       new Date().toISOString(),
        approved_by:       'auto-gate',
        enrichment_log:    JSON.stringify(newLog),
        enriched_at:       new Date().toISOString(),
      }
      reason = 'auto-approved'
    } else {
      fields = {
        display_name:      writeIf('display_name',      e.display_name      || row.display_name,      row.display_name),
        series:            writeIf('series',            e.series || null,    row.series),
        short_description: writeIf('short_description', e.short_description || row.short_description, row.short_description),
        description:       writeIf('description',       e.description       || row.description,       row.description),
        specs:             writeIf('specs',             Object.keys(e.specs).length ? e.specs : row.specs, row.specs),
        features:          writeIf('features',          e.features.length ? e.features : row.features, row.features),
        image_url:         writeIf('image_url',         e.image_url || row.image_url, row.image_url),
        source_url:        writeIf('source_url',        e.source_url || row.source_url, row.source_url),
        review_status:     'enriched',
        enrichment_log:    JSON.stringify(newLog),
        enriched_at:       new Date().toISOString(),
      }
      reason = 'enriched'
    }

    // 4. Apply UPDATE
    const setParts: string[] = []
    const vals: any[] = []
    let i = 1
    for (const [k, v] of Object.entries(fields)) {
      if (k === 'specs') {
        setParts.push(`${k} = $${i}::jsonb`)
        vals.push(JSON.stringify(v))
      } else {
        setParts.push(`${k} = $${i}`)
        vals.push(v)
      }
      i++
    }
    vals.push(productId)
    await db().query(`UPDATE products SET ${setParts.join(', ')} WHERE id = $${i}`, vals)

    revalidatePath('/admin/review')
    revalidatePath(`/products/${productId}`)

    return {
      ok: true,
      result: {
        confidence: e?.confidence ?? 'low',
        passesGate: result.passes_gate,
        reviewStatus: fields.review_status ?? 'enriched',
        confidence_notes: e?.confidence_notes ?? '',
        extractedAnything,
      },
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'reenrich failed' }
  }
}

// ─── Find any product (search) ───────────────────────────────────────────
// For the "I see something weird on the live site" workflow — find any product
// regardless of review_status and pull it into the workspace.
export async function findProduct(query: string): Promise<{ id: string; make: string; part_number: string; display_name: string | null; review_status: string }[]> {
  await requireAdmin()
  const q = query.trim()
  if (q.length < 2) return []
  const wildcard = `%${q}%`
  const { rows } = await db().query(
    `SELECT id, make, part_number, display_name, review_status
     FROM products
     WHERE make ILIKE $1
        OR part_number ILIKE $1
        OR series ILIKE $1
        OR display_name ILIKE $1
     ORDER BY make, part_number
     LIMIT 25`,
    [wildcard],
  )
  return rows
}

export async function loadProduct(productId: string): Promise<any | null> {
  await requireAdmin()
  const { rows } = await db().query(`
    SELECT id, make, part_number, series, display_name, short_description,
           description, COALESCE(specs, '{}'::jsonb) AS specs,
           COALESCE(features, ARRAY[]::text[]) AS features,
           category, list_price_cents, availability, condition,
           image_url, source_url, source_snapshot,
           review_status, is_active,
           COALESCE(enrichment_log, '[]'::jsonb) AS enrichment_log,
           COALESCE(human_edited_fields, ARRAY[]::text[]) AS human_edited_fields,
           enriched_at, updated_at
    FROM products WHERE id = $1
  `, [productId])
  return rows[0] ?? null
}
