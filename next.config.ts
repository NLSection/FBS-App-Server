// FILE: next.config.ts
// AANGEMAAKT: 26-03-2026 00:00
// VERSIE: 1
// GEWIJZIGD: 04-04-2026 22:30
//
// WIJZIGINGEN (04-04-2026 22:30):
// - output: 'standalone' toegevoegd voor Tauri bundeling

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingExcludes: {
    '*': [
      './src-tauri/**',
      './backup/**',
      './VMDebugLog/**',
      './docs/**',
      './.claude/**',
      './*.md',
      './*.txt',
      './*.lnk',
      './*.bat',
      './*.ps1',
      './fbs.db*',
    ],
  },
  ...(process.env.NODE_ENV === 'development' ? {
    turbopack: { root: __dirname },
  } : {}),
  transpilePackages: ['lucide-react'],
  devIndicators: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'ngrok-skip-browser-warning',
            value: 'true',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
