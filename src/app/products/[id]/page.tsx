import { supabase } from '@/lib/supabase'
import type { Product } from '@/lib/types'
import { formatPrice, availabilityLabel, availabilityColor } from '@/lib/types'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

async function getProduct(id: string): Promise<Product | null> {
  // Try by slug first, then by UUID
  const { data: bySlug } = await supabase
    .from('products')
    .select('*')
    .eq('slug', id)
    .single()
  if (bySlug) return bySlug as Product

  const { data: byId } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .single()
  return byId as Product | null
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const product = await getProduct(id)
  if (!product) return {}
  return {
    title: `${product.display_name || `${product.make} ${product.model}`} | Ready Equipment`,
    description: product.short_description || `${product.make} ${product.model} — available from Ready Equipment in Meredith, NH.`,
  }
}

export default async function ProductPage({ params }: Props) {
  const { id } = await params
  const product = await getProduct(id)
  if (!product) notFound()

  const badgeColor = availabilityColor(product.availability)
  const availLabel = availabilityLabel(product.availability)
  const allImages = [
    ...(product.image_url ? [product.image_url] : []),
    ...(product.images || []).filter(img => img !== product.image_url),
  ]

  const specEntries = Object.entries(product.specs || {})

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/" className="hover:text-[#1d5fa0]">All Products</Link>
        <span>/</span>
        <Link href={`/?category=${encodeURIComponent(product.category)}`} className="hover:text-[#1d5fa0]">
          {product.category}
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{product.model}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">

        {/* Image */}
        <div>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden aspect-square relative">
            {allImages.length > 0 ? (
              <Image
                src={allImages[0]}
                alt={product.display_name || `${product.make} ${product.model}`}
                fill
                className="object-contain p-6"
                sizes="(max-width: 1024px) 100vw, 50vw"
                priority
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-300">
                <svg className="w-20 h-20 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm">Photo coming soon</p>
              </div>
            )}
          </div>

          {/* Thumbnail strip */}
          {allImages.length > 1 && (
            <div className="flex gap-2 mt-3">
              {allImages.slice(0, 4).map((img, i) => (
                <div key={i} className="w-16 h-16 bg-white border border-gray-200 rounded-lg overflow-hidden relative">
                  <Image src={img} alt="" fill className="object-contain p-1" sizes="64px" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div>
          <div className="text-sm font-semibold text-[#1d5fa0] uppercase tracking-wide mb-1">
            {product.make}
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 leading-tight mb-2">
            {product.display_name || `${product.make} ${product.model}`}
          </h1>
          <div className="text-sm text-gray-500 mb-4">Model # {product.model}</div>

          {/* Availability + condition */}
          <div className="flex items-center gap-2 mb-5">
            <span className={`badge ${badgeColor}`}>{availLabel}</span>
            {product.condition !== 'New' && (
              <span className="badge bg-amber-100 text-amber-800">{product.condition}</span>
            )}
            {product.units_available > 1 && (
              <span className="text-xs text-gray-500">{product.units_available} in stock</span>
            )}
          </div>

          {/* Price */}
          <div className="text-3xl font-black text-gray-900 mb-5">
            {formatPrice(product.list_price_cents)}
          </div>

          {/* Description */}
          {product.description && (
            <p className="text-gray-600 text-sm leading-relaxed mb-6">{product.description}</p>
          )}

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <a href="tel:16032793322" className="btn-primary justify-center sm:justify-start">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
              </svg>
              Call (603) 279-3322
            </a>
            <a
              href={`https://www.readyeq.com/contact-us?product=${encodeURIComponent(`${product.make} ${product.model}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary justify-center sm:justify-start"
            >
              Request a Quote
            </a>
          </div>

          {/* Specs table */}
          {specEntries.length > 0 && (
            <div>
              <h2 className="font-bold text-gray-900 text-sm uppercase tracking-wide mb-3">Specifications</h2>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {specEntries.map(([key, value], i) => (
                      <tr key={key} className={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                        <td className="px-4 py-2.5 font-medium text-gray-700 w-2/5">{key}</td>
                        <td className="px-4 py-2.5 text-gray-600">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Features */}
          {product.features && product.features.length > 0 && (
            <div className="mt-6">
              <h2 className="font-bold text-gray-900 text-sm uppercase tracking-wide mb-3">Key Features</h2>
              <ul className="space-y-1.5">
                {product.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                    <svg className="w-4 h-4 text-[#1d5fa0] mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Back link */}
      <div className="mt-12 pt-8 border-t border-gray-200">
        <Link href="/" className="text-sm text-[#1d5fa0] hover:underline flex items-center gap-1">
          ← Back to all products
        </Link>
      </div>
    </div>
  )
}
