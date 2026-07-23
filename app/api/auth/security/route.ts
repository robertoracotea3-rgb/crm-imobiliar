export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

import { appendAuditEvent } from '@/lib/server/audit-log';
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from '@/lib/password-policy';
import {
  checkRateLimit,
  hashSecurityValue,
  recordRateLimitResult,
  requestIpHash,
} from '@/lib/server/account-security';
import { requireApiAuth } from '@/lib/server/api-auth';

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, undefined, {
    allowMfaSetup: true,
    allowPasswordChange: true,
  });
  if (!auth.ok) return auth.response;
  const { serviceAdmin, user, session } = auth.context;
  const { data, error } = await serviceAdmin.auth.admin.mfa.listFactors({ userId: user.id });
  if (error) return Response.json({ error: 'Factorii 2FA nu au putut fi verificați.' }, { status: 500 });
  return Response.json({
    aal: session.aal,
    mfa_required: session.mfaRequired,
    password_change_required: session.passwordChangeRequired,
    factors: (data?.factors || []).map(factor => ({
      id: factor.id,
      status: factor.status,
      factor_type: factor.factor_type,
      friendly_name: factor.friendly_name || null,
      created_at: factor.created_at,
      updated_at: factor.updated_at,
    })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, undefined, {
    allowMfaSetup: true,
    allowPasswordChange: true,
  });
  if (!auth.ok) return auth.response;
  const {
    serviceAdmin, user, agencyId, role, accessToken, session,
  } = auth.context;
  const body = await request.json().catch(() => ({}));
  const action = typeof body.action === 'string' ? body.action : '';

  if (action === 'password_change') {
    if (!isStrongPassword(body.password) || body.password !== body.password_confirm) {
      return Response.json({ error: PASSWORD_POLICY_MESSAGE }, { status: 400 });
    }
    if (typeof body.current_password !== 'string' || body.current_password.length < 1) {
      return Response.json({ error: 'Parola curentă este obligatorie.' }, { status: 400 });
    }
    if (session.mfaRequired && session.aal !== 'aal2' && !session.passwordChangeRequired) {
      return Response.json({ error: 'Confirmă mai întâi codul 2FA.' }, { status: 403 });
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey || !user.email) {
      return Response.json({ error: 'Reautentificarea nu este configurată.' }, { status: 503 });
    }
    const verificationClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    let accountHash: string;
    let ipHash: string | null;
    try {
      accountHash = hashSecurityValue('login-account', user.email);
      ipHash = requestIpHash(request);
    } catch {
      return Response.json({ error: 'Protecția parolei nu este configurată.' }, { status: 503 });
    }
    const rateEntries: Array<{ scope: 'login_account' | 'login_ip'; keyHash: string }> = [
      { scope: 'login_account', keyHash: accountHash },
    ];
    if (ipHash) rateEntries.push({ scope: 'login_ip', keyHash: ipHash });
    let limit;
    try {
      limit = await checkRateLimit(serviceAdmin, rateEntries);
    } catch {
      return Response.json({ error: 'Protecția parolei nu este disponibilă.' }, { status: 503 });
    }
    if (!limit.allowed) {
      return Response.json(
        { error: 'Prea multe încercări. Încearcă din nou mai târziu.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
      );
    }
    const { data: verification, error: verificationError } = await verificationClient.auth.signInWithPassword({
      email: user.email,
      password: body.current_password,
    });
    if (verificationError || !verification.session) {
      try {
        await recordRateLimitResult(serviceAdmin, rateEntries, false);
        const failedLimit = await checkRateLimit(serviceAdmin, rateEntries);
        if (!failedLimit.allowed) {
          return Response.json(
            { error: 'Prea multe încercări. Încearcă din nou mai târziu.' },
            { status: 429, headers: { 'Retry-After': String(failedLimit.retryAfterSeconds) } },
          );
        }
      } catch {
        return Response.json({ error: 'Protecția parolei nu este disponibilă.' }, { status: 503 });
      }
      return Response.json({ error: 'Parola curentă nu este corectă.' }, { status: 403 });
    }
    try {
      await recordRateLimitResult(serviceAdmin, rateEntries, true);
    } catch {
      await serviceAdmin.auth.admin
        .signOut(verification.session.access_token, 'local')
        .catch(() => undefined);
      return Response.json({ error: 'Protecția parolei nu este disponibilă.' }, { status: 503 });
    }

    const { data: prepared, error: prepareError } = await serviceAdmin.rpc(
      'crm_prepare_password_change',
      {
        p_user_id: user.id,
        p_agency_id: agencyId,
        p_actor_id: user.id,
        p_reason: 'password_changed',
      },
    );
    if (prepareError || prepared !== true) {
      await serviceAdmin.auth.admin
        .signOut(verification.session.access_token, 'local')
        .catch(() => undefined);
      return Response.json({ error: 'Schimbarea parolei nu a putut fi pregătită.' }, { status: 503 });
    }

    const { error } = await serviceAdmin.auth.admin.updateUserById(user.id, {
      password: body.password,
    });
    if (error) {
      await serviceAdmin.auth.admin.signOut(verification.session.access_token, 'local').catch(() => undefined);
      await serviceAdmin.auth.admin.signOut(accessToken, 'global').catch(() => undefined);
      return Response.json({
        error: 'Parola nu a putut fi schimbată. Autentifică-te din nou și reîncearcă.',
        reauthenticate: true,
        next_path: '/login',
      }, { status: 500 });
    }

    const { data: completed, error: completeError } = await serviceAdmin.rpc(
      'crm_complete_password_change',
      { p_user_id: user.id, p_agency_id: agencyId },
    );
    if (completeError || completed !== true) {
      await serviceAdmin.auth.admin.signOut(accessToken, 'global').catch(() => undefined);
      return Response.json({
        error: 'Parola a fost schimbată, dar contul trebuie verificat din nou la autentificare.',
        reauthenticate: true,
        next_path: '/login',
      }, { status: 503 });
    }

    await serviceAdmin.auth.admin.signOut(accessToken, 'global').catch(() => undefined);
    await appendAuditEvent({
      client: serviceAdmin, request, agencyId, actorUserId: user.id, actorRole: role,
      action: 'auth.password_changed', entityType: 'profile', entityId: user.id,
      after: { password_changed: true, reauthenticated: true, all_sessions_revoked: true },
    });
    return Response.json({ success: true, next_path: '/login' });
  }

  if (action === 'mfa_verified') {
    if (session.aal !== 'aal2') {
      return Response.json({ error: 'Codul 2FA nu a fost confirmat.' }, { status: 403 });
    }
    const { data: factors, error } = await serviceAdmin.auth.admin.mfa.listFactors({ userId: user.id });
    if (error || !(factors?.factors || []).some(factor => factor.status === 'verified')) {
      return Response.json({ error: 'Nu există un factor 2FA verificat.' }, { status: 400 });
    }
    const verifiedAt = new Date().toISOString();
    const { error: profileError } = await serviceAdmin.from('profiles').update({
      mfa_enrolled_at: verifiedAt,
      security_updated_at: verifiedAt,
    }).eq('user_id', user.id).eq('agency_id', agencyId);
    if (profileError) {
      return Response.json({ error: 'Confirmarea 2FA nu a putut fi salvată.' }, { status: 500 });
    }
    await appendAuditEvent({
      client: serviceAdmin, request, agencyId, actorUserId: user.id, actorRole: role,
      action: 'auth.mfa_verified', entityType: 'profile', entityId: user.id,
      after: { aal: 'aal2', factor: 'totp' },
    });
    return Response.json({ success: true, next_path: '/dashboard' });
  }

  return Response.json({ error: 'Acțiune de securitate invalidă.' }, { status: 400 });
}
