import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream, readFileSync } from 'node:fs';
import {
  mkdir, readdir, rename, rm, stat, unlink, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { pipeline } from 'node:stream/promises';
import { createClient } from '@supabase/supabase-js';

import {
  decodeBackupKey,
  decryptBackupFile,
  encryptBackupFile,
  selectBackupsForRetention,
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
    // CI and isolated restore tests intentionally do not require .env.local.
  }
}

const rawArgs = process.argv.slice(2);
const flag = name => rawArgs.includes(`--${name}`);
const option = name => rawArgs.find(argument => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const testMode = flag('test-mode');
const skipStorage = flag('skip-storage');
loadEnvFile();

if (skipStorage && !testMode) {
  throw new Error('--skip-storage este permis numai în testul local de restaurare.');
}

const backupDirectoryValue = option('directory') || process.env.BACKUP_DIRECTORY;
if (!backupDirectoryValue) {
  throw new Error('BACKUP_DIRECTORY sau --directory este obligatoriu.');
}
const backupDirectory = resolve(backupDirectoryValue);
const projectDirectory = resolve(process.cwd());
const relativeToProject = relative(projectDirectory, backupDirectory);
if (!testMode && (!relativeToProject
  || (!relativeToProject.startsWith('..') && !isAbsolute(relativeToProject)))) {
  throw new Error('Backupul operațional trebuie salvat în afara proiectului, pe un volum separat și sincronizat.');
}

const encryptionKey = decodeBackupKey(process.env.BACKUP_ENCRYPTION_KEY);
const databaseContainer = option('db-container') || process.env.KIRA_BACKUP_DB_CONTAINER || '';
const databaseName = option('db-name') || process.env.KIRA_BACKUP_DB_NAME || '';
const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '';
if ((!databaseContainer || !databaseName) && !databaseUrl) {
  throw new Error('Configurează SUPABASE_DB_URL/DATABASE_URL sau containerul și baza de test.');
}

await mkdir(backupDirectory, { recursive: true });
const runId = randomUUID();
const stageDirectory = join(tmpdir(), `.kira-stage-${runId}`);
const tarPath = join(tmpdir(), `.kira-archive-${runId}.tar`);
const verifyTarPath = join(tmpdir(), `.kira-verify-${runId}.tar`);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const archiveName = `kira-backup-${stamp}.kira`;
const archivePath = join(backupDirectory, archiveName);
const partialArchivePath = join(backupDirectory, `.kira-partial-${runId}`);
const sidecarPath = `${archivePath}.meta.json`;

function redactedError(error) {
  const value = error instanceof Error ? error.message : String(error);
  return value
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[DATABASE_URL_REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .slice(0, 2_000);
}

async function spawnToFile(command, args, outputPath, environment = process.env) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: environment,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-20_000); });
  const writing = pipeline(child.stdout, createWriteStream(outputPath, { flags: 'wx', mode: 0o600 }));
  try {
    const [[code]] = await Promise.all([once(child, 'close'), writing]);
    if (code !== 0) throw new Error(`${command} a eșuat: ${stderr.trim() || `cod ${code}`}`);
  } catch (error) {
    await unlink(outputPath).catch(() => undefined);
    throw error;
  }
}

async function runCommand(command, args) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-20_000); });
  const [code] = await once(child, 'close');
  if (code !== 0) throw new Error(`${command} a eșuat: ${stderr.trim() || `cod ${code}`}`);
}

function databaseEnvironment(urlValue) {
  const parsed = new URL(urlValue);
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

async function createDatabaseDump(outputPath) {
  if (databaseContainer && databaseName) {
    await spawnToFile('docker', [
      'exec', databaseContainer,
      'pg_dump', '-U', 'postgres', '-d', databaseName,
      '--format=custom', '--no-owner', '--no-privileges',
    ], outputPath);
    return createHash('sha256').update(`container:${databaseContainer}/${databaseName}`).digest('hex');
  }
  const environment = databaseEnvironment(databaseUrl);
  const dumpArguments = ['--format=custom', '--no-owner', '--no-privileges'];
  if (await commandAvailable('pg_dump')) {
    await spawnToFile('pg_dump', dumpArguments, outputPath, environment);
  } else {
    const image = process.env.KIRA_PG_TOOLS_IMAGE || 'postgres:17-alpine';
    await spawnToFile('docker', [
      'run', '--rm',
      '-e', 'PGHOST',
      '-e', 'PGPORT',
      '-e', 'PGUSER',
      '-e', 'PGPASSWORD',
      '-e', 'PGDATABASE',
      '-e', 'PGSSLMODE',
      image,
      'pg_dump',
      ...dumpArguments,
    ], outputPath, environment);
  }
  return createHash('sha256')
    .update(`${environment.PGHOST}:${environment.PGPORT}/${environment.PGDATABASE}`)
    .digest('hex');
}

function encodedObjectPath(objectName) {
  const hash = createHash('sha256').update(objectName, 'utf8').digest('hex');
  const extension = extname(objectName).replace(/[^.A-Za-z0-9_-]/g, '').slice(0, 16);
  return `${hash}${extension}`;
}

async function listStorageObjects(client, bucketName, prefix = '') {
  const objects = [];
  const pageSize = 1_000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.storage
      .from(bucketName)
      .list(prefix, { limit: pageSize, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    const entries = data || [];
    for (const entry of entries) {
      const objectName = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) objects.push({ name: objectName, metadata: entry.metadata || null });
      else objects.push(...await listStorageObjects(client, bucketName, objectName));
    }
    if (entries.length < pageSize) break;
  }
  return objects;
}

async function backupSupabaseFiles(manifest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Configurația Supabase pentru backupul fișierelor lipsește.');
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  manifest.source.supabase_fingerprint = createHash('sha256').update(url).digest('hex');

  const { data: buckets, error } = await client.storage.listBuckets();
  if (error) throw error;
  for (const bucket of buckets || []) {
    const objects = await listStorageObjects(client, bucket.name);
    const bucketManifest = {
      public: Boolean(bucket.public),
      file_size_limit: bucket.file_size_limit || null,
      allowed_mime_types: bucket.allowed_mime_types || null,
      objects: [],
    };
    for (const object of objects) {
      const { data, error: downloadError } = await client.storage.from(bucket.name).download(object.name);
      if (downloadError || !data) throw new Error(`storage.${bucket.name}/${object.name}: ${downloadError?.message || 'fișier gol'}`);
      const relativePath = join('storage', encodeURIComponent(bucket.name), encodedObjectPath(object.name));
      const absolutePath = join(stageDirectory, relativePath);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, Buffer.from(await data.arrayBuffer()), { mode: 0o600 });
      bucketManifest.objects.push({
        name: object.name,
        metadata: object.metadata,
        file: relativePath.replaceAll('\\', '/'),
      });
    }
    manifest.storage[bucket.name] = bucketManifest;
  }

  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error: userError } = await client.auth.admin.listUsers({ page, perPage: 1_000 });
    if (userError) throw userError;
    const pageUsers = data?.users || [];
    users.push(...pageUsers.map(user => ({
      id: user.id,
      email: user.email || null,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at || null,
      providers: user.app_metadata?.providers || [],
    })));
    if (pageUsers.length < 1_000) break;
  }
  await writeFile(join(stageDirectory, 'auth-inventory.json'), JSON.stringify(users, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
  manifest.auth_inventory = { users: users.length, file: 'auth-inventory.json' };
}

async function stageFiles(root, prefix = '') {
  const result = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const item = join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await stageFiles(root, item));
    else result.push(item);
  }
  return result;
}

async function applyRetention() {
  const names = (await readdir(backupDirectory)).filter(name => name.endsWith('.kira'));
  const retention = selectBackupsForRetention(names);
  for (const name of retention.remove) {
    const candidate = resolve(backupDirectory, name);
    if (dirname(candidate) !== backupDirectory || basename(candidate) !== name) {
      throw new Error('Calea calculată pentru retenție a ieșit din directorul de backup.');
    }
    await unlink(candidate);
    await unlink(`${candidate}.meta.json`).catch(() => undefined);
  }
  return retention;
}

const manifest = {
  format_version: 1,
  created_at: new Date().toISOString(),
  complete: false,
  source: {},
  database: {},
  storage: {},
  auth_inventory: null,
  files: [],
  restore_policy: {
    isolated_target_required: true,
    production_restore_forbidden: true,
  },
};

try {
  await mkdir(stageDirectory, { recursive: false, mode: 0o700 });
  const dumpPath = join(stageDirectory, 'database.dump');
  manifest.source.database_fingerprint = await createDatabaseDump(dumpPath);
  const dumpInfo = await stat(dumpPath);
  if (dumpInfo.size === 0) throw new Error('Dumpul bazei de date este gol.');
  manifest.database = {
    file: 'database.dump',
    format: 'postgres-custom',
    size: dumpInfo.size,
    sha256: await sha256File(dumpPath),
  };

  if (!skipStorage) await backupSupabaseFiles(manifest);
  else manifest.storage_skipped_for_isolated_test = true;

  for (const path of await stageFiles(stageDirectory)) {
    const normalized = path.replaceAll('\\', '/');
    if (normalized === 'manifest.json') continue;
    const info = await stat(join(stageDirectory, path));
    manifest.files.push({
      path: normalized,
      size: info.size,
      sha256: await sha256File(join(stageDirectory, path)),
    });
  }
  manifest.complete = true;
  await writeFile(join(stageDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });

  await runCommand('tar', ['-cf', tarPath, '-C', stageDirectory, '.']);
  const plaintextHash = await sha256File(tarPath);
  const header = await encryptBackupFile(tarPath, partialArchivePath, encryptionKey, {
    backup_id: runId,
    plaintext_sha256: plaintextHash,
  });

  // A backup is not accepted until the encrypted stream can be authenticated
  // and decrypted byte-for-byte with the configured key.
  await decryptBackupFile(partialArchivePath, verifyTarPath, encryptionKey);
  if (await sha256File(verifyTarPath) !== plaintextHash) {
    throw new Error('Verificarea criptografică a backupului nu corespunde arhivei sursă.');
  }

  // Only a fully authenticated backup receives the public .kira filename.
  await rename(partialArchivePath, archivePath);
  const encryptedHash = await sha256File(archivePath);
  const archiveInfo = await stat(archivePath);
  await writeFile(sidecarPath, JSON.stringify({
    format_version: 1,
    created_at: header.created_at,
    key_id: header.key_id,
    encrypted_sha256: encryptedHash,
    size: archiveInfo.size,
    retention: '14 zile toate, 12 săptămâni, 12 luni',
  }, null, 2), 'utf8');

  const retention = await applyRetention();
  console.log(`Backup criptat și verificat: ${archivePath}`);
  console.log(`Retenție: ${retention.keep.length} păstrate, ${retention.remove.length} eliminate.`);
  console.log(`BACKUP_ARCHIVE=${archivePath}`);
} catch (error) {
  await unlink(partialArchivePath).catch(() => undefined);
  await unlink(archivePath).catch(() => undefined);
  await unlink(sidecarPath).catch(() => undefined);
  console.error(redactedError(error));
  process.exitCode = 1;
} finally {
  await rm(stageDirectory, { recursive: true, force: true });
  await unlink(tarPath).catch(() => undefined);
  await unlink(verifyTarPath).catch(() => undefined);
}
