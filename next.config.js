/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Manufacturer CDNs are wildly varied (cdn.thetorocompany.com,
    // www-static-nw.husqvarna.com, scene7.com, akamai...). Allow any HTTPS
    // image source so Phase 1 enrichment can populate images from any
    // manufacturer page without us maintaining a per-brand allowlist.
    // Safe because image URLs only come from our DB, which only accepts
    // URLs we wrote via the grounded enrichment pipeline.
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
}

module.exports = nextConfig
