export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

import { appendAuditEvent } from '@/lib/server/audit-log';
import {
  authorizeAppSession,
  checkRateLimit,
  hashSecurityValue,
  recordRateLimitResult,
  requestIpHash,
  verifiedAccessTokenClaims,
} from '@/lib/server/account-security';
import { getAdminClient } from '@/lib/server/api-auth';
import { mailOnboardingEnabled, mailboxAddressForUser } from '@/lib/server/mail-feature';
import { hasPermission } from '@/lib/team-roles';
import { usernameToEmail } from '@/lib/username';

const USERNAME_RE = /^[a-zA-Z0-9._]{3,30}$/;

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  return (!origin || origin === new URL(request.url).origin)
    && (!fetchSite || ['same-origin', 'none'].includes(fetchSite));
}

function genericLoginError(status = 401, headers?: HeadersInit) {
  return Response.json(
    { error: 'Nume utilizator sau parolă incorectă.' },
    { status, headers },
  );
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return Response.json({ error: 'Cerere invalidă.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!USERNAME_RE.test(username) || password.length < 1 || password.length > 256) {
    return genericLoginError();
  }

  const serviceAdmin = getAdminClient();
  let accountHash: string;
  let ipHash: string | null;
  try {
    accountHash = hashSecurityValue('login-account', usernameToEmail(username));
    ipHash = requestIpHash(request);
  } catch {
    return Response.json({ error: 'Protecția autentificării nu este configurată.' }, { status: 503 });
  }
  const rateEntries: Array<{
    scope: 'login_account' | 'login_ip';
    keyHash: string;
  }> = [{ scope: 'login_account', keyHash: accountHash }];
  if (ipHash) rateEntries.push({ scope: 'login_ip', keyHash: ipHash });

  let rateDecision;
  try {
    rateDecision = await checkRateLimit(serviceAdmin, rateEntries);
  } catch {
    return Response.json({ error: 'Protecția autentificării nu este disponibilă.' }, { status: 503 });
  }
  if (!rateDecision.allowed) {
    return genericLoginError(429, {
      'Retry-After': String(rateDecision.retryAfterSeconds),
      'Cache-Control': 'no-store',
    });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return Response.json({ error: 'Autentificarea nu este configurată.' }, { status: 503 });
  }
  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await authClient.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });

  if (error || !data.user || !data.session) {
    let failedDecision;
    try {
      await recordRateLimitResult(serviceAdmin, rateEntries, false);
      failedDecision = await checkRateLimit(serviceAdmin, rateEntries);
    } catch {
      return Response.json({ error: 'Protecția autentificării nu este disponibilă.' }, { status: 503 });
    }
    await serviceAdmin.from('security_events').insert({
      event_type: 'login_failed',
      module: 'auth',
      action: 'login',
      result: 'failure',
      reason: 'invalid_credentials',
    }).then(() => undefined, () => undefined);
    await appendAuditEvent({
      client: serviceAdmin,
      request,
      action: 'auth.login_failed',
      entityType: 'session',
      result: 'failure',
      reason: 'invalid_credentials',
      metadata: { provider: 'password', identifier_omitted: true },
    }).catch(() => undefined);
    if (!failedDecision.allowed) {
      return genericLoginError(429, {
        'Retry-After': String(failedDecision.retryAfterSeconds),
        'Cache-Control': 'no-store',
      });
    }
    return genericLoginError();
  }

  const { data: profile } = await serviceAdmin
    .from('profiles')
    .select('agency_id, role, permissions, status, force_password_change')
    .eq('user_id', data.user.id)
    .single();
  if (!profile?.agency_id || (profile.status && profile.status !== 'active')) {
    await serviceAdmin.auth.admin.signOut(data.session.access_token, 'global').catch(() => undefined);
    await recordRateLimitResult(serviceAdmin, rateEntries, false).catch(() => undefined);
    return genericLoginError();
  }

  const claims = verifiedAccessTokenClaims(data.session.access_token, data.user.id);
  if (!claims) {
    await serviceAdmin.auth.admin.signOut(data.session.access_token, 'global').catch(() => undefined);
    return genericLoginError();
  }
  let security;
  try {
    security = await authorizeAppSession(serviceAdmin, request, claims, { allowRegistration: true });
  } catch {
    await serviceAdmin.auth.admin.signOut(data.session.access_token, 'global').catch(() => undefined);
    return Response.json({ error: 'Verificarea sesiunii nu este disponibilă.' }, { status: 503 });
  }

  try {
    await recordRateLimitResult(serviceAdmin, rateEntries, true);
    await appendAuditEvent({
      client: serviceAdmin,
      request,
      agencyId: profile.agency_id,
      actorUserId: data.user.id,
      actorRole: profile.role,
      action: 'auth.login',
      entityType: 'session',
      entityId: claims.sessionId,
      after: { authenticated: true, aal: claims.aal, mfa_required: security.mfaRequired },
    });
  } catch {
    await serviceAdmin.auth.admin.signOut(data.session.access_token, 'global').catch(() => undefined);
    return Response.json({ error: 'Jurnalul de securitate nu este disponibil.' }, { status: 503 });
  }

  const mailboxAddress = await mailboxAddressForUser(
    serviceAdmin,
    profile.agency_id,
    data.user.id,
  ).catch(() => undefined);
  const mailboxRequired = mailOnboardingEnabled()
    && hasPermission(profile.role, 'mail', 'create', profile.permissions)
    && mailboxAddress === null;
  const nextPath = security.passwordChangeRequired
    ? '/auth/schimba-parola'
    : security.mfaRequired && claims.aal !== 'aal2'
      ? '/auth/mfa'
      : mailboxRequired
        ? '/auth/email-setup'
        : '/dashboard';

  return Response.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    user: { id: data.user.id, email: data.user.email || '' },
    security: {
      aal: claims.aal,
      mfa_required: security.mfaRequired,
      password_change_required: security.passwordChangeRequired,
      mailbox_required: mailboxRequired,
      mailbox_address: mailboxAddress || null,
    },
    next_path: nextPath,
  }, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Pragma': 'no-cache',
    },
  });
}
