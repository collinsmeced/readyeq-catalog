import Image from 'next/image'

const MAIN_SITE = 'https://www.readyeq.com'

export default function Footer() {
  return (
    <footer className="mt-16">

      {/* Blue CTA bar */}
      <div className="bg-[#0072bc] py-6 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-white font-black text-2xl">Have a Question?</h2>
            <p className="text-blue-200 text-sm mt-0.5">Give us a call!</p>
          </div>
          <a
            href="tel:16032797323"
            className="flex items-center gap-3 bg-white text-gray-900 font-bold px-8 py-3.5 rounded hover:bg-gray-50 transition-colors text-sm whitespace-nowrap"
          >
            <svg className="w-4 h-4 text-gray-700" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
            </svg>
            Call us 603-279-7323
          </a>
        </div>
      </div>

      {/* Contact info strip */}
      <div className="bg-white border-b-4 border-gray-800 py-6 px-4">
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6">
          {/* Location */}
          <div className="flex items-start gap-3">
            <div className="text-[#0072bc] mt-0.5 shrink-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">Location</p>
              <p className="text-gray-600 text-sm mt-0.5">25 Daniel Webster Hwy,<br />Meredith, NH</p>
            </div>
          </div>

          {/* Email */}
          <div className="flex items-start gap-3">
            <div className="text-[#0072bc] mt-0.5 shrink-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">Email</p>
              <a href="mailto:info@readyeq.com" className="text-[#0072bc] text-sm hover:underline mt-0.5 block">
                info@readyeq.com
              </a>
            </div>
          </div>

          {/* Phone */}
          <div className="flex items-start gap-3">
            <div className="text-[#0072bc] mt-0.5 shrink-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">Call</p>
              <a href="tel:16032797323" className="text-gray-600 text-sm hover:text-[#0072bc] mt-0.5 block">
                603-279-7323
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Main footer */}
      <div className="bg-white py-10 px-4">
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">

          {/* Brand */}
          <div>
            <Image
              src="/logo.jpg"
              alt="Ready Equipment"
              width={160}
              height={64}
              className="h-14 w-auto object-contain mb-3"
            />
            <p className="text-gray-600 text-sm leading-relaxed">
              Your source for quality rentals, sales, parts &amp; service.
            </p>
            <div className="flex items-center gap-2 mt-4">
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
              <a href="https://g.page/readyequipment" target="_blank" rel="noopener noreferrer" aria-label="Google"
                 className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors">
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Navigation */}
          <div>
            <h3 className="font-black text-[#0072bc] text-sm uppercase tracking-wider mb-4">Navigation</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li><a href={MAIN_SITE} className="hover:text-[#0072bc] transition-colors">Home</a></li>
              <li><a href={`${MAIN_SITE}/about`} className="hover:text-[#0072bc] transition-colors">About</a></li>
              <li><a href={`${MAIN_SITE}/blog`} className="hover:text-[#0072bc] transition-colors">Blog</a></li>
              <li><a href={`${MAIN_SITE}/contact-us`} className="hover:text-[#0072bc] transition-colors">Contact us</a></li>
            </ul>
          </div>

          {/* Services */}
          <div>
            <h3 className="font-black text-[#0072bc] text-sm uppercase tracking-wider mb-4">Services</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li><a href="/" className="hover:text-[#0072bc] transition-colors font-medium">Sales</a></li>
              <li><a href={`${MAIN_SITE}/rentals`} className="hover:text-[#0072bc] transition-colors">Rental</a></li>
              <li><a href={`${MAIN_SITE}/parts-service`} className="hover:text-[#0072bc] transition-colors">Parts &amp; Service</a></li>
            </ul>
          </div>

          {/* Hours */}
          <div>
            <h3 className="font-black text-[#0072bc] text-sm uppercase tracking-wider mb-4">Hours</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex justify-between gap-4">
                <span>Mon - Fri</span>
                <span>7:00 am - 5:00 pm</span>
              </li>
              <li className="flex justify-between gap-4">
                <span>Saturday</span>
                <span>8:00 am - 2:00 pm</span>
              </li>
              <li className="flex justify-between gap-4">
                <span>Sunday</span>
                <span className="text-gray-400">Closed</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto border-t border-gray-200 mt-8 pt-5 text-xs text-gray-400 flex flex-col sm:flex-row justify-between gap-2">
          <span>© {new Date().getFullYear()} Ready Equipment. All rights reserved.</span>
          <span>Pricing and availability subject to change. Call to confirm.</span>
        </div>
      </div>
    </footer>
  )
}
