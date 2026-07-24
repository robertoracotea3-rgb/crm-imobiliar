import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('20 days starts a guarded human review and never auto-closes a demand', async () => {
  const [migration, worker] = await Promise.all([
    read('migrations/20260724_270_demand_review_workflow.sql'),
    read('lib/server/automation-engine.ts'),
  ]);
  assert.match(migration, /crm_mark_demands_for_review/);
  assert.match(migration, /de_verificat_inchidere/);
  assert.match(migration, /crm_demand_review_blockers/);
  assert.match(migration, /p_min_inactive_days integer default 20/);
  assert.match(migration, /status = 'de_verificat_inchidere'/);
  assert.doesNotMatch(migration, /crm_mark_demands_for_review[\s\S]*status\s*=\s*'inchisa'/);
  assert.match(worker, /crm_mark_demands_for_review/);
  assert.match(worker, /p_min_inactive_days:\s*20/);
});

test('closure blockers cover properties, viewings, transactions, tasks and future contact', async () => {
  const migration = await read('migrations/20260724_270_demand_review_workflow.sql');
  assert.match(migration, /proprietate activă asociată/);
  assert.match(migration, /vizionare viitoare/);
  assert.match(migration, /ofertă, negociere sau tranzacție activă/);
  assert.match(migration, /task viitor/);
  assert.match(migration, /contactat la o dată ulterioară/);
  assert.match(migration, /Cererea are deja o acțiune viitoare/);
});

test('agent review requires a reason, keeps history and supports explicit reactivation', async () => {
  const [migration, route, dialog, deleteRoute] = await Promise.all([
    read('migrations/20260724_270_demand_review_workflow.sql'),
    read('app/api/demands/review/route.ts'),
    read('components/DemandReviewDialog.tsx'),
    read('app/api/demands/delete/route.ts'),
  ]);
  for (const reason of [
    'nu_mai_este_interesat',
    'cumparat_prin_alta_parte',
    'buget_insuficient',
    'nu_mai_raspunde',
    'cerere_duplicata',
    'criterii_imposibile',
    'amanare',
    'alt_motiv',
  ]) assert.match(migration, new RegExp(`'${reason}'`));
  assert.match(migration, /demand_review_events/);
  assert.match(migration, /'reopen'/);
  assert.match(route, /crm_review_demand/);
  assert.match(dialog, /Cererea rămâne în istoricul clientului/);
  assert.match(deleteRoute, /Cererile nu se șterg/);
  assert.doesNotMatch(deleteRoute, /deleted_at/);
});
