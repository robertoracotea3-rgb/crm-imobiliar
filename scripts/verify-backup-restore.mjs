import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const container = process.env.KIRA_TEST_DB_CONTAINER || 'kira-crm-sql-test';
const sourceDatabase = 'crm_backup_source_phase24';
const targetDatabase = 'crm_restore_test_phase24';
const workDirectory = await mkdtemp(join(tmpdir(), 'kira-backup-restore-'));
const key = Buffer.alloc(32, 24).toString('base64');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
    ...options,
  });
  return result;
}

function mustRun(command, args, options) {
  const result = run(command, args, options);
  if (result.status !== 0) {
    throw new Error([
      `${command} ${args.join(' ')} failed`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'));
  }
  return result.stdout || '';
}

function psql(database, sql) {
  return mustRun('docker', [
    'exec', '-i', container,
    'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database,
  ], { input: sql });
}

try {
  mustRun('docker', ['inspect', container]);
  psql('postgres', `
    drop database if exists ${sourceDatabase} with (force);
    drop database if exists ${targetDatabase} with (force);
    create database ${sourceDatabase};
    create database ${targetDatabase};
  `);
  psql(sourceDatabase, `
    create table public.backup_restore_probe(
      id integer primary key,
      label text not null,
      payload jsonb not null,
      created_at timestamptz not null default now()
    );
    insert into public.backup_restore_probe(id,label,payload) values
      (1,'prima înregistrare','{"status":"ok","amount":1200}'::jsonb),
      (2,'a doua înregistrare','{"status":"restored","items":3}'::jsonb);
    create view public.backup_restore_probe_summary as
      select count(*)::integer as records from public.backup_restore_probe;
  `);

  const environment = {
    ...process.env,
    BACKUP_ENCRYPTION_KEY: key,
  };
  const backupOutput = mustRun(process.execPath, [
    'scripts/backup-supabase-data.mjs',
    '--test-mode',
    '--skip-storage',
    `--db-container=${container}`,
    `--db-name=${sourceDatabase}`,
    `--directory=${workDirectory}`,
  ], { env: environment });
  const archive = backupOutput.match(/^BACKUP_ARCHIVE=(.+)$/m)?.[1]?.trim();
  if (!archive) throw new Error(`Backup script did not return an archive path.\n${backupOutput}`);

  const restoreOutput = mustRun(process.execPath, [
    'scripts/restore-supabase-backup.mjs',
    `--archive=${archive}`,
    '--confirm-isolated',
    `--target-container=${container}`,
    `--target-db=${targetDatabase}`,
  ], { env: environment });
  if (!restoreOutput.includes('RESTORE_OK=1')) {
    throw new Error(`Restore marker is missing.\n${restoreOutput}`);
  }

  const assertion = psql(targetDatabase, `
    select case
      when (select count(*) from public.backup_restore_probe) = 2
       and (select payload->>'status' from public.backup_restore_probe where id=2) = 'restored'
       and (select records from public.backup_restore_probe_summary) = 2
      then 'phase24_restore_ok'
      else 'phase24_restore_failed'
    end;
  `);
  if (!assertion.includes('phase24_restore_ok')) throw new Error(`Restored data assertion failed.\n${assertion}`);

  const corruptPath = join(workDirectory, 'kira-backup-corrupted.kira');
  const corrupt = Buffer.from(await readFile(archive));
  corrupt[Math.max(32, Math.floor(corrupt.length / 2))] ^= 0xff;
  await writeFile(corruptPath, corrupt);
  const corruptRestore = run(process.execPath, [
    'scripts/restore-supabase-backup.mjs',
    `--archive=${corruptPath}`,
    '--confirm-isolated',
    `--target-container=${container}`,
    `--target-db=${targetDatabase}`,
  ], { env: environment });
  if (corruptRestore.status === 0) throw new Error('A corrupted encrypted archive was accepted.');

  console.log('Backup restore passed: encrypted dump restored and corrupted archive rejected.');
} finally {
  try {
    psql('postgres', `
      drop database if exists ${sourceDatabase} with (force);
      drop database if exists ${targetDatabase} with (force);
    `);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
  }
  await rm(workDirectory, { recursive: true, force: true });
}
