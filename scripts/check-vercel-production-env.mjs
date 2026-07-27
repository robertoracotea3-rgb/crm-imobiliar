import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const authPath = process.env.VERCEL_AUTH_FILE
  || join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'xdg.data', 'com.vercel.cli', 'auth.json');
const project = JSON.parse(await readFile(resolve('.vercel/project.json'), 'utf8'));
const auth = JSON.parse(await readFile(authPath, 'utf8'));
if (!auth.token) throw new Error('Autentificarea locală Vercel nu este disponibilă.');

const endpoint = new URL(`https://api.vercel.com/v10/projects/${encodeURIComponent(project.projectId)}/env`);
endpoint.searchParams.set('teamId', project.orgId);
endpoint.searchParams.set('decrypt', 'true');
const response = await fetch(endpoint, {
  headers: { Authorization: `Bearer ${auth.token}` },
});
if (!response.ok) throw new Error(`Verificarea Vercel a eșuat cu status ${response.status}.`);
const payload = await response.json();
const hasProductionTarget = item => (
  item.target === 'production'
  || (Array.isArray(item.target) && item.target.includes('production'))
);
const productionRows = (payload.envs || []).filter(hasProductionTarget);
const productionNames = new Set(productionRows.map(item => item.key));

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'REGISTRATION_ACCESS_CODE',
  'NEXT_PUBLIC_APP_URL',
  'CRON_SECRET',
  'AUTH_SECURITY_HASH_SALT',
  'AUDIT_IP_HASH_SALT',
  'PORTAL_TOKEN_ENCRYPTION_KEY',
];
const missing = required.filter(name => !productionNames.has(name));

const domainsEndpoint = new URL(
  `https://api.vercel.com/v9/projects/${encodeURIComponent(project.projectId)}/domains`,
);
domainsEndpoint.searchParams.set('teamId', project.orgId);
const domainsResponse = await fetch(domainsEndpoint, {
  headers: { Authorization: `Bearer ${auth.token}` },
});
if (!domainsResponse.ok) {
  throw new Error(`Verificarea domeniilor Vercel a eșuat cu status ${domainsResponse.status}.`);
}
const domainsPayload = await domainsResponse.json();
const productionDomain = (domainsPayload.domains || [])
  .find(domain => domain.name === 'crm.kiraimobiliare.ro');

const integrationNames = [
  'STORIA_CLIENT_ID',
  'STORIA_CLIENT_SECRET',
  'STORIA_API_KEY',
  'STORIA_WEBHOOK_SECRET',
];
const result = {
  production_variable_names_visible: productionRows.map(item => item.key).sort(),
  required_config_complete: missing.length === 0,
  missing_required_names: missing,
  production_domain_attached: Boolean(productionDomain),
  production_domain_verified: productionDomain?.verified === true,
  storia_configuration_names_present: integrationNames.every(name => productionNames.has(name)),
  storia_test_mode_configured: productionNames.has('STORIA_TEST_MODE'),
  anthropic_key_configured: productionNames.has('ANTHROPIC_API_KEY'),
  email_provider_key_configured: productionNames.has('RESEND_API_KEY'),
  values_intentionally_not_materialized: true,
};
console.log(JSON.stringify(result, null, 2));
