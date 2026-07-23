import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { TRANSACTION_STATUSES, TRANSACTION_STATUS_TRANSITIONS } from '../lib/crm-catalogs.ts';
import { nextRemovalAttempt, nonNegativeMoney, safePortalError } from '../lib/transactions.ts';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('transaction amounts reject negative and malformed values', () => {
  assert.equal(nonNegativeMoney('123.456'), 123.46);
  assert.equal(nonNegativeMoney(0), 0);
  assert.equal(nonNegativeMoney(-1), null);
  assert.equal(nonNegativeMoney('nu este număr'), null);
  assert.equal(nonNegativeMoney(''), null);
});

test('portal removal retry uses bounded exponential backoff and redacts tokens', () => {
  const now = Date.parse('2026-07-20T10:00:00Z');
  assert.equal(nextRemovalAttempt(1, now), '2026-07-20T10:05:00.000Z');
  assert.equal(nextRemovalAttempt(2, now), '2026-07-20T10:10:00.000Z');
  assert.equal(nextRemovalAttempt(8, now), '2026-07-20T20:40:00.000Z');
  assert.doesNotMatch(safePortalError('Authorization: Bearer secret-token'), /secret-token/);
});

test('transaction lifecycle contains the full operational flow', () => {
  const codes = TRANSACTION_STATUSES.map((status) => status.code);
  for (const code of ['draft', 'oferta', 'negociere', 'rezervata', 'antecontract', 'finantare', 'notar', 'finalizata', 'anulata']) {
    assert.ok(codes.includes(code), `${code} missing`);
  }
  assert.ok(TRANSACTION_STATUS_TRANSITIONS.notar.includes('finalizata'));
  assert.deepEqual(TRANSACTION_STATUS_TRANSITIONS.finalizata, []);
});

test('transactions API is paginated and finalizes only through the atomic RPC', async () => {
  const route = await read('app/api/transactions/route.ts');
  assert.match(route, /PAGE_SIZE_MAX = 50/);
  assert.match(route, /createPageWindow/);
  assert.match(route, /\.range\(from, to\)/);
  assert.match(route, /status: 'draft'/);
  assert.match(route, /rpc\('crm_finalize_transaction'/);
  assert.match(route, /processPortalRemovalJobs/);
  assert.doesNotMatch(route, /status:\s*'finalizata'[\s\S]{0,300}\.insert/);
});

test('migration creates required links, financial ledger and retryable outbox', async () => {
  const migration = await read('migrations/20260720_120_atomic_transactions_outbox.sql');
  assert.match(migration, /transactions_required_links_check/);
  assert.match(migration, /transaction_financial_entries/);
  assert.match(migration, /portal_removal_jobs/);
  assert.match(migration, /for update skip locked/);
  assert.match(migration, /transaction_cannot_finalize_incomplete/);
  assert.match(migration, /status='pending_removal'/);
  assert.match(migration, /status='deleted'/);
  assert.match(migration, /status='removal_failed'/);
  assert.match(migration, /crm_enqueue_notification[\s\S]*transaction_completed/);
});
