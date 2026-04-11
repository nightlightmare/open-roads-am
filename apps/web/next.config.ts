import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    turbopack: true,
  },
  transpilePackages: ['@open-road/ui', '@open-road/types'],
}

export default nextConfig
