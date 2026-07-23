import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  hashSecurityValue,
  verifiedAccessTokenClaims,
} from '../lib/account-security-core.ts';
import { isStrongPassword } from '../lib/password-policy.ts';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');

test('verified access-token claims bind the authenticated user, session and AAL', () => {
  const userId = '25000000-0000-4000-8000-000000000002';
  const token = [
    encode({ alg: 'HS256' }),
    encode({
      sub: userId,
      session_id: '25000000-0000-4000-8000-000000000004',
      aal: 'aal2',
      iat: 1_800_000_000,
      exp: 1_800_003_600,
    }),
    'signature-already-verified-by-supabase',
  ].join('.');
  const claims = verifiedAccessTokenClaims(token, userId);
  assert.equal(claims?.aal, 'aal2');
  assert.equal(claims?.sessionId, '25000000-0000-4000-8000-000000000004');
  assert.equal(verifiedAccessTokenClaims(token, '25000000-0000-4000-8000-000000000099'), null);
  assert.equal(verifiedAccessTokenClaims('invalid', userId), null);
});

test('login and IP identifiers use scoped, salted, irreversible hashes', () => {
  const previous = process.env.AUTH_SECURITY_HASH_SALT;
  process.env.AUTH_SECURITY_HASH_SALT = 'phase25-synthetic-salt-with-32-characters';
  try {
    const account = hashSecurityValue('login-account', ' TEST@FORTIS.CRM ');
    const sameAccount = hashSecurityValue('login-account', 'test@fortis.crm');
    const ipScope = hashSecurityValue('request-ip', 'test@fortis.crm');
    assert.match(account, /^[a-f0-9]{64}$/);
    assert.equal(account, sameAccount);
    assert.notEqual(account, ipScope);
    assert.doesNotMatch(account, /test|fortis/i);
  } finally {
    if (previous === undefined) delete process.env.AUTH_SECURITY_HASH_SALT;
    else process.env.AUTH_SECURITY_HASH_SALT = previous;
  }
});

test('new and temporary passwords use one strong server policy', () => {
  assert.equal(isStrongPassword('Parola-Noua-2026!'), true);
  assert.equal(isStrongPassword('123456789000'), false);
  assert.equal(isStrongPassword('doar-litere-mici'), false);
  assert.equal(isStrongPassword('Scurta1!'), false);
});

test('account security migration enforces persistent throttling, sessions and MFA at RLS', async () => {
  const migration = await read('migrations/20260723_200_account_security.sql');
  assert.match(migration, /create table if not exists public\.crm_auth_rate_limits/);
  assert.match(migration, /create table if not exists public\.crm_user_sessions/);
  assert.match(migration, /crm_auth_rate_limit_check/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /session_max_minutes integer not null default 720/);
  assert.match(migration, /session_idle_minutes integer not null default 30/);
  assert.match(migration, /profile\.role in \('owner', 'admin'\)/);
  assert.match(migration, /auth\.mfa_factors/);
  assert.match(migration, /session_not_registered/);
  assert.match(migration, /p_allow_register boolean/);
  assert.match(migration, /crm_prepare_password_change/);
  assert.match(migration, /crm_complete_password_change/);
  assert.match(migration, /crm_revoke_user_sessions/);
  assert.match(migration, /as restrictive for all to authenticated/);
  assert.match(migration, /storage\.objects/);
  assert.match(migration, /lower\(coalesce\(account\.email, ''\)\) = 'test@fortis\.crm'/);
  assert.doesNotMatch(migration, /grant .*crm_auth_rate_limits.*authenticated/i);
});

test('login is server mediated, rate limited and never returns raw provider errors', async () => {
  const login = await read('app/api/auth/login/route.ts');
  const context = await read('lib/auth-context.tsx');
  assert.match(login, /checkRateLimit/);
  assert.match(login, /recordRateLimitResult/);
  assert.match(login, /allowRegistration: true/);
  assert.match(login, /signInWithPassword/);
  assert.match(login, /auth\.login_failed/);
  assert.match(login, /Cache-Control': 'no-store/);
  assert.doesNotMatch(login, /error\.message/);
  assert.match(context, /fetch\('\/api\/auth\/login'/);
  assert.doesNotMatch(context, /signInWithPassword/);
});

test('MFA enrollment, challenge and API enforcement are wired end to end', async () => {
  const [mfaPage, apiAuth, securityRoute] = await Promise.all([
    read('app/auth/mfa/page.tsx'),
    read('lib/server/api-auth.ts'),
    read('app/api/auth/security/route.ts'),
  ]);
  assert.match(mfaPage, /auth\.mfa\.enroll/);
  assert.match(mfaPage, /auth\.mfa\.challenge/);
  assert.match(mfaPage, /auth\.mfa\.verify/);
  assert.match(apiAuth, /MFA_REQUIRED/);
  assert.match(apiAuth, /authorizeAppSession/);
  assert.match(securityRoute, /session\.aal !== 'aal2'/);
  assert.match(securityRoute, /auth\.mfa_verified/);
});

test('session management and credential changes revoke old sessions without exposing secrets', async () => {
  const [sessions, security, team, login, registration] = await Promise.all([
    read('app/api/auth/sessions/route.ts'),
    read('app/api/auth/security/route.ts'),
    read('app/api/team/members/[id]/route.ts'),
    read('app/api/auth/login/route.ts'),
    read('app/api/auth/register/route.ts'),
  ]);
  assert.match(sessions, /scope === 'others'/);
  assert.match(sessions, /scope === 'global'/);
  assert.match(sessions, /auth\.admin\.signOut/);
  assert.match(security, /crm_prepare_password_change/);
  assert.match(security, /crm_complete_password_change/);
  assert.match(security, /current_password/);
  assert.match(security, /signInWithPassword/);
  assert.match(security, /auth\.password_changed/);
  assert.match(team, /administrator_password_reset/);
  assert.match(team, /username_changed/);
  assert.match(team, /force_password_change = true|force_password_change =/);
  assert.match(team, /Numai proprietarul poate modifica accesul unui proprietar/);
  assert.doesNotMatch(sessions, /select\([^)]*refresh_token/);
  assert.doesNotMatch(
    [login, security, team, registration].join('\n'),
    /console\.(?:log|error|warn)\([^)]*(?:password|current_password|accessCode)/i,
  );
});
