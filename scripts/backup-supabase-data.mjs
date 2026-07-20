import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

function loadEnvFile(path = '.env.local') {
  const text = readFileSync(path, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] ||= value;
  }
}

loadEnvFile();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = join('backups', `supabase-${stamp}`);
await mkdir(outDir, { recursive: true });

const manifest = {
  created_at: new Date().toISOString(),
  supabase_url: url,
  tables: {},
  auth: {},
  storage: {},
};

async function discoverPublicTables() {
  const response = await fetch(`${url}/rest/v1/`, {
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      accept: 'application/openapi+json',
    },
  });

  if (!response.ok) {
    throw new Error(`OpenAPI discovery failed with HTTP ${response.status}`);
  }

  const openApi = await response.json();
  await writeFile(join(outDir, 'openapi.json'), JSON.stringify(openApi, null, 2), 'utf8');

  return Object.keys(openApi.paths ?? {})
    .filter((path) => /^\/[A-Za-z0-9_]+$/.test(path))
    .map((path) => path.slice(1))
    .sort();
}

async function fetchAll(table) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + pageSize - 1);
    if (error) {
      if (/relation|does not exist|schema cache/i.test(error.message)) {
        return { rows, skipped: true, error: error.message };
      }
      throw new Error(`${table}: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return { rows, skipped: false };
}

const tables = await discoverPublicTables();

for (const table of tables) {
  try {
    const result = await fetchAll(table);
    const file = join(outDir, `${table}.json`);
    await writeFile(file, JSON.stringify(result.rows, null, 2), 'utf8');
    manifest.tables[table] = {
      rows: result.rows.length,
      skipped: result.skipped,
      error: result.error || null,
      file,
    };
    console.log(`${table}: ${result.rows.length}${result.skipped ? ' skipped' : ''}`);
  } catch (error) {
    manifest.tables[table] = {
      rows: 0,
      skipped: true,
      error: error instanceof Error ? error.message : String(error),
      file: null,
    };
    console.log(`${table}: error`);
  }
}

async function backupAuthUsers() {
  const users = [];
  const perPage = 1000;

  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const pageUsers = data?.users ?? [];
    users.push(...pageUsers);
    if (pageUsers.length < perPage) break;
  }

  const file = join(outDir, 'auth-users.json');
  await writeFile(file, JSON.stringify(users, null, 2), 'utf8');
  manifest.auth = { users: users.length, file, error: null };
  console.log(`auth.users: ${users.length}`);
}

async function listStorageObjects(bucketName, prefix = '') {
  const objects = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .list(prefix, { limit: pageSize, offset, sortBy: { column: 'name', order: 'asc' } });

    if (error) throw error;
    const entries = data ?? [];

    for (const entry of entries) {
      const objectName = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) {
        objects.push({ name: objectName, metadata: entry.metadata ?? null });
      } else {
        objects.push(...(await listStorageObjects(bucketName, objectName)));
      }
    }

    if (entries.length < pageSize) break;
  }

  return objects;
}

function encodedObjectPath(objectName) {
  const hash = createHash('sha256').update(objectName, 'utf8').digest('hex');
  const extension = extname(objectName).replace(/[^.A-Za-z0-9_-]/g, '').slice(0, 16);
  return `${hash}${extension}`;
}

async function backupStorage() {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw error;

  for (const bucket of buckets ?? []) {
    const bucketManifest = { objects: [], errors: [] };
    const objects = await listStorageObjects(bucket.name);

    const downloadConcurrency = 6;
    for (let offset = 0; offset < objects.length; offset += downloadConcurrency) {
      const batch = objects.slice(offset, offset + downloadConcurrency);
      await Promise.all(batch.map(async (object) => {
        const { data, error: downloadError } = await supabase.storage
          .from(bucket.name)
          .download(object.name);

        if (downloadError || !data) {
          bucketManifest.errors.push({
            name: object.name,
            error: downloadError?.message ?? 'Empty download response',
          });
          return;
        }

        const relativeFile = join('storage', bucket.name, encodedObjectPath(object.name));
        const absoluteFile = join(outDir, relativeFile);
        const parent = absoluteFile.slice(0, Math.max(absoluteFile.lastIndexOf('/'), absoluteFile.lastIndexOf('\\')));
        await mkdir(parent, { recursive: true });
        await writeFile(absoluteFile, Buffer.from(await data.arrayBuffer()));
        bucketManifest.objects.push({
          name: object.name,
          metadata: object.metadata,
          file: relativeFile,
        });
      }));
    }

    manifest.storage[bucket.name] = bucketManifest;
    console.log(`storage.${bucket.name}: ${bucketManifest.objects.length} files`);
  }
}

try {
  await backupAuthUsers();
} catch (error) {
  manifest.auth = {
    users: 0,
    file: null,
    error: error instanceof Error ? error.message : String(error),
  };
  console.log('auth.users: error');
}

try {
  await backupStorage();
} catch (error) {
  manifest.storage_error = error instanceof Error ? error.message : String(error);
  console.log('storage: error');
}

await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
console.log(`Backup saved to ${outDir}`);
