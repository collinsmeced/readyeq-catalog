export type Availability = 'in_stock' | 'on_order' | 'available_to_order' | 'discontinued'
export type Condition = 'New' | 'Pre-Owned' | 'Trade-In'
export type ProductSource = 'inventory' | 'catalog'

export interface Product {
  id: string
  make: string
  model: string
  display_name: string | null
  slug: string | null
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
  is_featured: boolean
  is_active: boolean
  enriched_at: string | null
  created_at: string
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

export function makeSlug(make: string, model: string): string {
  return `${make}-${model}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
