import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/register', '/api/auth/register', '/api/feed/'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
