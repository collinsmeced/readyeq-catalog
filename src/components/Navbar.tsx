import Link from 'next/link'
import Image from 'next/image'

const MAIN_SITE = 'https://www.readyeq.com'

export default function Navbar() {
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-[90px] gap-4">

          {/* Far left: contact icons */}
          <div className="hidden lg:flex flex-col items-center gap-2 shrink-0">
            <a href={`mailto:info@readyeq.com`} className="text-gray-500 hover:text-[#0072bc] transition-colors" aria-label="Email">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </a>
            <a href="tel:16032797323" className="text-gray-500 hover:text-[#0072bc] transition-colors" aria-label="Call us">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </a>
          </div>

          {/* Left nav */}
          <nav className="hidden lg:flex items-center gap-5 text-sm font-medium text-gray-700 shrink-0">
            <a href={MAIN_SITE} className="hover:text-[#0072bc] transition-colors">Home</a>
            <a href={`${MAIN_SITE}/rentals`} className="hover:text-[#0072bc] transition-colors">Rentals</a>
            <Link href="/" className="text-[#0072bc] font-semibold border-b-2 border-[#0072bc] pb-0.5">Sales</Link>
            <a href={`${MAIN_SITE}/parts-service`} className="hover:text-[#0072bc] transition-colors">Parts &amp; Service</a>
          </nav>

          {/* Center: Logo */}
          <Link href="/" className="shrink-0 mx-auto lg:mx-0">
            <Image
              src="/logo.jpg"
              alt="Ready Equipment Outdoor Power"
              width={180}
              height={72}
              className="h-20 w-auto object-contain"
              priority
            />
          </Link>

          {/* Right nav */}
          <nav className="hidden lg:flex items-center gap-5 text-sm font-medium text-gray-700 shrink-0">
            <a href={`${MAIN_SITE}/about`} className="hover:text-[#0072bc] transition-colors">About</a>
            <a href={`${MAIN_SITE}/blog`} className="hover:text-[#0072bc] transition-colors">Blog</a>
            <a href={`${MAIN_SITE}/resources`} className="hover:text-[#0072bc] transition-colors">Resources</a>
            <a href={`${MAIN_SITE}/contact-us`} className="hover:text-[#0072bc] transition-colors">Contact us</a>
          </nav>

          {/* Far right: social icons */}
          <div className="hidden lg:flex items-center gap-2 shrink-0">
            <a href="https://www.facebook.com/readyequipmentnh" target="_blank" rel="noopener noreferrer" aria-label="Facebook"
               className="w-8 h-8 rounded-full bg-[#1877f2] flex items-center justify-center hover:opacity-90 transition-opacity">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </a>
            <a href="https://www.instagram.com/readyequipment" target="_blank" rel="noopener noreferrer" aria-label="Instagram"
               className="w-8 h-8 rounded-full bg-gradient-to-br from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] flex items-center justify-center hover:opacity-90 transition-opacity">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
              </svg>
            </a>
          </div>

          {/* Mobile: logo + hamburger hint */}
          <div className="lg:hidden flex items-center gap-3">
            <a href="tel:16032797323" className="btn-primary text-sm py-1.5 px-3">
              Call Us
            </a>
          </div>

        </div>
      </div>
    </header>
  )
}
