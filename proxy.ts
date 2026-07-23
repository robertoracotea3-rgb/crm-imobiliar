import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/register', '/api/auth/register', '/api/feed/'];

function createContentSecurityPolicy(nonce: string) {
  const isDev = process.env.NODE_ENV === 'development';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "script-src-attr 'none'",
    // React style attributes and the current Leaflet stylesheet still require this exception.
    "style-src 'self' 'unsafe-inline' https://unpkg.com",
    "img-src 'self' data: blob: https://*.supabase.co https://*.tile.openstreetmap.org https://unpkg.com",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.tile.openstreetmap.org https://nominatim.openstreetmap.org",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

function continueRequest(request: NextRequest, contentSecurityPolicy?: string, nonce?: string) {
  const requestHeaders = new Headers(request.headers);
  if (contentSecurityPolicy && nonce) {
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', contentSecurityPolicy);
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  if (contentSecurityPolicy) {
    response.headers.set('Content-Security-Policy', contentSecurityPolicy);
  }
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPageRequest = !pathname.startsWith('/api/');
  const nonce = isPageRequest ? crypto.randomUUID() : undefined;
  const contentSecurityPolicy = nonce ? createContentSecurityPolicy(nonce) : undefined;

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return continueRequest(request, contentSecurityPolicy, nonce);
  }

  // For API routes: validate Content-Type on mutation requests to block CSRF
  if (pathname.startsWith('/api/') && ['POST', 'PATCH', 'DELETE', 'PUT'].includes(request.method)) {
    const contentType = request.headers.get('content-type') || '';
    // Allow multipart (file uploads) and JSON
    if (
      !contentType.includes('application/json') &&
      !contentType.includes('multipart/form-data') &&
      !contentType.includes('application/x-www-form-urlencoded')
    ) {
      // Only reject if there's a body (content-length > 0)
      const contentLength = request.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > 0) {
        return NextResponse.json({ error: 'Invalid Content-Type' }, { status: 415 });
      }
    }
  }

  return continueRequest(request, contentSecurityPolicy, nonce);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
