import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

import { extractStoriaAdvertIdentity } from '../lib/server/storia-ad-identity.mjs';

function loadEnvFile(path = '.env.local') {
  const text = readFileSync(path, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] ||= value;
  }
}

loadEnvFile();

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const confirmIndex = args.indexOf('--confirm');
const resumeIndex = args.indexOf('--resume');
const confirmation = confirmIndex >= 0 ? args[confirmIndex + 1] : null;
const resumeId = resumeIndex >= 0 ? args[resumeIndex + 1] : null;

if (apply && confirmation !== 'BACKFILL-STORIA-AD-IDS') {
  console.error('Apply blocked. Re-run with --apply --confirm BACKFILL-STORIA-AD-IDS after reviewing dry-run output.');
  process.exit(2);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing server-side Supabase configuration.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function fetchListings() {
  const rows = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from('portal_listings')
      // `*` keeps dry-run usable before the additive portal_ad_id migration exists.
      .select('*')
      .eq('portal', 'storia')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Listing scan failed: ${error.message}`);
    rows.push(...(data || []));
    if ((data || []).length < pageSize) break;
  }
  return rows;
}

const rows = await fetchListings();
const candidates = rows.map((row) => ({
  ...row,
  candidate: extractStoriaAdvertIdentity(row.raw_response).portalAdId,
}));
const candidateOwners = new Map();
for (const row of candidates) {
  if (!row.candidate) continue;
  const key = `${row.agency_id}|${row.portal}|${row.candidate}`;
  const ids = candidateOwners.get(key) || [];
  ids.push(row.id);
  candidateOwners.set(key, ids);
}
const ambiguousKeys = new Set(
  [...candidateOwners.entries()].filter(([, ids]) => ids.length > 1).map(([key]) => key),
);

const report = {
  mode: apply ? 'apply' : 'dry-run',
  scanned: rows.length,
  already_populated: candidates.filter((row) => row.portal_ad_id).length,
  recoverable: candidates.filter((row) => !row.portal_ad_id && row.candidate).length,
  missing_in_raw_response: candidates.filter((row) => !row.portal_ad_id && !row.candidate).length,
  ambiguous: candidates.filter((row) => row.candidate && ambiguousKeys.has(`${row.agency_id}|${row.portal}|${row.candidate}`)).length,
  would_update: candidates.filter((row) => (
    !row.portal_ad_id
    && row.candidate
    && !ambiguousKeys.has(`${row.agency_id}|${row.portal}|${row.candidate}`)
  )).length,
};

if (!apply) {
  console.log(JSON.stringify(report, null, 2));
} else {
  let runId = resumeId;
  let cursor = null;
  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let ambiguous = 0;

if (resumeId) {
  const { data: run, error } = await admin
    .from('portal_backfill_runs')
    .select('*')
    .eq('id', resumeId)
    .eq('operation', 'storia_portal_ad_id')
    .maybeSingle();
  if (error || !run) throw new Error('Resume run was not found.');
  cursor = run.cursor_listing_id;
  processed = run.processed_count || 0;
  updated = run.updated_count || 0;
  skipped = run.skipped_count || 0;
  ambiguous = run.ambiguous_count || 0;
  await admin.from('portal_backfill_runs').update({ status: 'running', finished_at: null }).eq('id', resumeId);
} else {
  const { data: run, error } = await admin.from('portal_backfill_runs').insert({
    operation: 'storia_portal_ad_id',
    dry_run: false,
    report,
  }).select('id').single();
  if (error || !run?.id) throw new Error('Could not create the backfill audit run.');
  runId = run.id;
}

try {
  const pending = cursor ? candidates.filter((row) => row.id > cursor) : candidates;
  for (const row of pending) {
    processed += 1;
    cursor = row.id;
    const key = row.candidate ? `${row.agency_id}|${row.portal}|${row.candidate}` : '';
    if (row.portal_ad_id || !row.candidate) skipped += 1;
    else if (ambiguousKeys.has(key)) ambiguous += 1;
    else {
      const { error } = await admin
        .from('portal_listings')
        .update({ portal_ad_id: row.candidate, updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('agency_id', row.agency_id)
        .eq('portal', row.portal)
        .is('portal_ad_id', null);
      if (error) throw new Error(`Listing update failed at ${row.id}: ${error.message}`);
      updated += 1;
    }

    if (processed % 25 === 0) {
      await admin.from('portal_backfill_runs').update({
        cursor_listing_id: cursor,
        processed_count: processed,
        updated_count: updated,
        skipped_count: skipped,
        ambiguous_count: ambiguous,
      }).eq('id', runId);
    }
  }

  await admin.from('portal_backfill_runs').update({
    status: 'completed',
    cursor_listing_id: cursor,
    processed_count: processed,
    updated_count: updated,
    skipped_count: skipped,
    ambiguous_count: ambiguous,
    report: { ...report, applied_updates: updated },
    finished_at: new Date().toISOString(),
  }).eq('id', runId);
  console.log(JSON.stringify({ run_id: runId, processed, updated, skipped, ambiguous }, null, 2));
  } catch (error) {
    await admin.from('portal_backfill_runs').update({
      status: 'failed',
      cursor_listing_id: cursor,
      processed_count: processed,
      updated_count: updated,
      skipped_count: skipped,
      ambiguous_count: ambiguous,
      report: { ...report, error: error instanceof Error ? error.message : 'Unknown error' },
      finished_at: new Date().toISOString(),
    }).eq('id', runId);
    throw error;
  }
}
