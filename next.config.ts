import type { NextConfig } from 'next';

const config: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ['@google/genai', 'pg'],
};

export default config;
