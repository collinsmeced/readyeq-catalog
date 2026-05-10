/**
 * AI Enrichment API — Session 3
 * Populates display_name, description, short_description, specs, features, and image_url
 * for products that haven't been enriched yet.
 *
 * POST /api/enrich
 * Body: { password, limit?: number, product_id?: string }
 */

import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Enrichment pipeline is built in Session 3.
  // This stub lets the admin page wire up to this endpoint now.
  return NextResponse.json({
    message: 'AI enrichment pipeline coming in Session 3.',
    enriched: 0,
  })
}
