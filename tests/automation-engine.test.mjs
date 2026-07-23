import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('automation registry contains every required configurable workflow', async () => {
  const migration = await read('migrations/20260720_170_automation_engine.sql');
  for (const key of [
    'lead_new', 'lead_unanswered', 'viewing_reminder', 'viewing_followup',
    'demand_matching', 'property_matching', 'property_withdrawal',
    'listing_error', 'task_overdue', 'lead_missing_next_action',
  ]) assert.match(migration, new RegExp(`'${key}'`));
  assert.match(migration, /is_enabled boolean not null default true/);
  assert.match(migration, /retry_delay_minutes/);
  assert.match(migration, /unique\(agency_id,dedup_key\)/);
  assert.match(migration, /unique\(rule_id,event_id\)/);
  assert.match(migration, /for update of j skip locked/);
});

test('automation actions run only in the central worker and persist every attempt', async () => {
  const [worker, migration] = await Promise.all([
    read('lib/server/automation-engine.ts'),
    read('migrations/20260720_170_automation_engine.sql'),
  ]);
  for (const action of [
    'notify', 'create_followup_task', 'match_demand', 'match_property', 'withdraw_property_portals',
  ]) assert.match(worker, new RegExp(`action\\.type === '${action}'`));
  assert.match(worker, /crm_claim_automation_jobs/);
  assert.match(worker, /crm_finish_automation_job/);
  assert.match(migration, /automation_run_logs/);
  assert.match(migration, /crm_sweep_due_automations/);
  assert.match(migration, /automation_job_id/);
});

test('automation settings and manual execution remain tenant-authorized', async () => {
  const [route, component, cron] = await Promise.all([
    read('app/api/automations/route.ts'),
    read('components/AutomationSettings.tsx'),
    read('app/api/cron/automations/route.ts'),
  ]);
  assert.match(route, /requireApiAuth\(request, \{ module: 'settings', action: 'view' \}\)/);
  assert.match(route, /requireApiAuth\(request, \{ module: 'settings', action: 'edit' \}\)/);
  assert.match(route, /\.eq\('agency_id', agencyId\)/);
  assert.match(component, /Regula a fost salvată/);
  assert.match(component, /Reîncearcă/);
  assert.match(cron, /verifyCronAuthorization/);
  assert.match(cron, /runAutomationBatch/);
});
