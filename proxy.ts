import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function isPublicWebsiteHost(hostValue: string | null) {
  const host = (hostValue || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
  return host === 'kiraimobiliare.ro' || host === 'www.kiraimobiliare.ro' || /^fortis-website(?:-|\.)/.test(host);
}

function isCrmApplicationHost(hostValue: string | null) {
  const host = (hostValue || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
  return host === 'crm.kiraimobiliare.ro' || host === 'crm-fortis.vercel.app' || /^crm-fortis(?:-|\.)/.test(host);
}

const PUBLIC_PATHS = ['/login', '/register', '/api/auth/register', '/api/feed/'];
const CRM_PATHS = [
  '/login', '/register', '/dashboard', '/properties', '/leads', '/clients', '/contacts',
  '/prospects', '/viewings', '/calendar', '/finance', '/portals', '/team',
  '/notifications', '/settings', '/setup', '/tasks', '/matches', '/api',
];

function matchesPath(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host');

  // Keep the CRM surface on its own hostname. The property XML feed remains public.
  const isPublicFeed = pathname.startsWith('/api/feed/');
  if (isPublicWebsiteHost(host) && !isPublicFeed && CRM_PATHS.some((path) => matchesPath(pathname, path))) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const destination = new URL(request.url);
    destination.hostname = 'crm.kiraimobiliare.ro';
    destination.protocol = 'https:';
    return NextResponse.redirect(destination, 307);
  }

  // Public city pages belong to the public website, never the CRM hostname.
  if (isCrmApplicationHost(host) && pathname.startsWith('/localitati/')) {
    const destination = new URL(request.url);
    destination.hostname = 'www.kiraimobiliare.ro';
    destination.protocol = 'https:';
    return NextResponse.redirect(destination, 307);
  }

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
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

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
