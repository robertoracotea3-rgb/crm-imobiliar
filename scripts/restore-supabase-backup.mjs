import { createHash } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';
import {
  access, mkdir, readFile, rm, stat, unlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createClient } from '@supabase/supabase-js';

import {
  decodeBackupKey,
  decryptBackupFile,
  sha256File,
} from '../lib/backup-format.mjs';

function loadEnvFile(path = '.env.local') {
  try {
    const text = readFileSync(path, 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const index = line.indexOf('=');
      if (index === -1) continue;
      const key = line.slice(0, index).trim();
      let value = line.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] ||= value;
    }
  } catch {
    // Restore tests pass every required value explicitly.
  }
}

loadEnvFile();
const rawArgs = process.argv.slice(2);
const flag = name => rawArgs.includes(`--${name}`);
const option = name => rawArgs.find(argument => argument.startsWith(`--${name}=`))?.slice(name.length + 3);

if (!flag('confirm-isolated')) {
  throw new Error('Restaurarea este blocată. Folosește --confirm-isolated numai pentru o destinație separată de producție.');
}
const archivePath = resolve(option('archive') || '');
if (!option('archive')) throw new Error('--archive este obligatoriu.');
await access(archivePath);

const targetContainer = option('target-container') || process.env.KIRA_RESTORE_DB_CONTAINER || '';
const targetDatabase = option('target-db') || process.env.KIRA_RESTORE_DB_NAME || '';
const targetUrl = process.env.RESTORE_TARGET_DATABASE_URL || '';
if ((!targetContainer || !targetDatabase) && !targetUrl) {
  throw new Error('Configurează destinația izolată prin container+bază sau RESTORE_TARGET_DATABASE_URL.');
}
if (targetContainer && !/^crm_restore_test_[a-z0-9_]+$/.test(targetDatabase)) {
  throw new Error('Baza Docker de restaurare trebuie să înceapă cu crm_restore_test_.');
}

const restoreStorage = flag('restore-storage');
if (restoreStorage && (!process.env.RESTORE_TARGET_SUPABASE_URL || !process.env.RESTORE_TARGET_SUPABASE_SERVICE_ROLE_KEY)) {
  throw new Error('Destinația Supabase izolată pentru fișiere nu este configurată.');
}

const key = decodeBackupKey(process.env.BACKUP_ENCRYPTION_KEY);
const restoreId = createHash('sha256').update(`${archivePath}:${Date.now()}`).digest('hex').slice(0, 16);
const tarPath = join(tmpdir(), `.kira-restore-${restoreId}.tar`);
const stageDirectory = join(tmpdir(), `.kira-restore-${restoreId}`);

function redactedError(error) {
  const value = error instanceof Error ? error.message : String(error);
  return value
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[DATABASE_URL_REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .slice(0, 2_000);
}

function targetDatabaseEnvironment(urlValue) {
  const parsed = new URL(urlValue);
  return {
    environment: {
      ...process.env,
      PGHOST: parsed.hostname,
      PGPORT: parsed.port || '5432',
      PGUSER: decodeURIComponent(parsed.username),
      PGPASSWORD: decodeURIComponent(parsed.password),
      PGDATABASE: parsed.pathname.replace(/^\//, ''),
      PGSSLMODE: parsed.searchParams.get('sslmode') || 'require',
    },
    fingerprint: createHash('sha256')
      .update(`${parsed.hostname}:${parsed.port || '5432'}/${parsed.pathname.replace(/^\//, '')}`)
      .digest('hex'),
  };
}

async function runCapture(command, args, environment = process.env) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: environment,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout = `${stdout}${chunk}`.slice(-1_000_000); });
  child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-20_000); });
  const [code] = await once(child, 'close');
  if (code !== 0) throw new Error(`${command} a eșuat: ${stderr.trim() || `cod ${code}`}`);
  return stdout;
}

async function commandAvailable(command, args = ['--version']) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    windowsHide: true,
    stdio: 'ignore',
  });
  try {
    const [code] = await once(child, 'close');
    return code === 0;
  } catch {
    return false;
  }
}

async function restoreDumpWithCommand(command, args, dumpPath, environment = process.env) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: environment,
    windowsHide: true,
    stdio: ['pipe', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-20_000); });
  createReadStream(dumpPath).pipe(child.stdin);
  const [code] = await once(child, 'close');
  if (code !== 0) throw new Error(`${command} a eșuat: ${stderr.trim() || `cod ${code}`}`);
}

async function restoreDatabase(dumpPath) {
  if (targetContainer && targetDatabase) {
    await restoreDumpWithCommand('docker', [
      'exec', '-i', targetContainer,
      'pg_restore', '-U', 'postgres', '-d', targetDatabase,
      '--clean', '--if-exists', '--no-owner', '--no-privileges',
      '--single-transaction', '--exit-on-error',
    ], dumpPath);
    return createHash('sha256').update(`container:${targetContainer}/${targetDatabase}`).digest('hex');
  }

  const target = targetDatabaseEnvironment(targetUrl);
  const restoreArguments = [
    '--dbname', target.environment.PGDATABASE,
    '--clean', '--if-exists', '--no-owner', '--no-privileges',
    '--single-transaction', '--exit-on-error',
  ];
  if (await commandAvailable('pg_restore')) {
    await restoreDumpWithCommand('pg_restore', restoreArguments, dumpPath, target.environment);
  } else {
    const image = process.env.KIRA_PG_TOOLS_IMAGE || 'postgres:17-alpine';
    await restoreDumpWithCommand('docker', [
      'run', '--rm', '-i',
      '-e', 'PGHOST',
      '-e', 'PGPORT',
      '-e', 'PGUSER',
      '-e', 'PGPASSWORD',
      '-e', 'PGDATABASE',
      '-e', 'PGSSLMODE',
      image,
      'pg_restore',
      ...restoreArguments,
    ], dumpPath, target.environment);
  }
  return target.fingerprint;
}

function safeArchiveEntry(entry) {
  if (typeof entry !== 'string' || entry.includes('\0')) return false;
  const stripped = entry.replace(/^\.\//, '').replaceAll('\\', '/');
  if (!stripped || stripped === '.') return true;
  const normalized = normalize(stripped);
  return !isAbsolute(stripped) && normalized !== '..' && !normalized.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`);
}

function resolveStageFile(path) {
  if (!safeArchiveEntry(path)) throw new Error('Manifestul conține o cale nesigură.');
  const absolutePath = resolve(stageDirectory, path);
  const contained = relative(stageDirectory, absolutePath);
  if (!contained || contained.startsWith('..') || isAbsolute(contained)) {
    throw new Error('Fișierul a ieșit din directorul de restaurare.');
  }
  return absolutePath;
}

async function verifyManifest(manifest) {
  if (!manifest?.complete || manifest.format_version !== 1 || !Array.isArray(manifest.files)) {
    throw new Error('Manifestul backupului este incomplet sau incompatibil.');
  }
  for (const file of manifest.files) {
    if (!file || typeof file.size !== 'number' || !/^[a-f0-9]{64}$/.test(file.sha256 || '')) {
      throw new Error('Manifestul conține metadate de fișier invalide.');
    }
    const absolutePath = resolveStageFile(file.path);
    const info = await stat(absolutePath);
    if (info.size !== file.size || await sha256File(absolutePath) !== file.sha256) {
      throw new Error(`Integritatea fișierului ${file.path} nu corespunde manifestului.`);
    }
  }
  const dump = manifest.database;
  if (!dump?.file || !/^[a-f0-9]{64}$/.test(dump.sha256 || '')
    || await sha256File(resolveStageFile(dump.file)) !== dump.sha256) {
    throw new Error('Dumpul bazei de date nu corespunde manifestului.');
  }
}

async function restoreStorageFiles(manifest) {
  if (!restoreStorage) return { buckets: 0, objects: 0 };
  const client = createClient(
    process.env.RESTORE_TARGET_SUPABASE_URL,
    process.env.RESTORE_TARGET_SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: existingBuckets, error } = await client.storage.listBuckets();
  if (error) throw error;
  const existing = new Set((existingBuckets || []).map(bucket => bucket.name));
  let objectCount = 0;
  for (const [bucketName, bucket] of Object.entries(manifest.storage || {})) {
    if (!existing.has(bucketName)) {
      const { error: createError } = await client.storage.createBucket(bucketName, {
        public: Boolean(bucket.public),
        fileSizeLimit: bucket.file_size_limit || undefined,
        allowedMimeTypes: bucket.allowed_mime_types || undefined,
      });
      if (createError) throw createError;
    }
    for (const object of bucket.objects || []) {
      const bytes = await readFile(resolveStageFile(object.file));
      const { error: uploadError } = await client.storage.from(bucketName).upload(object.name, bytes, {
        upsert: false,
        contentType: object.metadata?.mimetype || object.metadata?.contentType || undefined,
      });
      if (uploadError) throw new Error(`Restaurarea ${bucketName}/${object.name} a eșuat: ${uploadError.message}`);
      objectCount += 1;
    }
  }
  return { buckets: Object.keys(manifest.storage || {}).length, objects: objectCount };
}

try {
  await mkdir(stageDirectory, { recursive: false, mode: 0o700 });
  const header = await decryptBackupFile(archivePath, tarPath, key);
  if (header.plaintext_sha256 && await sha256File(tarPath) !== header.plaintext_sha256) {
    throw new Error('Hashul arhivei decriptate nu corespunde antetului autentificat.');
  }
  const entries = (await runCapture('tar', ['-tf', tarPath])).split(/\r?\n/).filter(Boolean);
  if (entries.some(entry => !safeArchiveEntry(entry))) throw new Error('Arhiva conține căi nesigure.');
  await runCapture('tar', ['-xf', tarPath, '-C', stageDirectory]);

  const manifest = JSON.parse(await readFile(join(stageDirectory, 'manifest.json'), 'utf8'));
  await verifyManifest(manifest);
  const calculatedTargetFingerprint = targetContainer
    ? createHash('sha256').update(`container:${targetContainer}/${targetDatabase}`).digest('hex')
    : targetDatabaseEnvironment(targetUrl).fingerprint;
  if (calculatedTargetFingerprint === manifest.source?.database_fingerprint) {
    throw new Error('Restaurarea peste baza sursă este interzisă.');
  }

  const restoredTargetFingerprint = await restoreDatabase(resolveStageFile(manifest.database.file));
  if (restoredTargetFingerprint !== calculatedTargetFingerprint) {
    throw new Error('Destinația restaurată nu corespunde destinației verificate.');
  }
  const storage = await restoreStorageFiles(manifest);
  console.log(`Restaurare izolată reușită: ${manifest.files.length} fișiere verificate.`);
  console.log(`Storage restaurat: ${storage.buckets} bucketuri, ${storage.objects} obiecte.`);
  console.log('RESTORE_OK=1');
} catch (error) {
  console.error(redactedError(error));
  process.exitCode = 1;
} finally {
  await rm(stageDirectory, { recursive: true, force: true });
  await unlink(tarPath).catch(() => undefined);
}
