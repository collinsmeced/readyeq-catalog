import type { Metadata } from 'next'
import './globals.css'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Sales Catalog | Ready Equipment — Meredith, NH',
  description:
    'Browse mowers, trimmers, generators, compactors, chainsaws and more from Ready Equipment in Meredith, NH. Authorized dealer for Husqvarna, Echo, Toro, Generac, and more.',
  openGraph: {
    title: 'Ready Equipment Sales Catalog',
    description: 'Equipment sales from Ready Equipment — Meredith, NH',
    url: 'https://readyeq.com',
    siteName: 'Ready Equipment',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  )
}
