import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { LEAD_STATUSES, PROPERTY_STATUSES, normalizeLeadSource } from '../lib/crm-catalogs.ts';

const backupArg = process.argv.find((arg) => arg.startsWith('--backup='));
if (!backupArg) {
  console.error('Utilizare: node scripts/audit-status-sources.mjs --backup=<director-backup>');
  process.exit(2);
}

const backupDir = resolve(backupArg.slice('--backup='.length));
const readRows = (name) => {
  const path = resolve(backupDir, `${name}.json`);
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  return Array.isArray(parsed) ? parsed : (Array.isArray(parsed.data) ? parsed.data : []);
};
const counts = (values) => Object.fromEntries([...values.reduce((map, value) => {
  const key = value === null || value === undefined || value === '' ? '(gol)' : String(value);
  map.set(key, (map.get(key) || 0) + 1);
  return map;
}, new Map()).entries()].sort((a, b) => b[1] - a[1]));

const leads = readRows('leads');
const demands = readRows('demands');
const properties = readRows('properties');
const viewings = readRows('calendar_events').filter((row) => row.type === 'vizionare');
const transactions = readRows('transactions');
const activities = readRows('activities');
const leadCodes = new Set(LEAD_STATUSES.map((status) => status.code));
const propertyCodes = new Set(PROPERTY_STATUSES.map((status) => status.code));

const sourceProjection = (rows) => counts(rows.map((row) => normalizeLeadSource(row.source)));
const report = {
  mode: 'dry-run',
  writesPerformed: 0,
  rows: {
    leads: leads.length,
    demands: demands.length,
    properties: properties.length,
    viewings: viewings.length,
    transactions: transactions.length,
    activities: activities.length,
  },
  current: {
    leadStatuses: counts(leads.map((row) => row.status)),
    propertyStatuses: counts(properties.map((row) => row.status)),
    viewingStatuses: counts(viewings.map((row) => row.status)),
    transactionStatuses: counts(transactions.map((row) => row.status)),
    activityTypes: counts(activities.map((row) => row.type)),
    leadSources: counts(leads.map((row) => row.source)),
    demandSources: counts(demands.map((row) => row.source)),
  },
  projected: {
    leadSources: sourceProjection(leads),
    demandSources: sourceProjection(demands),
    unknownLeadStatuses: counts(leads.filter((row) => !leadCodes.has(row.status)).map((row) => row.status)),
    unknownPropertyStatuses: counts(properties.filter((row) => !propertyCodes.has(row.status)).map((row) => row.status)),
    activeLeadsNeedingNextAction: leads.filter((row) => !['won', 'lost', 'withdrawn'].includes(row.status) && !row.next_action_at).length,
  },
};

console.log(JSON.stringify(report, null, 2));
