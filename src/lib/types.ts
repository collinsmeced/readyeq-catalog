export type Availability = 'in_stock' | 'on_order' | 'available_to_order' | 'discontinued'
export type Condition = 'New' | 'Pre-Owned' | 'Trade-In'
export type ProductSource = 'inventory' | 'catalog'
export type ReviewStatus = 'unreviewed' | 'enriched' | 'approved' | 'flagged' | 'rejected'

export interface EnrichmentAttempt {
  at: string                    // ISO timestamp
  source_url: string | null
  confidence: 'high' | 'medium' | 'low'
  confidence_notes: string
  ok: boolean
  error?: string
}

export interface Product {
  id: string
  make: string
  part_number: string             // RENAMED from `model` in migration 002
  series: string | null           // NEW — marketing family name (e.g. "TimeMaster")
  display_name: string | null
  slug: string | null
  legacy_slugs: string[]          // NEW — for SEO-stable redirects when slug format changes
  description: string | null
  short_description: string | null
  specs: Record<string, string>
  features: string[]
  category: string
  tags: string[]
  units_available: number
  units_on_order: number
  availability: Availability
  list_price_cents: number
  condition: Condition
  source: ProductSource
  image_url: string | null
  images: string[]

  // Review workflow (NEW in migration 002)
  review_status: ReviewStatus
  source_url: string | null
  source_snapshot: string | null
  human_edited_fields: string[]
  approved_at: string | null
  approved_by: string | null
  enrichment_log: EnrichmentAttempt[]

  is_featured: boolean
  is_active: boolean
  enriched_at: string | null
  created_at: string
  updated_at: string
}

export interface ManufacturerBrand {
  brand: string
  domain: string
  aliases: string[]
  search_template: string | null
  notes: string | null
  added_at: string
  updated_at: string
}

export interface ImportLog {
  id: string
  imported_at: string
  filename: string | null
  rows_total: number
  rows_created: number
  rows_updated: number
  rows_skipped: number
  notes: string | null
}

// Category display names (cleaned from Flyntlok Primary Class)
export const CATEGORY_MAP: Record<string, string> = {
  'Battery Powered Sales': 'Battery Powered',
  'Trimmer & Attachment Sales': 'Trimmers & Attachments',
  'Zero Turn Mower Sales': 'Zero Turn Mowers',
  'Chainsaw Sales': 'Chainsaws',
  'Chainsaws & Polesaws': 'Chainsaws',
  'Leaf Blower & Debris Loader Sales': 'Leaf Blowers',
  'Walk Behind Mower Sales': 'Walk Behind Mowers',
  'Concrete / Asphalt Saw Sales': 'Concrete & Asphalt Saws',
  'Concrete & Tile': 'Concrete & Asphalt Saws',
  'Compactor Sales': 'Compactors',
  'Pump & Hose Sales': 'Pumps & Hoses',
  'Pumps & Hoses': 'Pumps & Hoses',
  'Snowblower Sales': 'Snowblowers',
  'Generator Sales': 'Generators',
  'Heater Sales': 'Heaters',
  'Heaters': 'Heaters',
  'Drill & Breaker Sales': 'Drills & Breakers',
  'Polesaw Sales': 'Pole Saws',
  'Hedge Trimmer Sales': 'Hedge Trimmers',
  'Pre Owned Equipment Sales': 'Pre-Owned Equipment',
  'Lawn Tractor Sales': 'Lawn Tractors',
  'Handheld Equipment Sales X?': 'Handheld Equipment',
  'Stander Blower Sales': 'Stander Blowers',
  'Stander Mower Sales': 'Stander Mowers',
  'Log Splitter Sales': 'Log Splitters',
  'Pressure Washers': 'Pressure Washers',
  'Brush & Tree Equipment Sales': 'Brush & Tree Equipment',
  'Fertilizer / Aeration Sales': 'Lawn Care',
  'Accessories Sales': 'Accessories',
  'Landscaping': 'Landscaping',
  'Lawn Mower Services': null as unknown as string,  // skip
  'Parts': null as unknown as string,                // skip
  'Miscellaneous': null as unknown as string,        // skip
}

export function cleanCategory(raw: string): string | null {
  if (raw in CATEGORY_MAP) return CATEGORY_MAP[raw]
  // Strip common suffixes
  return raw.replace(/ Sales$/, '').replace(/ Inc\.$/, '').trim() || null
}

export function formatPrice(cents: number): string {
  if (!cents || cents === 0) return 'Call for pricing'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

export function availabilityLabel(a: Availability): string {
  switch (a) {
    case 'in_stock': return 'In Stock'
    case 'on_order': return 'On Order'
    case 'available_to_order': return 'Available to Order'
    case 'discontinued': return 'Discontinued'
  }
}

export function availabilityColor(a: Availability): string {
  switch (a) {
    case 'in_stock': return 'bg-green-100 text-green-800'
    case 'on_order': return 'bg-yellow-100 text-yellow-800'
    case 'available_to_order': return 'bg-blue-100 text-blue-800'
    case 'discontinued': return 'bg-gray-100 text-gray-500'
  }
}

// Base slug: just make + part_number. Stable identifier — does not change
// when series is added later. Existing rows in the DB use this format.
export function makeBaseSlug(make: string, part_number: string): string {
  return `${make}-${part_number}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// SEO slug: includes series when known (e.g. "toro-timemaster-77502").
// Used for new rows and Phase 5 slug regeneration. Old slug saved in
// legacy_slugs[] when this is adopted, so existing links never 404.
export function makeSeoSlug(make: string, series: string | null, part_number: string): string {
  const parts = [make, series, part_number].filter(Boolean) as string[]
  return parts.join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Back-compat alias — existing callers use makeSlug(make, model).
// Behavior is identical to makeBaseSlug. Remove once all callers migrate.
export const makeSlug = makeBaseSlug
