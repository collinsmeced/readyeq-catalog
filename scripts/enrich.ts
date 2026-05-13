/**
 * AI Enrichment Script
 * Populates display_name, short_description, description, specs, features, image_url
 * for all unenriched products in Supabase.
 *
 * Run: bun scripts/enrich.ts
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

// Load .env.local
const envFile = Bun.file(`${import.meta.dir}/../.env.local`)
const envText = await envFile.text()
for (const line of envText.split('\n')) {
  const [key, ...rest] = line.split('=')
  if (key && rest.length) process.env[key.trim()] = rest.join('=').trim()
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// NOTE: This is the legacy memory-grounded enrichment script. It will be
// replaced wholesale by the v1.4 web-grounded pipeline in Phase 1.
// Kept here only to keep the existing npm script working in the interim.
interface Product {
  id: string
  make: string
  part_number: string
  category: string
  condition: string
  list_price_cents: number
}

interface Enrichment {
  display_name: string
  short_description: string
  description: string
  specs: Record<string, string>
  features: string[]
  product_page_url: string | null
}

async function enrichProduct(p: Product): Promise<Enrichment> {
  const price = p.list_price_cents > 0
    ? `$${(p.list_price_cents / 100).toFixed(0)}`
    : 'unknown price'

  const prompt = `You are building a product catalog for Ready Equipment, an authorized dealer in Meredith, NH.

Product:
- Make: ${p.make}
- Part #: ${p.part_number}
- Category: ${p.category}
- Condition: ${p.condition}
- List Price: ${price}

Based on your knowledge of this product, return a JSON object with these exact fields:
{
  "display_name": "Brand Model DescriptiveName (e.g. Husqvarna 572XP Professional Chainsaw)",
  "short_description": "1-2 sentences, under 80 words. Focus on who it's for and key benefit.",
  "description": "3-4 sentences, 100-150 words. Marketing copy for a dealer site. Highlight performance, use case, and why someone would buy it.",
  "specs": {
    "Key Spec": "Value with units",
    ... 5-8 most important specs for this product type
  },
  "features": [
    "Key feature or selling point",
    ... 4-5 features
  ],
  "product_page_url": "URL to this exact product on the manufacturer's official website, or null if unsure"
}

Rules:
- If you don't know the exact specs, use realistic typical specs for this model
- product_page_url must be a direct product page URL, not a search or category page
- Return ONLY valid JSON, no markdown, no explanation`

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  try {
    // Strip markdown code fences if present
    const clean = text.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim()
    return JSON.parse(clean)
  } catch {
    console.error(`  Parse error for ${p.make} ${p.part_number}:`, text.slice(0, 100))
    return {
      display_name: `${p.make} ${p.part_number}`,
      short_description: `${p.make} ${p.part_number} — available from Ready Equipment in Meredith, NH.`,
      description: `The ${p.make} ${p.part_number} is available at Ready Equipment. Contact us for specifications and pricing.`,
      specs: {},
      features: [],
      product_page_url: null
    }
  }
}

async function fetchOgImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; catalog-enrichment/1.0)' },
      signal: AbortSignal.timeout(8000)
    })
    if (!res.ok) return null
    const html = await res.text()

    // Try og:image first
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
    if (ogMatch) return ogMatch[1]

    // Try twitter:image
    const twitterMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
    if (twitterMatch) return twitterMatch[1]

    return null
  } catch {
    return null
  }
}

async function processProduct(p: Product): Promise<void> {
  try {
    const enrichment = await enrichProduct(p)

    // Try to get image from product page
    let imageUrl: string | null = null
    if (enrichment.product_page_url) {
      imageUrl = await fetchOgImage(enrichment.product_page_url)
    }

    const { error } = await supabase
      .from('products')
      .update({
        display_name: enrichment.display_name,
        short_description: enrichment.short_description,
        description: enrichment.description,
        specs: enrichment.specs,
        features: enrichment.features,
        image_url: imageUrl,
        enriched_at: new Date().toISOString()
      })
      .eq('id', p.id)

    if (error) {
      console.error(`  DB error for ${p.make} ${p.part_number}:`, error.message)
    } else {
      const imgStatus = imageUrl ? '📸' : '  '
      console.log(`  ${imgStatus} ${enrichment.display_name}`)
    }
  } catch (err: any) {
    console.error(`  Error enriching ${p.make} ${p.part_number}:`, err.message)
  }
}

async function main() {
  console.log('\n🔍 Fetching unenriched products...')

  const { data: products, error } = await supabase
    .from('products')
    .select('id, make, part_number, category, condition, list_price_cents')
    .is('enriched_at', null)
    .eq('is_active', true)
    .order('make')

  if (error) { console.error('Failed to fetch products:', error.message); process.exit(1) }
  if (!products?.length) { console.log('All products already enriched!'); process.exit(0) }

  console.log(`Found ${products.length} products to enrich\n`)

  const CONCURRENCY = 5  // parallel requests
  let done = 0

  for (let i = 0; i < products.length; i += CONCURRENCY) {
    const batch = products.slice(i, i + CONCURRENCY)
    await Promise.all(batch.map(p => processProduct(p as Product)))
    done += batch.length
    console.log(`\n  ── ${done}/${products.length} done ──\n`)
  }

  // Final count
  const { count } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .not('enriched_at', 'is', null)

  console.log(`\n✅ Enrichment complete. ${count} products now have AI content.\n`)
}

main().catch(err => { console.error(err); process.exit(1) })
