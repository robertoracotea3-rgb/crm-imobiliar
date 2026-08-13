import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // HSTS — forțează HTTPS (2 ani, subdomenii, preload).
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'idpjifivdaqhsysvjmye.supabase.co' },
    ],
  },
  turbopack: {},
  // sharp rămâne extern (nu e bundle-uit) și se încarcă din node_modules la runtime.
  serverExternalPackages: ['sharp'],
  // Binarul nativ al lui sharp face dlopen la libvips-cpp.so din @img/sharp-libvips-*;
  // tracing-ul nu poate vedea acel .so, așa că îl includem explicit — altfel rutele
  // care importă sharp cad cu ERR_DLOPEN_FAILED pe Vercel (linux-x64).
  outputFileTracingIncludes: {
    '/api/properties/upload-photos': ['./node_modules/@img/**/*'],
    '/api/settings/watermark': ['./node_modules/@img/**/*'],
  },
};

export default nextConfig;
