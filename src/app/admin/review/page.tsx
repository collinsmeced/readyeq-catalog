import { isAdminAuthed } from '@/lib/auth-cookie'
import { db } from '@/lib/db'
import ReviewWorkspace, { type QueueItem } from './ReviewWorkspace'
import AdminLogin from './AdminLogin'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export const metadata = {
  title: 'Review Queue · Ready Equipment Admin',
}

export default async function ReviewPage() {
  if (!(await isAdminAuthed())) {
    return <AdminLogin />
  }

  // Fetch queue: enriched (need review) + flagged (discontinued candidates)
  // Approved/rejected items stay out of the queue but are reachable via the
  // "find any product" path inside the workspace.
  const { rows: queue } = await db().query<QueueItem>(`
    SELECT
      id, make, part_number, series, display_name, short_description,
      description, COALESCE(specs, '{}'::jsonb) AS specs,
      COALESCE(features, ARRAY[]::text[]) AS features,
      category, list_price_cents, availability, condition,
      image_url, source_url, source_snapshot,
      review_status, is_active,
      COALESCE(enrichment_log, '[]'::jsonb) AS enrichment_log,
      COALESCE(human_edited_fields, ARRAY[]::text[]) AS human_edited_fields,
      enriched_at, updated_at
    FROM products
    WHERE review_status IN ('enriched', 'flagged')
    ORDER BY
      CASE review_status WHEN 'enriched' THEN 0 ELSE 1 END,
      make, part_number
  `)

  const { rows: counts } = await db().query<{ status: string; n: number }>(`
    SELECT review_status AS status, COUNT(*)::int AS n
    FROM products
    GROUP BY review_status
  `)

  const totals = counts.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = r.n
    return acc
  }, {})

  return <ReviewWorkspace queue={queue} totals={totals} />
}
