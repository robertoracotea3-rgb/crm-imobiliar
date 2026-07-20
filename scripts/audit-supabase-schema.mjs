import { readFileSync } from 'node:fs';

function loadEnvFile(path = '.env.local') {
  const text = readFileSync(path, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ||= value;
  }
}

loadEnvFile();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing Supabase configuration.');
  process.exit(1);
}

const response = await fetch(`${url}/rest/v1/`, {
  headers: {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    accept: 'application/openapi+json',
  },
});

if (!response.ok) {
  console.error(`OpenAPI request failed with HTTP ${response.status}.`);
  process.exit(1);
}

const schema = await response.json();
const tableNames = Object.keys(schema.paths ?? {})
  .filter((path) => /^\/[A-Za-z0-9_]+$/.test(path))
  .map((path) => path.slice(1))
  .sort();

console.log(`TABLE_ENDPOINTS=${tableNames.length}`);
for (const tableName of tableNames) console.log(tableName);

if (process.argv.includes('--core-details')) {
  const coreTables = [
    'profiles',
    'properties',
    'contacts',
    'leads',
    'demands',
    'calendar_events',
    'transactions',
    'portal_listings',
    'activities',
    'activity_logs',
  ];

  for (const tableName of coreTables) {
    const definition = schema.definitions?.[tableName];
    if (!definition) continue;

    console.log(`\n[${tableName}]`);
    for (const [columnName, column] of Object.entries(definition.properties ?? {})) {
      const description = String(column.description ?? '').replace(/\s+/g, ' ').trim();
      const foreignKey = description.match(/Foreign Key to `([^`]+)`/i)?.[1];
      const type = column.format ?? column.type ?? 'unknown';
      console.log(`${columnName}:${type}${foreignKey ? ` -> ${foreignKey}` : ''}`);
    }
  }
}
