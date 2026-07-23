import { NextResponse } from 'next/server';
import { exchangeCode, StoriaOAuthError } from '@/lib/storia-api';
import { getAdminClient } from '@/lib/server/api-auth';
import {
  encryptPortalToken,
  hashOAuthState,
  isValidOAuthState,
  portalTokenEncryptionConfigured,
} from '@/lib/server/portal-token-crypto.mjs';

function appBaseUrl(): URL {
  const configured = process.env.NEXT_PUBLIC_APP_URL || 'https://crm.kiraimobiliare.ro';
  try {
    const parsed = new URL(configured);
    if (parsed.protocol === 'https:' || parsed.hostname === 'localhost') return parsed;
  } catch {
    // Fall through to the fixed production origin.
  }
  return new URL('https://crm.kiraimobiliare.ro');
}

function resultRedirect(type: 'connected' | 'error', code?: string) {
  const target = new URL('/portals', appBaseUrl());
  if (type === 'connected') target.searchParams.set('storia_connected', '1');
  else target.searchParams.set('storia_error', code || 'oauth_failed');
  return NextResponse.redirect(target, { headers: { 'Cache-Control': 'no-store' } });
}

function safeProviderError(value: string | null) {
  const normalized = String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 48);
  return normalized === 'access_denied' ? 'authorization_denied' : 'authorization_failed';
}

// GET /api/portals/storia/callback?code=...&state=...
// Public OAuth callback. Tenant identity comes exclusively from the one-time
// server-side session created by the authenticated connect endpoint.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const state = searchParams.get('state');

  if (!state || !isValidOAuthState(state)) return resultRedirect('error', 'invalid_state');
  if (!portalTokenEncryptionConfigured()) return resultRedirect('error', 'configuration_missing');

  const supabase = getAdminClient();
  let oauthSessionId: string | null = null;
  try {
    const { data, error: consumeError } = await supabase.rpc(
      'crm_consume_portal_oauth_session',
      {
        p_portal: 'storia',
        p_state_hash: hashOAuthState(state),
      },
    );
    const session = Array.isArray(data) ? data[0] : data;
    if (consumeError || !session?.session_id || !session?.agency_id) {
      return resultRedirect('error', 'invalid_or_expired_state');
    }
    oauthSessionId = session.session_id;

    if (error) {
      const errorCode = safeProviderError(error);
      await supabase.rpc('crm_fail_portal_oauth', {
        p_session_id: oauthSessionId,
        p_error_code: errorCode,
      });
      return resultRedirect('error', errorCode);
    }
    if (!code) {
      await supabase.rpc('crm_fail_portal_oauth', {
        p_session_id: oauthSessionId,
        p_error_code: 'authorization_code_missing',
      });
      return resultRedirect('error', 'authorization_code_missing');
    }

    const tokens = await exchangeCode(code);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const { data: tokenId, error: completeError } = await supabase.rpc(
      'crm_complete_portal_oauth',
      {
        p_session_id: oauthSessionId,
        p_access_token_ciphertext: encryptPortalToken(tokens.access_token, {
          agencyId: session.agency_id,
          portal: 'storia',
          purpose: 'access',
        }),
        p_refresh_token_ciphertext: encryptPortalToken(tokens.refresh_token, {
          agencyId: session.agency_id,
          portal: 'storia',
          purpose: 'refresh',
        }),
        p_encryption_version: 'v1',
        p_token_type: tokens.token_type,
        p_expires_at: expiresAt,
        p_scope: tokens.scope || null,
      },
    );
    if (completeError || !tokenId) throw new Error('oauth_storage_failed');

    return resultRedirect('connected');
  } catch (caught) {
    const errorCode = caught instanceof StoriaOAuthError
      ? caught.code
      : caught instanceof Error && caught.message === 'oauth_storage_failed'
        ? 'oauth_storage_failed'
        : 'oauth_failed';
    if (oauthSessionId) {
      await supabase.rpc('crm_fail_portal_oauth', {
        p_session_id: oauthSessionId,
        p_error_code: errorCode,
      });
    }
    return resultRedirect('error', errorCode);
  }
}
