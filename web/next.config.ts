import type { NextConfig } from 'next'

/**
 * The web app is a fully offline PWA: Next.js runs as a static export, and all
 * dynamic data (content bundle + user data) lives in IndexedDB on the device.
 * `trailingSlash` makes every route resolve to a real `index.html` so any
 * static host can serve it.
 */
const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
}

export default nextConfig
