import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const backupArg = process.argv.find((argument) => argument.startsWith('--backup='));
if (!backupArg) {
  console.error('Utilizare: node scripts/audit-notifications.mjs --backup=<director-backup>');
  process.exit(1);
}

const backup = resolve(backupArg.slice('--backup='.length));
const load = async (name) => {
  try {
    return JSON.parse(await readFile(resolve(backup, `${name}.json`), 'utf8'));
  } catch {
    return [];
  }
};

const manifest = JSON.parse(await readFile(resolve(backup, 'manifest.json'), 'utf8'));
const snapshotAt = new Date(manifest.created_at);
const dayAgo = new Date(snapshotAt.getTime() - 86_400_000);
const monthAgo = new Date(snapshotAt.getTime() - 30 * 86_400_000);
const in48Hours = new Date(snapshotAt.getTime() + 48 * 3_600_000);

const [leads, tasks, viewings, matches, properties, listings, transactions, documents, oldNotifications] =
  await Promise.all([
    load('leads'), load('tasks'), load('calendar_events'), load('matches'), load('properties'),
    load('portal_listings'), load('transactions'), load('property_documents'), load('pi_notifications'),
  ]);

const active = (row) => !row.deleted_at;
const between = (value, start, end = snapshotAt) => {
  const time = new Date(value || 0);
  return Number.isFinite(time.getTime()) && time >= start && time <= end;
};
const propertyById = new Map(properties.map((row) => [row.id, row]));

const counts = {
  existing_persistent_notifications: oldNotifications.length,
  new_leads_last_30_days: leads.filter((row) => active(row) && between(row.received_at, monthAgo)).length,
  uncontacted_leads_over_24h: leads.filter((row) =>
    active(row) && row.status === 'new' && between(row.received_at, monthAgo, dayAgo)).length,
  overdue_tasks: tasks.filter((row) => row.status !== 'done' && new Date(row.due_at) < snapshotAt).length,
  viewings_next_48h: viewings.filter((row) =>
    active(row) && row.type === 'vizionare' && ['programata', 'confirmata'].includes(row.status)
    && between(row.start_at, snapshotAt, in48Hours)).length,
  new_matches_last_30_days: matches.filter((row) =>
    row.status === 'noua' && between(row.created_at, monthAgo)).length,
  expired_properties: properties.filter((row) => active(row) && row.status === 'expirata').length,
  portal_errors: listings.filter((row) =>
    ['error', 'rejected', 'removal_failed'].includes(row.status) || Boolean(row.error_message)).length,
  transactions_last_30_days: transactions.filter((row) =>
    active(row) && between(row.created_at, monthAgo)).length,
  expired_documents: documents.filter((row) =>
    row.expires_at && new Date(row.expires_at) <= snapshotAt && propertyById.has(row.property_id)).length,
};

console.log(JSON.stringify({
  backup,
  snapshot_at: snapshotAt.toISOString(),
  historical_read_state_available: false,
  safe_backfill_candidates: counts,
  note: 'Audit doar în citire; numărul efectiv per utilizator depinde de profilele active și de agentul asociat.',
}, null, 2));
