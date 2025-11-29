import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  // Cloudflare Workers/Pages compatibility
  images: {
    unoptimized: true, // Cloudflare uses their own image optimization
  },
};

export default nextConfig;
