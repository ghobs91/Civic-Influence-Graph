import type { NextConfig } from 'next';

const apiBackend = process.env.INTERNAL_API_URL || 'http://localhost:3001';

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiBackend}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
