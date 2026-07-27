import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('contact SLA stores factual evidence and a 24-hour deadline', async () => {
  const migration = await read('migrations/20260724_240_lead_contact_sla.sql');
  for (const field of [
    'assigned_by_user_id',
    'first_contact_attempt_at',
    'first_successful_contact_at',
    'contacted_by_user_id',
    'contact_outcome',
    'contact_attempt_count',
    'contact_sla_status',
  ]) assert.match(migration, new RegExp(field));
  assert.match(migration, /interval '24 hours'/);
  assert.match(migration, /Europe\/Bucharest/);
  assert.match(migration, /'lead_sla_12h'/);
  assert.match(migration, /'lead_sla_4h'/);
  assert.match(migration, /'lead_sla_overdue'/);
  assert.match(migration, /'lead_sla_overdue_owner'/);
});

test('contact SLA is processed daily on Vercel Hobby and exposed on both dashboards', async () => {
  const [engine, schedule, api, dashboard, clients] = await Promise.all([
    read('lib/server/automation-engine.ts'),
    read('vercel.json'),
    read('app/api/dashboard/overview/route.ts'),
    read('app/dashboard/page.tsx'),
    read('app/clients/page.tsx'),
  ]);
  assert.match(engine, /crm_process_contact_sla/);
  assert.match(schedule, /"schedule": "47 3 \* \* \*"/);
  assert.match(api, /crm_contact_sla_dashboard/);
  assert.match(dashboard, /Contact în maximum 24 de ore/);
  assert.match(dashboard, /Contact întârziat/);
  assert.match(clients, /De contactat în 24h/);
  assert.match(clients, /contact_sla_status/);
});
