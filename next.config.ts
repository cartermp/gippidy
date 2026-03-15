import type { NextConfig } from 'next';

const config: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ['@google/genai'],
};

export default config;
