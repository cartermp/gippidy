import type { NextConfig } from 'next';

const config: NextConfig = {
  eslint:     { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  serverExternalPackages: ['pg'],
  experimental: {
    optimizePackageImports: ['highlight.js'],
  },
};

export default config;
