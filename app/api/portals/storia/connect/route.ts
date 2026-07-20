import { NextResponse } from 'next/server';
import { STORIA_AUTH_URL, OTODOM_AUTH_URL, isTestMode } from '@/lib/storia-api';
import { requireApiAuth } from '@/lib/server/api-auth';

// GET /api/portals/storia/connect
// Initiates OAuth2 Authorization Code flow — redirects user to Storia login.
export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'portals', action: 'edit' });
  if (!auth.ok) return auth.response;
  const { user } = auth.context;

  const clientId = process.env.STORIA_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: 'STORIA_CLIENT_ID nesetat. Adăugați variabila în Vercel Environment Variables.' },
      { status: 500 }
    );
  }

  // OLX authorize redirect: the callback (redirect_uri) is configured in the App Manager,
  // NOT passed here. We only send response_type, client_id and a CSRF `state`.
  const state = `${user.id}.${crypto.randomUUID()}`;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     clientId,
    state,
  });

  const authUrl = isTestMode() ? OTODOM_AUTH_URL : STORIA_AUTH_URL;
  return NextResponse.json({ url: `${authUrl}?${params}` });
}
