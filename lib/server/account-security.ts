import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { normalizedForwardedIp } from '@/lib/audit-values';
import {
  hashSecurityValue,
  verifiedAccessTokenClaims,
  type AccessTokenClaims,
} from '@/lib/account-security-core';

export { hashSecurityValue, verifiedAccessTokenClaims };
export type { AccessTokenClaims };

export interface SessionDecision {
  authorized: boolean;
  reason: string | null;
  mfaRequired: boolean;
  passwordChangeRequired: boolean;
  createdAt: string | null;
  lastSeenAt: string | null;
}

export function requestIpHash(request: Request): string | null {
  const ip = normalizedForwardedIp(
    request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
  );
  return ip ? hashSecurityValue('request-ip', ip) : null;
}

export function requestUserAgent(request: Request): string | null {
  const value = request.headers.get('user-agent')?.trim();
  return value ? value.slice(0, 500) : null;
}

export async function authorizeAppSession(
  client: SupabaseClient,
  request: Request,
  claims: AccessTokenClaims,
  options: { allowRegistration?: boolean } = {},
): Promise<SessionDecision> {
  const { data, error } = await client.rpc('crm_authorize_app_session', {
    p_session_id: claims.sessionId,
    p_user_id: claims.subject,
    p_aal: claims.aal,
    p_token_issued_at: claims.issuedAt,
    p_token_expires_at: claims.expiresAt,
    p_ip_hash: requestIpHash(request),
    p_user_agent: requestUserAgent(request),
    p_allow_register: options.allowRegistration === true,
  });
  if (error) throw new Error('Verificarea sesiunii CRM nu este disponibilă.');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Verificarea sesiunii CRM nu a returnat un rezultat.');
  return {
    authorized: row.authorized === true,
    reason: typeof row.reason === 'string' ? row.reason : null,
    mfaRequired: row.mfa_required === true,
    passwordChangeRequired: row.password_change_required === true,
    createdAt: typeof row.session_created_at === 'string' ? row.session_created_at : null,
    lastSeenAt: typeof row.session_last_seen_at === 'string' ? row.session_last_seen_at : null,
  };
}

export async function checkRateLimit(
  client: SupabaseClient,
  entries: Array<{ scope: 'login_account' | 'login_ip' | 'registration_ip'; keyHash: string }>,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  let retryAfterSeconds = 0;
  for (const entry of entries) {
    const { data, error } = await client.rpc('crm_auth_rate_limit_check', {
      p_scope: entry.scope,
      p_key_hash: entry.keyHash,
    });
    if (error) throw new Error('Protecția anti-abuz nu este disponibilă.');
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.allowed === false) {
      retryAfterSeconds = Math.max(retryAfterSeconds, Number(row.retry_after_seconds) || 1);
    }
  }
  return { allowed: retryAfterSeconds === 0, retryAfterSeconds };
}

export async function recordRateLimitResult(
  client: SupabaseClient,
  entries: Array<{ scope: 'login_account' | 'login_ip' | 'registration_ip'; keyHash: string }>,
  success: boolean,
): Promise<void> {
  for (const entry of entries) {
    const { error } = await client.rpc('crm_auth_rate_limit_record', {
      p_scope: entry.scope,
      p_key_hash: entry.keyHash,
      p_success: success,
    });
    if (error) throw new Error('Protecția anti-abuz nu a putut înregistra tentativa.');
  }
}
