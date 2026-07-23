import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const apiRoot = join(process.cwd(), 'app', 'api');

function routeFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === 'route.ts' ? [path] : [];
  });
}

function routeName(path) {
  return relative(process.cwd(), path).split(sep).join('/');
}

const externalOrDisabledRoutes = new Set([
  'app/api/cron/automations/route.ts',
  'app/api/cron/storia-sync/route.ts',
  'app/api/auth/register/route.ts',
  'app/api/feed/properties.xml/route.ts',
  'app/api/portals/storia/callback/route.ts',
  'app/api/portals/storia/webhook/route.ts',
  'app/api/supabase-run-sql/route.ts',
  'app/api/properties/update/route.ts',
  'app/api/transactions/create/route.ts',
]);

test('external cron routes use a dedicated constant-time secret guard', () => {
  for (const route of ['storia-sync', 'automations']) {
    const source = readFileSync(join(apiRoot, 'cron', route, 'route.ts'), 'utf8');
    assert.match(source, /verifyCronAuthorization/);
    assert.match(source, /process\.env\.CRON_SECRET/);
    assert.doesNotMatch(source, /request\.headers\.get\('authorization'\)\s*===/);
  }
});

test('every private API route uses the central authorization guard', () => {
  const missing = [];
  for (const path of routeFiles(apiRoot)) {
    const name = routeName(path);
    if (externalOrDisabledRoutes.has(name)) continue;
    const source = readFileSync(path, 'utf8');
    if (!source.includes('requireApiAuth')) missing.push(name);
  }
  assert.deepEqual(missing, []);
});

test('the legacy SQL execution endpoint remains disabled', () => {
  const source = readFileSync(join(apiRoot, 'supabase-run-sql', 'route.ts'), 'utf8');
  assert.match(source, /Endpoint dezactivat/);
  assert.match(source, /status:\s*403/);
  assert.doesNotMatch(source, /request\.json|rpc\(|\.from\(/);
});

test('service-role credentials are never referenced by client components', () => {
  const clientFiles = [];
  for (const root of [join(process.cwd(), 'app'), join(process.cwd(), 'components'), join(process.cwd(), 'lib')]) {
    const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return walk(path);
      if (!/\.(ts|tsx)$/.test(entry.name)) return [];
      const source = readFileSync(path, 'utf8');
      return source.startsWith("'use client'") && source.includes('SUPABASE_SERVICE_ROLE_KEY')
        ? [routeName(path)]
        : [];
    });
    clientFiles.push(...walk(root));
  }
  assert.deepEqual(clientFiles, []);
});
