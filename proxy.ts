import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// The agents' app (public/aplicatie) runs only on its own address, app.kiraimobiliare.ro (see next.config.ts).
function isPhoneAppHost(hostValue: string | null) {
  const host = (hostValue || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
  return host === 'app.kiraimobiliare.ro' || host === 'app.localhost';
}

export function proxy(request: NextRequest) {
  // The app is reached only through app.kiraimobiliare.ro (rewritten to /aplicatie there), never on the site's own
  // addresses: in a browser, the site's pages must not share storage with the app's data.
  if (!isPhoneAppHost(request.headers.get('host'))) {
    return new NextResponse('Not found', { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/aplicatie', '/aplicatie/:path*'],
};
