export default function Footer() {
  return (
    <footer className="bg-[#0F1827] text-gray-300 mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-[#1d5fa0] flex items-center justify-center rounded-sm">
                <span className="text-white font-black text-base leading-none">R</span>
              </div>
              <div>
                <div className="font-bold text-white text-sm uppercase tracking-wide">Ready Equipment</div>
                <div className="text-[10px] text-gray-400 tracking-widest uppercase">Sales &amp; Rentals</div>
              </div>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">
              Your source for quality equipment sales, rentals, parts, and service in the Lakes Region of New Hampshire.
            </p>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">Contact Us</h3>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>
                <a href="tel:16032793322" className="hover:text-white transition-colors">
                  (603) 279-3322
                </a>
              </li>
              <li>
                <a href="mailto:info@readyeq.com" className="hover:text-white transition-colors">
                  info@readyeq.com
                </a>
              </li>
              <li className="leading-relaxed">
                Meredith, NH 03253
              </li>
            </ul>
          </div>

          {/* Links */}
          <div>
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li><a href="https://www.readyeq.com" className="text-gray-400 hover:text-white transition-colors">Main Website</a></li>
              <li><a href="https://www.readyeq.com/rentals" className="text-gray-400 hover:text-white transition-colors">Rentals</a></li>
              <li><a href="https://www.readyeq.com/parts-service" className="text-gray-400 hover:text-white transition-colors">Parts &amp; Service</a></li>
              <li><a href="https://www.readyeq.com/contact-us" className="text-gray-400 hover:text-white transition-colors">Contact Us</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-700 mt-10 pt-6 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-gray-500">
          <span>© {new Date().getFullYear()} Ready Equipment. All rights reserved.</span>
          <span>Availability and pricing subject to change. Call to confirm.</span>
        </div>
      </div>
    </footer>
  )
}
