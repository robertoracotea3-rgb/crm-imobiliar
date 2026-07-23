import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('dashboard KPIs are exact database aggregates without list caps', async () => {
  const [route, migration] = await Promise.all([
    read('app/api/dashboard/overview/route.ts'),
    read('migrations/20260720_180_exact_dashboard_kpis.sql'),
  ]);
  assert.match(route, /crm_dashboard_kpis/);
  assert.doesNotMatch(route, /\.limit\((200|500|1000)\)/);
  assert.doesNotMatch(migration, /\blimit\b/i);
  assert.match(migration, /count\(distinct e\.lead_id\)/);
  assert.match(migration, /average_response_minutes/);
  assert.match(migration, /conversion_rate/);
});

test('dashboard scope is enforced again inside the database function', async () => {
  const migration = await read('migrations/20260720_180_exact_dashboard_kpis.sql');
  assert.match(migration, /profile_role/);
  assert.match(migration, /in \('owner','admin','manager'\)/);
  assert.match(migration, /coalesce\(l\.agent_id,l\.assigned_to\)=p_user_id/);
  assert.match(migration, /p\.agent_id=p_user_id/);
  assert.match(migration, /t\.assigned_to=p_user_id/);
  assert.match(migration, /grant execute .*service_role/is);
  assert.doesNotMatch(migration, /grant execute .*authenticated/is);
});

test('owner and agent dashboards expose the required real KPIs and definitions', async () => {
  const page = await read('app/dashboard/page.tsx');
  for (const label of [
    'Leaduri noi', 'Leaduri necontactate', 'Timp mediu de răspuns', 'Vizionări',
    'Oferte', 'Rezervări', 'Tranzacții', 'Venit înregistrat', 'Comisioane estimate',
    'Rată de conversie', 'Proprietăți active', 'Proprietăți expirate', 'Listări cu erori',
    'Leadurile mele', 'Taskurile mele', 'Follow-up-uri', 'Fără următoarea acțiune',
  ]) assert.match(page, new RegExp(label));
  assert.match(page, /Performanță portaluri/);
  assert.match(page, /Performanță agenți/);
  assert.match(page, /Cum sunt calculați indicatorii/);
});
