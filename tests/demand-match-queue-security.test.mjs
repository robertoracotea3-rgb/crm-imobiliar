import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the server-only demand matching queue can be populated by the property trigger', async () => {
  const [baseMigration, forwardFix] = await Promise.all([
    read('migrations/20260720_090_demands_and_matching.sql'),
    read('migrations/20260727_310_demand_match_queue_trigger_security.sql'),
  ]);

  for (const migration of [baseMigration, forwardFix]) {
    assert.match(
      migration,
      /function public\.crm_queue_property_matching\(\)[\s\S]*?security definer[\s\S]*?set search_path = public, pg_temp/i,
    );
    assert.match(
      migration,
      /revoke all on function public\.crm_queue_property_matching\(\)[\s\S]*?from public, anon, authenticated/i,
    );
    assert.match(
      migration,
      /insert into public\.demand_match_refresh_queue\(agency_id, property_id\)/i,
    );
  }
});

test('hosted lead inserts support legacy schemas and server-only pipeline history', async () => {
  const [pipelineMigration, lifecycleMigration, forwardFix] = await Promise.all([
    read('migrations/20260720_160_operational_pipeline.sql'),
    read('migrations/20260724_260_contact_lifecycle.sql'),
    read('migrations/20260727_320_lead_insert_trigger_compatibility.sql'),
  ]);

  for (const migration of [pipelineMigration, forwardFix]) {
    assert.match(
      migration,
      /function public\.crm_record_initial_pipeline_stage\(\)[\s\S]*?security definer[\s\S]*?set search_path\s*=\s*public,\s*pg_temp/i,
    );
  }
  for (const migration of [lifecycleMigration, forwardFix]) {
    assert.match(migration, /to_jsonb\(new\)\s*->>\s*'created_at'/i);
    assert.doesNotMatch(
      migration,
      /coalesce\(new\.received_at,\s*new\.created_at/i,
    );
  }
});
