import Link from 'next/link'

export default function Navbar() {
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 shrink-0">
            {/* Geometric R mark matching readyeq.com */}
            <div className="w-9 h-9 bg-[#1d5fa0] flex items-center justify-center rounded-sm">
              <span className="text-white font-black text-lg leading-none">R</span>
            </div>
            <div className="leading-tight">
              <div className="font-black text-gray-900 text-sm tracking-wide uppercase">Ready Equipment</div>
              <div className="text-[10px] text-gray-500 tracking-widest uppercase">Sales &amp; Rentals</div>
            </div>
          </Link>

          {/* Center nav */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
            <Link href="/" className="hover:text-[#1d5fa0] transition-colors">All Products</Link>
            <Link href="/?category=Zero+Turn+Mowers" className="hover:text-[#1d5fa0] transition-colors">Mowers</Link>
            <Link href="/?category=Generators" className="hover:text-[#1d5fa0] transition-colors">Generators</Link>
            <Link href="/?category=Chainsaws" className="hover:text-[#1d5fa0] transition-colors">Chainsaws</Link>
            <Link href="/?category=Compactors" className="hover:text-[#1d5fa0] transition-colors">Compactors</Link>
          </nav>

          {/* CTA */}
          <div className="flex items-center gap-3">
            <a
              href="tel:16032793322"
              className="hidden sm:flex items-center gap-1.5 text-sm font-semibold text-[#1d5fa0] hover:text-[#174d84]"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
              </svg>
              (603) 279-3322
            </a>
            <a
              href="https://www.readyeq.com/contact-us"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary text-sm py-2 px-4"
            >
              Contact Us
            </a>
          </div>
        </div>
      </div>
    </header>
  )
}
