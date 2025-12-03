import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  transpilePackages: ['@remotion-fast/ui', '@remotion-fast/core', '@remotion-fast/remotion-components'],
  // Cloudflare Workers/Pages compatibility
  images: {
    unoptimized: true, // Cloudflare uses their own image optimization
  },
  async rewrites() {
    return [
      {
        source: '/api/generate/:path*',
        destination: 'http://127.0.0.1:8000/api/generate/:path*',
      },
      {
        source: '/api/describe',
        destination: 'http://127.0.0.1:8000/api/describe',
      },
      {
        source: '/api/v1/:path*',
        destination: 'http://127.0.0.1:8000/api/v1/:path*',
      },
    ];
  },
};

export default nextConfig;
