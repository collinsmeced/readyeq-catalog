'use client'

import { useState, useMemo } from 'react'
import type { Product } from '@/lib/types'
import ProductCard from './ProductCard'
import CategoryFilter from './CategoryFilter'

interface Props {
  products: Product[]
  initialCategory?: string | null
}

export default function CatalogClient({ products, initialCategory = null }: Props) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(initialCategory)
  const [search, setSearch] = useState('')
  const [selectedMake, setSelectedMake] = useState<string | null>(null)
  const [availabilityFilter, setAvailabilityFilter] = useState<string | null>(null)

  // Build category list sorted by count
  const categories = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of products) {
      counts[p.category] = (counts[p.category] || 0) + 1
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([cat]) => cat)
  }, [products])

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of products) {
      counts[p.category] = (counts[p.category] || 0) + 1
    }
    return counts
  }, [products])

  const makes = useMemo(() => {
    const s = new Set(products.map(p => p.make))
    return Array.from(s).sort()
  }, [products])

  const filtered = useMemo(() => {
    let result = products

    if (selectedCategory) {
      result = result.filter(p => p.category === selectedCategory)
    }

    if (selectedMake) {
      result = result.filter(p => p.make === selectedMake)
    }

    if (availabilityFilter) {
      result = result.filter(p => p.availability === availabilityFilter)
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(p =>
        p.make.toLowerCase().includes(q) ||
        p.model.toLowerCase().includes(q) ||
        (p.display_name || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      )
    }

    return result
  }, [products, selectedCategory, selectedMake, availabilityFilter, search])

  return (
    <div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Hero banner — contained blue box, same width as product grid */}
        <div className="bg-[#0072bc] rounded-xl p-8 text-center text-white mb-8">
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mb-3">
            Outdoor Power Equipment &amp; Contractor Equipment
          </h1>
          <p className="text-blue-100 text-sm mb-6 max-w-lg mx-auto">
            Browse our full lineup from the brands you trust. In Stock, On Order, and Available to Order.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="tel:16032797323"
               className="inline-flex items-center justify-center gap-2 bg-white text-[#0072bc] font-bold px-6 py-3 rounded hover:bg-gray-100 transition-colors">
              Call (603) 279-7323
            </a>
            <a href="sms:16032797323"
               className="inline-flex items-center justify-center gap-2 border-2 border-white text-white font-bold px-6 py-3 rounded hover:bg-white/10 transition-colors">
              Text (603) 279-7323
            </a>
          </div>
        </div>

        {/* Search + filters row */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by brand, model, or type..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0072bc] focus:border-transparent"
            />
          </div>

          {/* Brand filter */}
          <select
            value={selectedMake || ''}
            onChange={e => setSelectedMake(e.target.value || null)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0072bc] bg-white text-gray-700"
          >
            <option value="">All Brands</option>
            {makes.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          {/* Availability filter */}
          <select
            value={availabilityFilter || ''}
            onChange={e => setAvailabilityFilter(e.target.value || null)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0072bc] bg-white text-gray-700"
          >
            <option value="">All Availability</option>
            <option value="in_stock">In Stock</option>
            <option value="on_order">On Order</option>
            <option value="available_to_order">Available to Order</option>
          </select>
        </div>

        {/* Category pills */}
        <div className="mb-6">
          <CategoryFilter
            categories={categories}
            selected={selectedCategory}
            onSelect={setSelectedCategory}
            counts={categoryCounts}
          />
        </div>

        {/* Result count */}
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm text-gray-500">
            {filtered.length === products.length
              ? `${products.length} products`
              : `${filtered.length} of ${products.length} products`}
          </p>
          {(selectedCategory || selectedMake || availabilityFilter || search) && (
            <button
              onClick={() => {
                setSelectedCategory(null)
                setSelectedMake(null)
                setAvailabilityFilter(null)
                setSearch('')
              }}
              className="text-sm text-[#0072bc] hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg font-semibold mb-2">No products found</p>
            <p className="text-sm">Try adjusting your filters or search term.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}

        {/* CTA banner */}
        <div className="mt-16 bg-[#0F1827] rounded-xl p-8 text-center text-white">
          <h2 className="text-2xl font-black uppercase tracking-tight mb-2">
            Don&apos;t See What You&apos;re Looking For?
          </h2>
          <p className="text-gray-300 text-sm mb-5 max-w-lg mx-auto">
            We can source equipment from all the brands we carry. Give us a call or stop by — we&apos;re here to help.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="tel:16032797323" className="btn-primary justify-center">
              Call (603) 279-7323
            </a>
            <a href="https://www.readyeq.com/contact-us" target="_blank" rel="noopener noreferrer" className="btn-secondary justify-center border-gray-500 text-white hover:bg-white/10">
              Send a Message
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
