import { NextResponse } from 'next/server';
import { STORIA_AUTH_URL, OTODOM_AUTH_URL, isTestMode } from '@/lib/storia-api';
import { requireApiAuth } from '@/lib/server/api-auth';
import {
  createOAuthState,
  hashAuthenticatedSession,
  hashOAuthState,
  portalTokenEncryptionConfigured,
} from '@/lib/server/portal-token-crypto.mjs';

// GET /api/portals/storia/connect
// Starts a tenant-bound OAuth2 Authorization Code flow.
export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'portals', action: 'edit' });
  if (!auth.ok) return auth.response;
  const { user, agencyId, serviceAdmin } = auth.context;

  const clientId = process.env.STORIA_CLIENT_ID;
  if (!clientId || !portalTokenEncryptionConfigured()) {
    return NextResponse.json(
      { error: 'Integrarea Storia nu este configurată complet.' },
      { status: 503 },
    );
  }

  // The callback URI is configured in OLX App Manager. The state itself has no
  // user or tenant identifier and is stored server-side only as a SHA-256 hash.
  const bearerToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  const state = createOAuthState();
  const stateHash = hashOAuthState(state);
  const sessionHash = hashAuthenticatedSession(bearerToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

  await serviceAdmin
    .from('portal_oauth_sessions')
    .update({ status: 'cancelled', updated_at: now.toISOString() })
    .eq('portal', 'storia')
    .eq('agency_id', agencyId)
    .eq('user_id', user.id)
    .eq('status', 'pending');

  const { error: sessionError } = await serviceAdmin
    .from('portal_oauth_sessions')
    .insert({
      portal: 'storia',
      state_hash: stateHash,
      session_hash: sessionHash,
      agency_id: agencyId,
      user_id: user.id,
      redirect_path: '/portals',
      status: 'pending',
      expires_at: expiresAt,
    });
  if (sessionError) {
    return NextResponse.json(
      { error: 'Conectarea Storia nu a putut fi inițiată în siguranță.' },
      { status: 503 },
    );
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    state,
  });
  const authUrl = isTestMode() ? OTODOM_AUTH_URL : STORIA_AUTH_URL;
  return NextResponse.json(
    { url: `${authUrl}?${params}` },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
