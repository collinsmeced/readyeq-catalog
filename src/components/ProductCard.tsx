import Link from 'next/link'
import Image from 'next/image'
import type { Product } from '@/lib/types'
import { formatPrice, availabilityLabel, availabilityColor } from '@/lib/types'

interface Props {
  product: Product
}

export default function ProductCard({ product }: Props) {
  const href = `/products/${product.slug || product.id}`
  const label = availabilityLabel(product.availability)
  const badgeColor = availabilityColor(product.availability)

  return (
    <Link href={href} className="group block bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md hover:border-[#0072bc] transition-all duration-200">

      {/* Image */}
      <div className="relative aspect-[4/3] bg-gray-100 overflow-hidden">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.display_name || `${product.make} ${product.part_number}`}
            fill
            className="object-contain p-4 group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-300">
            <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs">Photo coming soon</span>
          </div>
        )}

        {/* Availability badge */}
        <div className="absolute top-2 left-2">
          <span className={`badge ${badgeColor}`}>{label}</span>
        </div>

        {/* Condition badge (Pre-Owned only) */}
        {product.condition !== 'New' && (
          <div className="absolute top-2 right-2">
            <span className="badge bg-amber-100 text-amber-800">{product.condition}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="text-xs font-semibold text-[#0072bc] uppercase tracking-wide mb-1">
          {product.make}
        </div>
        <h3 className="font-bold text-gray-900 text-sm leading-snug mb-1 group-hover:text-[#0072bc] transition-colors line-clamp-2">
          {product.display_name || `${product.make} ${product.part_number}`}
        </h3>
        <div className="text-xs text-gray-500 mb-3">Model #: {product.part_number}</div>

        {/* Short description */}
        {product.short_description && (
          <p className="text-xs text-gray-600 line-clamp-2 mb-3">{product.short_description}</p>
        )}

        {/* Price + CTA */}
        <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100">
          <span className="font-bold text-gray-900 text-sm">
            {formatPrice(product.list_price_cents)}
          </span>
          <span className="text-xs font-semibold text-[#0072bc] group-hover:underline">
            View Details →
          </span>
        </div>
      </div>
    </Link>
  )
}
