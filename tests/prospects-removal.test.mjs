import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

async function doesNotExist(path) {
  await assert.rejects(access(new URL(path, root)));
}

test('the retired private-listings module has no runtime surface', async () => {
  await Promise.all([
    doesNotExist('app/prospects/page.tsx'),
    doesNotExist('app/api/prospects/route.ts'),
    doesNotExist('app/api/prospects/refresh/route.ts'),
    doesNotExist('lib/prospects/index.ts'),
  ]);

  const [sidebar, roles, health] = await Promise.all([
    read('components/Sidebar.tsx'),
    read('lib/team-roles.ts'),
    read('app/api/system/health/route.ts'),
  ]);
  for (const source of [sidebar, roles, health]) {
    assert.doesNotMatch(source, /\/prospects|prospect_source_health|['"]prospects['"]/i);
  }
  assert.doesNotMatch(sidebar, /Particulari/i);
});

test('the retirement migration deletes only prospecting objects and permissions', async () => {
  const [migration, rollback] = await Promise.all([
    read('migrations/20260727_340_remove_prospects_module.sql'),
    read('migrations/20260727_340_remove_prospects_module.rollback.sql'),
  ]);

  for (const table of ['prospect_sync_runs', 'prospect_source_health', 'prospects']) {
    assert.match(migration, new RegExp(`drop table if exists public\\.${table};`));
  }
  for (const routine of [
    'crm_refresh_prospect_duplicate_groups',
    'crm_mark_missing_prospects',
    'crm_sync_prospect_fields',
    'crm_prospect_match_key',
  ]) {
    assert.match(migration, new RegExp(`drop function if exists public\\.${routine}`));
  }
  assert.match(migration, /permissions = permissions - 'prospects'/);
  assert.match(migration, /delete from public\.crm_role_permissions\s+where module = 'prospects'/);
  assert.doesNotMatch(migration, /\bcascade\b/i);
  assert.doesNotMatch(migration, /drop table if exists public\.(properties|leads|contacts|demands|viewings|transactions)/i);
  assert.match(rollback, /requires_verified_backup_restore/);
});
