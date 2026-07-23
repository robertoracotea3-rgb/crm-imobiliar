import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  healthStatusFromCounts,
  overallSystemStatus,
  systemHealthSummary,
} from '../lib/system-health.ts';
import {
  sanitizeObservationMessage,
  sanitizeObservationMetadata,
} from '../lib/observability-core.ts';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('observability redacts credentials and contact identifiers before persistence', () => {
  const message = sanitizeObservationMessage(
    'Authorization: Bearer abc.def.ghi password=Secret123! contact test@example.com',
  );
  assert.doesNotMatch(message, /abc\.def|Secret123|test@example\.com/i);
  assert.match(message, /\[REDACTED\]|\[EMAIL_REDACTED\]/);
  const metadata = sanitizeObservationMetadata({
    token: 'raw-token',
    nested: 'Bearer sensitive-value',
    detail: { note: 'password=NestedSecret!' },
    count: 3,
  });
  assert.equal(metadata.token, '[REDACTED]');
  assert.doesNotMatch(String(metadata.nested), /sensitive-value/);
  assert.doesNotMatch(JSON.stringify(metadata.detail), /NestedSecret/);
  assert.equal(metadata.count, 3);
});

test('system health status prioritizes stalled and failed services deterministically', () => {
  assert.equal(healthStatusFromCounts({ hasHistory: true, stalled: 1 }), 'stalled');
  assert.equal(healthStatusFromCounts({ hasHistory: true, failed: 1 }), 'degraded');
  assert.equal(healthStatusFromCounts({ hasHistory: true, running: 1 }), 'running');
  assert.equal(healthStatusFromCounts({ hasHistory: true }), 'healthy');
  assert.equal(healthStatusFromCounts({ hasHistory: false }), 'never');
  const services = [
    { status: 'healthy' },
    { status: 'stalled' },
    { status: 'degraded' },
  ];
  assert.equal(overallSystemStatus(services), 'stalled');
  const summary = systemHealthSummary(services);
  assert.equal(summary.healthy, 1);
  assert.equal(summary.stalled, 1);
  assert.equal(summary.degraded, 1);
});

test('observability migration is durable, tenant scoped and service-only', async () => {
  const [migration, rollback] = await Promise.all([
    read('migrations/20260723_210_system_observability.sql'),
    read('migrations/20260723_210_system_observability.rollback.sql'),
  ]);
  assert.match(migration, /crm_system_operation_runs/);
  assert.match(migration, /crm_system_service_health/);
  assert.match(migration, /crm_start_system_operation/);
  assert.match(migration, /crm_finish_system_operation/);
  assert.match(migration, /crm_mark_stalled_system_operations/);
  assert.match(migration, /where status = 'running'/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /grant (?:select|insert|update|delete|all)[^;]*authenticated/i);
  assert.doesNotMatch(rollback, /drop table/i);
});

test('Next instrumentation records only sanitized request context', async () => {
  const [instrumentation, observer] = await Promise.all([
    read('instrumentation.ts'),
    read('lib/server/observability.ts'),
  ]);
  assert.match(instrumentation, /Instrumentation\.onRequestError/);
  assert.match(instrumentation, /await recordUnhandledServerError/);
  assert.doesNotMatch(instrumentation, /request\.headers|request\.body/);
  assert.match(observer, /next_unhandled_error/);
  assert.doesNotMatch(observer, /p_error_message:\s*(?:error|input)\.message/);
});

test('administrative health endpoint aggregates every required durable signal', async () => {
  const [route, page, sidebar, cronAutomations, cronStoria] = await Promise.all([
    read('app/api/system/health/route.ts'),
    read('app/system-health/page.tsx'),
    read('components/Sidebar.tsx'),
    read('app/api/cron/automations/route.ts'),
    read('app/api/cron/storia-sync/route.ts'),
  ]);
  for (const source of [
    'webhook_events',
    'portal_sync_health',
    'prospect_source_health',
    'feed_export_logs',
    'automation_jobs',
    'portal_removal_jobs',
    'property_media_cleanup_jobs',
    'demand_match_refresh_queue',
    'security_events',
    'crm_audit_log',
  ]) {
    assert.match(route, new RegExp(source));
  }
  assert.match(route, /\['owner', 'admin'\]/);
  assert.match(route, /crm_mark_stalled_system_operations/);
  assert.doesNotMatch(route, /last_error_message|error_message/);
  assert.doesNotMatch(route, /[,"]last_error[,'"]/);
  assert.match(page, /Ultimul succes/);
  assert.match(page, /Ultima eroare/);
  assert.match(page, /Următoarea rulare/);
  assert.match(page, /Reîncercări/);
  assert.match(sidebar, /Sănătate sistem/);
  assert.match(cronAutomations, /startSystemOperation/);
  assert.match(cronStoria, /finishSystemOperation/);
});
