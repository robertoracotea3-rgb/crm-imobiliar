import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const requiredStages = [
  'lead_nou', 'de_contactat', 'contactat', 'calificat', 'cerere_completata',
  'proprietati_trimise', 'vizionare_programata', 'vizionare_efectuata',
  'oferta', 'negociere', 'rezervare', 'antecontract', 'credit', 'notar',
  'finalizat', 'pierdut',
];

test('pipeline defines every operational stage with conditions and actions', async () => {
  const source = await read('lib/crm-pipeline.ts');
  for (const stage of requiredStages) assert.match(source, new RegExp(`code: '${stage}'`));
  assert.equal((source.match(/entryCondition:/g) || []).length, requiredStages.length + 1);
  assert.equal((source.match(/mandatoryActions:/g) || []).length, requiredStages.length + 1);
  assert.equal((source.match(/requiredFields:/g) || []).length, requiredStages.length + 1);
  assert.equal((source.match(/automation:/g) || []).length, requiredStages.length + 1);
  assert.match(source, /pierdut: \['de_contactat'\]/);
  for (const stage of requiredStages) {
    const groups = source.slice(source.indexOf('LEAD_PIPELINE_TAB_GROUPS'));
    assert.match(groups, new RegExp(`'${stage}'`));
  }
});

test('database transition requires evidence and preserves historical statuses', async () => {
  const migration = await read('migrations/20260720_160_operational_pipeline.sql');
  assert.match(migration, /pipeline_legacy_status=coalesce\(pipeline_legacy_status,status\)/);
  assert.doesNotMatch(migration, /set\s+status=case status/i);
  assert.match(migration, /crm_pipeline_stage_blockers/);
  assert.match(migration, /Lipsește confirmarea factuală/);
  assert.match(migration, /Nu există o cerere activă/);
  assert.match(migration, /Nu există nicio proprietate înregistrată ca trimisă/);
  assert.match(migration, /Nu există o vizionare reală/);
  assert.match(migration, /Nu se poate finaliza fără o tranzacție finalizată atomic/);
  assert.match(migration, /Rezervarea cere tranzacție, proprietate, client, sumă și dată/);
  assert.match(migration, /pipeline_transition_rpc_required/);
});

test('pipeline API uses the tenant-bound transition function and exposes blockers', async () => {
  const route = await read('app/api/leads/pipeline/route.ts');
  assert.match(route, /requireApiAuth\(request, \{ module: 'leads', action: 'edit' \}\)/);
  assert.match(route, /crm_transition_lead_pipeline/);
  assert.match(route, /p_agency_id: agencyId/);
  assert.match(route, /p_actor_id: user\.id/);
  assert.match(route, /blockers/);
  assert.doesNotMatch(route, /\.update\(\{\s*pipeline_stage/);
});

test('confirmed WhatsApp property delivery records idempotent share evidence', async () => {
  const [route, dialog, migration] = await Promise.all([
    read('app/api/leads/whatsapp/route.ts'),
    read('components/ReplyLeadDialog.tsx'),
    read('migrations/20260720_160_operational_pipeline.sql'),
  ]);
  assert.match(route, /crm_record_lead_property_share/);
  assert.match(route, /action === 'confirmed_sent'/);
  assert.match(dialog, /share_idempotency_key/);
  assert.match(dialog, /crypto\.randomUUID/);
  assert.match(migration, /unique\(agency_id,idempotency_key\)/);
});

test('reservation evidence is enforced in the API, UI and database', async () => {
  const [route, page, migration] = await Promise.all([
    read('app/api/transactions/route.ts'),
    read('app/finance/page.tsx'),
    read('migrations/20260720_160_operational_pipeline.sql'),
  ]);
  for (const source of [route, page, migration]) assert.match(source, /reservation_at/);
  assert.match(route, /Rezervarea cere proprietate, client, sumă și data rezervării/);
  assert.match(migration, /transaction_reservation_evidence_required/);
  assert.match(page, /Data rezervării \*/);
});

test('pipeline board, client list and navigation share the controlled workflow', async () => {
  const [board, clients, control, sidebar] = await Promise.all([
    read('app/pipeline/page.tsx'),
    read('app/clients/page.tsx'),
    read('components/PipelineStageControl.tsx'),
    read('components/Sidebar.tsx'),
  ]);
  assert.match(board, /LEAD_PIPELINE_STAGES/);
  assert.match(board, /PipelineStageControl/);
  assert.match(clients, /Pipeline operațional/);
  assert.match(clients, /Status istoric păstrat/);
  assert.match(control, /Condiția de intrare/);
  assert.match(control, /Acțiuni obligatorii/);
  assert.match(control, /Automatizare asociată/);
  assert.match(sidebar, /href: '\/pipeline'/);
});
