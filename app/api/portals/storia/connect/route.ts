import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { STORIA_AUTH_URL, OTODOM_AUTH_URL, isTestMode } from '@/lib/storia-api';

// GET /api/portals/storia/connect
// Initiates OAuth2 Authorization Code flow — redirects user to Storia login.
export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
