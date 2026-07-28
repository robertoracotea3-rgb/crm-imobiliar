import { readFile } from 'node:fs/promises';

const STAGING_REF = 'npvkcuehviujbdegpneq';

async function loadEnv(path = '.env.local') {
  const result = {};
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
    result[key] = value;
  }
  return result;
}

const env = await loadEnv();
const token = String(env.SUPABASE_ACCESS_TOKEN || '').trim();
if (!token) throw new Error('SUPABASE_ACCESS_TOKEN lipsește din configurația locală.');

async function query(sql) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${STAGING_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
      signal: AbortSignal.timeout(120_000),
    },
  );
  if (!response.ok) {
    throw new Error(`Interogarea staging a eșuat cu status ${response.status}.`);
  }
  return response.json();
}

const migration = await readFile('migrations/20260727_350_agent_webmail.sql', 'utf8');
const officeAliasMigration = await readFile(
  'migrations/20260728_360_owner_office_mailbox.sql',
  'utf8',
);
await query(migration);
await query(migration);
await query(officeAliasMigration);
await query(officeAliasMigration);

const result = await query(`
select
  to_regclass('public.crm_mailboxes') is not null as mailboxes_exists,
  to_regclass('public.crm_mail_messages') is not null as messages_exists,
  to_regclass('public.crm_mail_attachments') is not null as attachments_exists,
  to_regprocedure('public.crm_claim_personal_mailbox(text)') is not null as claim_exists,
  (
    select pg_get_constraintdef(oid) not ilike '%office%'
    from pg_constraint
    where conrelid = 'public.crm_mailboxes'::regclass
      and conname = 'crm_mailboxes_reserved_check'
  ) as office_constraint_allows_claim,
  (
    select count(*) = 3
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in ('crm_mailboxes', 'crm_mail_messages', 'crm_mail_attachments')
      and relation.relrowsecurity
  ) as rls_complete;
`);
const row = Array.isArray(result) ? result[0] : null;
if (!row || Object.values(row).some(value => value !== true)) {
  throw new Error('Verificarea staging pentru modulul de e-mail nu a trecut.');
}
console.log(JSON.stringify({ project_ref: STAGING_REF, migration: '350', ...row }, null, 2));
