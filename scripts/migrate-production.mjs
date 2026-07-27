import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  readFile, readdir, stat,
} from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

const EXPECTED_PROJECT_REF = 'idpjifivdaqhsysvjmye';
const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const option = name => args.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);

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

function redacted(value) {
  return String(value || '')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[DATABASE_URL_REDACTED]')
    .replace(/password=[^\s]+/gi, 'password=[REDACTED]')
    .slice(-20_000);
}

function databaseEnvironment(databaseUrl) {
  const parsed = new URL(databaseUrl);
  const identity = `${parsed.hostname}:${decodeURIComponent(parsed.username)}`;
  if (!identity.includes(EXPECTED_PROJECT_REF)) {
    throw new Error('Conexiunea nu indică proiectul Supabase Production aprobat.');
  }
  return {
    ...process.env,
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || '5432',
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: parsed.pathname.replace(/^\//, ''),
    PGSSLMODE: parsed.searchParams.get('sslmode') || 'require',
  };
}

async function runSql(environment, sql, quiet = true) {
  const image = process.env.KIRA_PG_TOOLS_IMAGE || 'postgres:17-alpine';
  const dockerArgs = [
    'run', '--rm', '-i',
    '-e', 'PGHOST',
    '-e', 'PGPORT',
    '-e', 'PGUSER',
    '-e', 'PGPASSWORD',
    '-e', 'PGDATABASE',
    '-e', 'PGSSLMODE',
    image,
    'psql', '-X', '-v', 'ON_ERROR_STOP=1',
  ];
  if (quiet) dockerArgs.push('-qAt');
  const child = spawn('docker', dockerArgs, {
    cwd: process.cwd(),
    env: environment,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout = `${stdout}${chunk}`.slice(-100_000); });
  child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-100_000); });
  child.stdin.end(sql);
  const [code] = await once(child, 'close');
  if (code !== 0) {
    throw new Error(`Migrarea PostgreSQL a eșuat: ${redacted(stderr || stdout || `cod ${code}`)}`);
  }
  return stdout.trim();
}

const snapshotSql = `
create or replace function pg_temp.crm_table_count(p_table text)
returns bigint
language plpgsql
as $$
declare
  result bigint;
begin
  if to_regclass(format('public.%I', p_table)) is null then
    return null;
  end if;
  execute format('select count(*) from public.%I', p_table) into result;
  return result;
end
$$;

select json_build_object(
  'tables', (
    select count(*)::integer
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'
  ),
  'rls_tables', (
    select count(*)::integer
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relrowsecurity
  ),
  'agencies', pg_temp.crm_table_count('agencies'),
  'profiles', pg_temp.crm_table_count('profiles'),
  'properties', pg_temp.crm_table_count('properties'),
  'contacts', pg_temp.crm_table_count('contacts'),
  'leads', pg_temp.crm_table_count('leads'),
  'demands', pg_temp.crm_table_count('demands'),
  'transactions', pg_temp.crm_table_count('transactions'),
  'crm_mailboxes', pg_temp.crm_table_count('crm_mailboxes'),
  'crm_mail_messages', pg_temp.crm_table_count('crm_mail_messages'),
  'crm_mail_attachments', pg_temp.crm_table_count('crm_mail_attachments'),
  'prospects', pg_temp.crm_table_count('prospects'),
  'prospect_source_health', pg_temp.crm_table_count('prospect_source_health'),
  'prospect_sync_runs', pg_temp.crm_table_count('prospect_sync_runs'),
  'external_prospect_foreign_keys', (
    select count(*)::integer
    from pg_constraint
    where contype='f'
      and confrelid=to_regclass('public.prospects')
      and conrelid not in (
        coalesce(to_regclass('public.prospect_source_health')::oid, 0::oid),
        coalesce(to_regclass('public.prospect_sync_runs')::oid, 0::oid)
      )
  )
)::text;
`;

async function snapshot(environment) {
  const output = await runSql(environment, snapshotSql);
  const line = output.split(/\r?\n/).find(value => value.trim().startsWith('{'));
  if (!line) throw new Error('Verificarea bazei nu a returnat sumarul așteptat.');
  return JSON.parse(line);
}

async function sha256(path) {
  const hash = createHash('sha256');
  const file = await import('node:fs').then(module => module.createReadStream(path));
  file.on('data', chunk => hash.update(chunk));
  await once(file, 'end');
  return hash.digest('hex');
}

async function verifyBackup(pathValue, configuredDirectory) {
  if (!pathValue) throw new Error('--backup este obligatoriu înainte de Production.');
  const path = resolve(pathValue);
  const backupRoot = resolve(configuredDirectory || '');
  if (!configuredDirectory || dirname(path) !== backupRoot || basename(path).includes('..')) {
    throw new Error('Backupul confirmat nu se află în directorul operațional configurat.');
  }
  const [info, metadata] = await Promise.all([
    stat(path),
    readFile(`${path}.meta.json`, 'utf8').then(JSON.parse),
  ]);
  const ageMinutes = (Date.now() - info.mtimeMs) / 60_000;
  if (ageMinutes < 0 || ageMinutes > 60) {
    throw new Error('Backupul Production trebuie să fie creat în ultima oră.');
  }
  if (metadata.size !== info.size || metadata.encrypted_sha256 !== await sha256(path)) {
    throw new Error('Hashul sau dimensiunea backupului Production nu corespund.');
  }
  return {
    path,
    created_at: metadata.created_at,
    sha256: metadata.encrypted_sha256,
    size: metadata.size,
  };
}

async function migrationSql() {
  const names = (await readdir(resolve('migrations')))
    .filter(name => /^\d{8}_\d{3}_[^.]+\.sql$/.test(name))
    .sort();
  if (names.length !== 35 || names.at(-1) !== '20260727_350_agent_webmail.sql') {
    throw new Error(`Lanțul Production nu este cel verificat (găsite ${names.length} migrări).`);
  }
  const selectedNames = flag('latest-only') ? [names.at(-1)] : names;
  const chunks = [
    '\\set ON_ERROR_STOP on',
    "set lock_timeout='15s';",
    "set statement_timeout='5min';",
    "select pg_advisory_lock(hashtext('kira-crm-production-migration-20260727'));",
  ];
  for (const name of selectedNames) {
    chunks.push(`\\echo APPLY ${name}`);
    chunks.push(await readFile(resolve('migrations', name), 'utf8'));
  }
  chunks.push("select pg_advisory_unlock(hashtext('kira-crm-production-migration-20260727'));");
  return chunks.join('\n');
}

const env = await loadEnv();
const environment = databaseEnvironment(env.SUPABASE_DB_URL || '');
const before = await snapshot(environment);
console.log(`PRODUCTION_PREFLIGHT=${JSON.stringify(before)}`);

if (!flag('apply')) process.exit(0);
if (option('confirm-production-ref') !== EXPECTED_PROJECT_REF) {
  throw new Error('Confirmarea explicită a proiectului Production lipsește.');
}
if (Number(before.external_prospect_foreign_keys || 0) > 0) {
  throw new Error('Există tabele externe care depind de Particulari; ștergerea a fost oprită.');
}

const backup = await verifyBackup(option('backup'), env.BACKUP_DIRECTORY);
console.log(`BACKUP_VERIFIED=${JSON.stringify(backup)}`);
await runSql(environment, await migrationSql(), false);

const after = await snapshot(environment);
console.log(`PRODUCTION_POSTCHECK=${JSON.stringify(after)}`);
for (const table of ['properties', 'contacts', 'leads', 'demands', 'transactions']) {
  if (before[table] != null && (after[table] == null || after[table] < before[table])) {
    throw new Error(`Numărul de înregistrări din ${table} a scăzut neașteptat.`);
  }
}
if (after.prospects != null || after.prospect_source_health != null || after.prospect_sync_runs != null) {
  throw new Error('Obiectele modulului Particulari nu au fost eliminate complet.');
}
for (const table of ['crm_mailboxes', 'crm_mail_messages', 'crm_mail_attachments']) {
  if (after[table] == null) {
    throw new Error(`Migrarea de e-mail nu a creat tabelul ${table}.`);
  }
}
if (after.tables < 90 || after.tables !== after.rls_tables) {
  throw new Error(`Schema Production nu are protecție RLS completă (${after.tables}/${after.rls_tables}).`);
}
console.log('PRODUCTION_MIGRATIONS_OK=1');
