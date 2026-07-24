import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('contact lifecycle is durable, guarded and never auto-archives clients', async () => {
  const [migration, rollback] = await Promise.all([
    read('migrations/20260724_260_contact_lifecycle.sql'),
    read('migrations/20260724_260_contact_lifecycle.rollback.sql'),
  ]);
  for (const status of [
    'client_nou',
    'de_contactat',
    'contactat',
    'client_activ',
    'in_asteptare',
    'client_vechi',
    'arhivat',
  ]) assert.match(migration, new RegExp(`'${status}'`));
  assert.match(migration, /crm_contact_lifecycle_blockers/);
  assert.match(migration, /contact_archive_reason_required/);
  assert.match(migration, /crm_guard_contact_lifecycle_update/);
  assert.match(migration, /crm_refresh_contact_lifecycle/);
  assert.doesNotMatch(migration, /set\s+deleted_at\s*=/i);
  assert.match(rollback, /Retained after rollback/);
  assert.doesNotMatch(rollback, /drop table.*contact_lifecycle_events/i);
});

test('archived contacts reactivate on a new lead and lifecycle is visible in CRM', async () => {
  const [migration, route, dialog, list, profile] = await Promise.all([
    read('migrations/20260724_260_contact_lifecycle.sql'),
    read('app/api/contacts/lifecycle/route.ts'),
    read('components/ContactLifecycleDialog.tsx'),
    read('app/clients/page.tsx'),
    read('app/clients/[id]/page.tsx'),
  ]);
  assert.match(migration, /crm_reactivate_contact_from_new_lead/);
  assert.match(migration, /new-lead-reactivation/);
  assert.match(migration, /contact_row\.lifecycle_status in \('client_vechi', 'arhivat'\)/);
  assert.match(route, /crm_transition_contact_lifecycle/);
  assert.match(route, /blockers/);
  assert.match(dialog, /Arhivarea nu șterge datele/);
  assert.match(dialog, /minimum 60 de zile fără activitate/);
  assert.match(list, /Toate stările clientului/);
  assert.match(profile, /Schimbă starea/);
});

test('legacy contact delete endpoint archives through the lifecycle RPC', async () => {
  const route = await read('app/api/contacts/route.ts');
  const deleteHandler = route.slice(route.indexOf('export async function DELETE'));
  assert.match(deleteHandler, /crm_transition_contact_lifecycle/);
  assert.match(deleteHandler, /p_to_status:\s*'arhivat'/);
  assert.doesNotMatch(deleteHandler, /\.update\(\{\s*deleted_at/);
});
