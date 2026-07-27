import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

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

const env = await loadEnv();
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const [{ data: authData, error: authError }, { data: profiles, error: profileError }] = await Promise.all([
  admin.auth.admin.listUsers({ page: 1, perPage: 1_000 }),
  admin.from('profiles').select('user_id,status,role,full_name,force_password_change'),
]);
if (authError || profileError) throw new Error('Conturile Production nu au putut fi verificate.');
const byUser = new Map((profiles || []).map(profile => [profile.user_id, profile]));
const summary = (authData.users || []).map(user => {
  const profile = byUser.get(user.id);
  const email = String(user.email || '').toLowerCase();
  return {
    username: email.endsWith('@fortis.crm') ? email.slice(0, -'@fortis.crm'.length) : 'external-email',
    status: profile?.status || 'missing_profile',
    role: profile?.role || null,
    force_password_change: profile?.force_password_change === true,
  };
}).sort((left, right) => left.username.localeCompare(right.username));
console.log(JSON.stringify(summary, null, 2));
