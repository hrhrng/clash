import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/**': ['node_modules/next/dist/**'],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  transpilePackages: ['@master-clash/remotion-ui', '@master-clash/remotion-core', '@master-clash/remotion-components'],
  // Cloudflare Workers/Pages compatibility
  images: {
    unoptimized: true, // Cloudflare uses their own image optimization
  },
  async rewrites() {
    const backendUrl = process.env.BACKEND_API_URL || 'http://127.0.0.1:8000';
    const syncServerUrl = process.env.LORO_SYNC_URL || 'http://127.0.0.1:8787';

    return [
      {
        // Generation APIs handled by loro-sync-server
        source: '/api/generate/:path*',
        destination: `${syncServerUrl}/api/generate/:path*`,
      },

      {
        source: '/api/describe',
        destination: `${backendUrl}/api/describe`,
      },
      {
        source: '/api/v1/:path*',
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];
  },
  webpack(config) {
    config.experiments = {
      ...(config.experiments || {}),
      asyncWebAssembly: true,
    };

    config.module.rules.push({
      test: /\.wasm$/,
      type: 'webassembly/async',
    });

    return config;
  },
};

export default nextConfig;
