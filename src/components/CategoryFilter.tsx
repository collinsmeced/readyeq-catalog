'use client'

interface Props {
  categories: string[]
  selected: string | null
  onSelect: (cat: string | null) => void
  counts: Record<string, number>
}

export default function CategoryFilter({ categories, selected, onSelect, counts }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onSelect(null)}
        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
          selected === null
            ? 'bg-[#0072bc] text-white'
            : 'bg-white border border-gray-200 text-gray-600 hover:border-[#0072bc] hover:text-[#0072bc]'
        }`}
      >
        All Products
        <span className={`ml-1.5 text-xs ${selected === null ? 'text-blue-200' : 'text-gray-400'}`}>
          ({Object.values(counts).reduce((a, b) => a + b, 0)})
        </span>
      </button>

      {categories.map(cat => (
        <button
          key={cat}
          onClick={() => onSelect(cat)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            selected === cat
              ? 'bg-[#0072bc] text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:border-[#0072bc] hover:text-[#0072bc]'
          }`}
        >
          {cat}
          {counts[cat] && (
            <span className={`ml-1.5 text-xs ${selected === cat ? 'text-blue-200' : 'text-gray-400'}`}>
              ({counts[cat]})
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
