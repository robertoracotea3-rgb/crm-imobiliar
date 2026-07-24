import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  formatReportPeriod,
  scheduledWeeklyPeriod,
} from '../lib/weekly-report-period.ts';
import {
  weeklyReportCsv,
  weeklyReportPdf,
} from '../lib/weekly-report-format.ts';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('weekly scheduling uses Bucharest local time and remains calendar-correct across DST', () => {
  const summer = scheduledWeeklyPeriod(
    new Date('2026-07-24T16:00:00.000Z'),
    5,
    '18:00',
  );
  assert.equal(summer.end, '2026-07-24T15:00:00.000Z');
  assert.equal(summer.start, '2026-07-17T15:00:00.000Z');
  assert.equal(summer.due, true);

  const winter = scheduledWeeklyPeriod(
    new Date('2026-10-30T17:00:00.000Z'),
    5,
    '18:00',
  );
  assert.equal(winter.end, '2026-10-30T16:00:00.000Z');
  assert.equal(winter.start, '2026-10-23T15:00:00.000Z');
  assert.equal(
    (new Date(winter.end).getTime() - new Date(winter.start).getTime()) / 3_600_000,
    169,
  );
});

test('weekly report exports are valid CSV and PDF artifacts', () => {
  const report = {
    id: '35000000-0000-4000-8000-000000000001',
    period_start: '2026-07-17T15:00:00.000Z',
    period_end: '2026-07-24T15:00:00.000Z',
    general_metrics: { new_leads: 230, uncontacted: 4 },
    agent_metrics: [{ agent_name: 'Agent Test', assigned_leads: 230, sla_percent: 98.3 }],
  };
  const csv = weeklyReportCsv(report);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /"Leaduri noi";"230"/);
  const pdf = weeklyReportPdf(report);
  assert.equal(pdf.subarray(0, 8).toString('latin1'), '%PDF-1.4');
  assert.match(pdf.subarray(-20).toString('latin1'), /%%EOF/);
  assert.match(formatReportPeriod(report.period_start, report.period_end), /2026/);
});

test('database reporting is exact, drillable, tenant-scoped and duplicate-safe', async () => {
  const [migration, recordsRoute, service, cron, vercel] = await Promise.all([
    read('migrations/20260724_300_weekly_agent_reports.sql'),
    read('app/api/reports/weekly/[id]/records/route.ts'),
    read('lib/server/weekly-reports.ts'),
    read('app/api/cron/weekly-reports/route.ts'),
    read('vercel.json'),
  ]);
  assert.match(migration, /crm_generate_weekly_report/);
  assert.match(migration, /weekly_report_records/);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /unique\(agency_id, period_start, period_end\)/);
  assert.doesNotMatch(migration, /limit 200/i);
  assert.match(recordsRoute, /count: 'exact'/);
  assert.match(recordsRoute, /pageSize = 100/);
  assert.match(service, /email_attempt_count >= 5/);
  assert.match(service, /weekly-report.*generation_version/s);
  assert.match(service, /provider_domain_status === 'verified'/);
  assert.match(cron, /verifyCronAuthorization/);
  assert.match(vercel, /api\/cron\/weekly-reports/);
});

test('every requested report metric has a stored drill-down source', async () => {
  const [migration, dashboard] = await Promise.all([
    read('migrations/20260724_300_weekly_agent_reports.sql'),
    read('components/WeeklyReportDashboard.tsx'),
  ]);
  for (const code of [
    'new_leads',
    'allocated_demands',
    'contacted_in_24h',
    'contacted_late',
    'uncontacted',
    'activities_missing_description',
    'demands_missing_next_action',
    'demands_over_20_days',
    'demands_closed',
    'demands_should_close',
    'viewings_scheduled',
    'viewings_completed',
    'storia_unmatched',
    'active_properties_unassigned',
    'overdue_tasks',
    'assigned_leads',
    'contacted_leads',
    'average_response_samples',
    'active_demands',
    'offers',
    'transactions',
  ]) assert.match(migration, new RegExp(`'${code}'`));
  assert.match(dashboard, /Vezi lista exactă/);
  assert.match(dashboard, /AGENT_DRILLDOWN/);
});
