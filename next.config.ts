import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // HSTS — forțează HTTPS (2 ani, subdomenii, preload).
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://unpkg.com",
      "img-src 'self' data: blob: https://*.supabase.co https://*.tile.openstreetmap.org https://unpkg.com",
      "font-src 'self' data:",
      // api.anthropic.com scos — apelurile AI se fac DOAR server-side (nu din browser).
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.tile.openstreetmap.org https://nominatim.openstreetmap.org",
      "frame-ancestors 'none'",
    ].join('; '),
  },
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
};

export default nextConfig;
