import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const baseUrl = String(process.env.KIRA_SMOKE_BASE_URL || 'https://crm.kiraimobiliare.ro')
  .replace(/\/+$/, '');
const username = String(process.env.KIRA_SMOKE_USERNAME || 'TEST');
const password = String(process.env.KIRA_SMOKE_PASSWORD || '');
if (!password) throw new Error('KIRA_SMOKE_PASSWORD este obligatorie.');
const skipPasswordLogin = process.env.KIRA_SKIP_PASSWORD_LOGIN === 'true';

async function loadEnv(path = '.env.local') {
  const values = {};
  for (const rawLine of (await readFile(path, 'utf8')).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

async function request(path, init = {}) {
  return fetch(`${baseUrl}${path}`, {
    redirect: 'manual',
    cache: 'no-store',
    ...init,
  });
}

const loginPage = await request('/login');
const loginHtml = await loginPage.text();
const removedApi = await request('/api/prospects');
const cronStatuses = {};
for (const route of ['automations', 'storia-sync', 'weekly-reports']) {
  cronStatuses[route] = (await request(`/api/cron/${route}`)).status;
}

let loginStatus = 0;
let loginBody = {};
if (!skipPasswordLogin) {
  const login = await request('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: baseUrl,
      'Sec-Fetch-Site': 'same-origin',
    },
    body: JSON.stringify({ username, password }),
  });
  loginStatus = login.status;
  loginBody = await login.json().catch(() => ({}));
}
const env = await loadEnv();
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
let accessToken = loginBody.access_token;
let authenticationMethod = 'password';
if (loginStatus !== 200 || typeof accessToken !== 'string' || !accessToken) {
  authenticationMethod = 'admin_generated_magiclink';
  const email = `${username.trim().toLowerCase()}@fortis.crm`;
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    throw new Error(`Autentificarea TEST și fallbackul controlat au eșuat (${loginStatus}).`);
  }
  const anon = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
    type: 'magiclink',
    token_hash: tokenHash,
  });
  accessToken = verified.session?.access_token;
  if (verifyError || !verified.user || !accessToken) {
    throw new Error(
      `Sesiunea controlată TEST nu a putut fi creată (${verifyError?.code || verifyError?.status || 'no_session'}).`,
    );
  }
  const claims = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'));
  const { data: authorization, error: authorizationError } = await admin.rpc(
    'crm_authorize_app_session',
    {
      p_session_id: claims.session_id,
      p_user_id: verified.user.id,
      p_aal: claims.aal || 'aal1',
      p_token_issued_at: new Date(Number(claims.iat) * 1000).toISOString(),
      p_token_expires_at: new Date(Number(claims.exp) * 1000).toISOString(),
      p_ip_hash: null,
      p_user_agent: 'kira-production-smoke',
      p_allow_register: true,
    },
  );
  const decision = Array.isArray(authorization) ? authorization[0] : authorization;
  if (authorizationError || decision?.authorized !== true) {
    await admin.auth.admin.signOut(accessToken, 'local').catch(() => undefined);
    throw new Error(
      `Sesiunea controlată TEST nu a fost autorizată de CRM (${authorizationError?.code || decision?.reason || 'unknown'}).`,
    );
  }
}

const context = await request('/api/auth/context', {
  headers: { Authorization: `Bearer ${accessToken}` },
});
const contextBody = await context.json().catch(() => ({}));
const hasRetiredPermission = Boolean(
  contextBody.permissions
  && typeof contextBody.permissions === 'object'
  && Object.hasOwn(contextBody.permissions, 'prospects'),
);

const claims = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'));
await admin.auth.admin.signOut(accessToken, 'local').catch(() => undefined);
try {
  await admin.from('crm_user_sessions').update({
    revoked_at: new Date().toISOString(),
    revoked_reason: 'production_smoke_complete',
    updated_at: new Date().toISOString(),
  }).eq('session_id', claims.session_id);
} catch {
  // The Supabase auth session was already revoked above.
}

const result = {
  base_url: baseUrl,
  login_page_status: loginPage.status,
  login_page_has_form: /Nume utilizator|Autentificare/i.test(loginHtml),
  security_headers: {
    content_security_policy: loginPage.headers.has('content-security-policy'),
    content_type_options: loginPage.headers.get('x-content-type-options') === 'nosniff',
    referrer_policy: loginPage.headers.has('referrer-policy'),
  },
  retired_prospects_api_status: removedApi.status,
  cron_unauthorized_statuses: cronStatuses,
  password_login_status: loginStatus,
  authentication_method: authenticationMethod,
  login_next_path: loginBody.next_path || null,
  context_status: context.status,
  agency_present: Boolean(contextBody.agency?.id),
  role_present: typeof contextBody.role === 'string' && contextBody.role.length > 0,
  retired_permission_absent: !hasRetiredPermission,
};
console.log(JSON.stringify(result, null, 2));

if (result.login_page_status !== 200
  || !result.login_page_has_form
  || !Object.values(result.security_headers).every(Boolean)
  || result.retired_prospects_api_status !== 404
  || Object.values(result.cron_unauthorized_statuses).some(status => status !== 401)
  || result.context_status !== 200
  || !result.agency_present
  || !result.role_present
  || !result.retired_permission_absent) {
  throw new Error('Verificarea Production nu a trecut toate condițiile.');
}
console.log('PRODUCTION_SMOKE_OK=1');
