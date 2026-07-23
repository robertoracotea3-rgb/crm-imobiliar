import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  assessAgencySuspicion, canonicalizeProspectUrl, deriveProspectStatus, prospectMatchKey,
} from '../lib/prospects/normalize.ts';

const backupRoot = join(process.cwd(), 'backups');
const candidates = readdirSync(backupRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith('supabase-'))
  .map((entry) => join(backupRoot, entry.name, 'prospects.json'))
  .filter(existsSync)
  .sort().reverse();
const path = process.argv[2] ? join(process.cwd(), process.argv[2]) : candidates[0];
if (!path || !existsSync(path)) throw new Error('Nu există un backup prospects.json pentru audit.');
const rows = JSON.parse(readFileSync(path, 'utf8'));

const countBy = (values) => Object.fromEntries([...values.reduce((map, value) => {
  const key = String(value || '(gol)');
  map.set(key, (map.get(key) || 0) + 1);
  return map;
}, new Map()).entries()].sort((a, b) => b[1] - a[1]));
const groups = (values) => values.reduce((map, [key, row]) => {
  if (!key) return map;
  const group = map.get(key) || [];
  group.push(row);
  map.set(key, group);
  return map;
}, new Map());

const urlGroups = groups(rows.map((row) => [canonicalizeProspectUrl(row.url), row]));
const similarityGroups = groups(rows.map((row) => {
  const title = prospectMatchKey(row.title);
  const city = prospectMatchKey(row.city);
  return [title && city && row.price !== null ? `${title}|${Number(row.price)}|${city}|${row.category || ''}` : null, row];
}));
const phoneGroups = groups(rows.map((row) => [String(row.phone || '').replace(/\D/g, '') || null, row]));
const sellerCounts = new Map(Object.entries(countBy(rows.map((row) => prospectMatchKey(row.seller_name)))));
const suspected = rows.filter((row) => assessAgencySuspicion(
  { title: row.title, seller_name: row.seller_name },
  { reusedPhoneCount: phoneGroups.get(String(row.phone || '').replace(/\D/g, ''))?.length || 0,
    similarListingCount: Number(sellerCounts.get(prospectMatchKey(row.seller_name)) || 0) },
).suspected);
const projectedStatuses = countBy(rows.map((row) => deriveProspectStatus({
  previousStatus: row.status, firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at,
  processedAt: ['mandat', 'refuzat', 'contactat'].includes(row.status) ? row.last_seen_at : null,
})));
const duplicateUrlGroups = [...urlGroups.values()].filter((group) => group.length > 1);
const crossSourceSimilarGroups = [...similarityGroups.values()].filter((group) =>
  group.length > 1 && new Set(group.map((row) => row.source)).size > 1
);

console.log(JSON.stringify({
  backup: path,
  rows: rows.length,
  sources: countBy(rows.map((row) => row.source)),
  legacy_statuses: countBy(rows.map((row) => row.status)),
  projected_statuses: projectedStatuses,
  phones_present: rows.filter((row) => row.phone).length,
  canonical_url_duplicate_groups: duplicateUrlGroups.length,
  canonical_url_duplicate_members: duplicateUrlGroups.reduce((sum, group) => sum + group.length, 0),
  cross_source_similarity_candidate_groups: crossSourceSimilarGroups.length,
  cross_source_similarity_candidate_members: crossSourceSimilarGroups.reduce((sum, group) => sum + group.length, 0),
  agency_suspected_candidates: suspected.length,
  image_similarity_available: false,
  notes: [
    'Similaritatea titlu/preț/localitate creează doar grupuri candidate; nu șterge și nu confirmă automat un duplicat.',
    'Clasificarea de agenție este o suspiciune explicabilă, nu o certitudine.',
  ],
}, null, 2));
