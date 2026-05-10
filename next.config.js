/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.husqvarna.com' },
      { protocol: 'https', hostname: '**.echo-usa.com' },
      { protocol: 'https', hostname: '**.toro.com' },
      { protocol: 'https', hostname: '**.kress.com' },
      { protocol: 'https', hostname: '**.ferrisindustries.com' },
      { protocol: 'https', hostname: '**.exmark.com' },
      { protocol: 'https', hostname: '**.generac.com' },
      { protocol: 'https', hostname: '**.wackerneuson.com' },
      { protocol: 'https', hostname: '**.makitatools.com' },
      { protocol: 'https', hostname: '**.billygoat.com' },
      { protocol: 'https', hostname: '**.greenworkstools.com' },
      { protocol: 'https', hostname: '**supabase.co' },
    ],
  },
}

module.exports = nextConfig
