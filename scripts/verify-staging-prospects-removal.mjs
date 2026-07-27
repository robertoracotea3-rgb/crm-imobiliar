import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const STAGING_REF = 'npvkcuehviujbdegpneq';

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
if (!env.SUPABASE_ACCESS_TOKEN) {
  throw new Error('Tokenul local Supabase Management nu este configurat.');
}

async function query(sql) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${STAGING_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  if (!response.ok) {
    throw new Error(`Interogarea staging a eșuat cu status ${response.status}.`);
  }
  return response.json();
}

const summarySql = `
select json_build_object(
  'tables', count(*)::integer,
  'rls_tables', count(*) filter (where c.relrowsecurity)::integer,
  'prospects_exists', to_regclass('public.prospects') is not null,
  'source_health_exists', to_regclass('public.prospect_source_health') is not null,
  'sync_runs_exists', to_regclass('public.prospect_sync_runs') is not null,
  'properties_exists', to_regclass('public.properties') is not null,
  'contacts_exists', to_regclass('public.contacts') is not null,
  'leads_exists', to_regclass('public.leads') is not null,
  'demands_exists', to_regclass('public.demands') is not null,
  'transactions_exists', to_regclass('public.transactions') is not null
) as summary
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r';
`;

const before = await query(summarySql);
console.log(`STAGING_BEFORE=${JSON.stringify(before[0]?.summary || null)}`);
const migration = await readFile(
  resolve('migrations/20260727_340_remove_prospects_module.sql'),
  'utf8',
);
await query(migration);
await query(migration);
const after = await query(summarySql);
const summary = after[0]?.summary;
console.log(`STAGING_AFTER=${JSON.stringify(summary || null)}`);
if (!summary
  || summary.prospects_exists
  || summary.source_health_exists
  || summary.sync_runs_exists
  || !summary.properties_exists
  || !summary.contacts_exists
  || !summary.leads_exists
  || !summary.demands_exists
  || !summary.transactions_exists
  || summary.tables < 90
  || summary.tables !== summary.rls_tables) {
  throw new Error('Verificarea eliminării modulului Particulari în staging a eșuat.');
}
console.log('STAGING_PROSPECTS_REMOVAL_OK=1');
