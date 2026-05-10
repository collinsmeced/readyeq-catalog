import { supabase } from '@/lib/supabase'
import type { Product } from '@/lib/types'
import CatalogClient from '@/components/CatalogClient'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ category?: string }>
}

export default async function HomePage({ searchParams }: Props) {
  const params = await searchParams
  const initialCategory = params.category || null

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .order('make', { ascending: true })
    .order('model', { ascending: true })

  if (error) {
    console.error('Failed to load products:', error)
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center text-gray-500">
        <p>Unable to load products. Please try again shortly.</p>
      </div>
    )
  }

  const products = (data || []) as Product[]

  return <CatalogClient products={products} initialCategory={initialCategory} />
}
