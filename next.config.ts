import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co https://*.tile.openstreetmap.org https://images.unsplash.com",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co https://*.tile.openstreetmap.org",
      "frame-ancestors 'none'",
    ].join('; '),
  },
];

/*
 * https://app.kiraimobiliare.ro is the agents' app: in a browser tab it shows how to get it (iPhone, Android, and the
 * Windows kit to download), and added to the home screen it is the CRM. It is served from public/aplicatie, which
 * the CRM build copies here (mobile/build-mobile.ps1 -Site). Its own address keeps the app's data on the phone apart
 * from the public site's pages. A push here is how agents get a new version: the app notices it and offers
 * "Actualizează". (app.localhost is the same thing on a local dev server.)
 */
const PHONE_APP_HOST = { type: 'host' as const, value: '(?:app\\.kiraimobiliare\\.ro|app\\.localhost)' };
// The page where clients sign contracts: never framed, no referrer, talks only to HTTPS addresses (the CRM database).
const signingHeaders = [
  { key: 'Content-Security-Policy', value: "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; connect-src https:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Cache-Control', value: 'no-cache' },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        missing: [PHONE_APP_HOST],
        headers: securityHeaders,
      },
      {
        source: '/:path*',
        has: [PHONE_APP_HOST],
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
      { source: '/semnare.html', has: [PHONE_APP_HOST], headers: signingHeaders },
      { source: '/semnare', has: [PHONE_APP_HOST], headers: signingHeaders },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/', has: [PHONE_APP_HOST], destination: '/aplicatie/index.html' },
        { source: '/semnare', has: [PHONE_APP_HOST], destination: '/aplicatie/semnare.html' },
        // Everything else on that address is a file of the app (or a 404), never a page of the site or the CRM.
        // (A path already rewritten above goes on through this list, so /aplicatie/ is left as it is.)
        { source: '/:path((?!_next/|aplicatie/).*)', has: [PHONE_APP_HOST], destination: '/aplicatie/:path' },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  turbopack: {},
};

export default nextConfig;
