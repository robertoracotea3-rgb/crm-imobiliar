import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  auditSnapshot,
  hashAuditIp,
  normalizedForwardedIp,
  redactAuditValue,
} from '../lib/audit-values.ts';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('audit values redact nested credentials and bound oversized content', () => {
  const input = {
    username: 'agent',
    password: 'secret',
    nested: {
      access_token: 'token',
      safe: 'kept',
      children: [{ apiKey: 'hidden', value: 2 }],
    },
  };
  const result = redactAuditValue(input);
  assert.equal(result.password, '[REDACTED]');
  assert.equal(result.nested.access_token, '[REDACTED]');
  assert.equal(result.nested.children[0].apiKey, '[REDACTED]');
  assert.equal(result.nested.safe, 'kept');
  assert.equal(redactAuditValue('x'.repeat(3_000)).length, 2_000);
});

test('audit IP handling keeps only a normalized irreversible hash', () => {
  const ip = normalizedForwardedIp(' 2001:DB8::1, 10.0.0.1 ');
  assert.equal(ip, '2001:db8::1');
  const hash = hashAuditIp(ip, 'synthetic-salt-at-least-16');
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hash, ip);
  assert.equal(hashAuditIp(ip, 'short'), null);
  assert.equal(normalizedForwardedIp('not an ip'), null);
});

test('audit snapshots contain only explicitly approved fields', () => {
  assert.deepEqual(
    auditSnapshot({ id: '1', role: 'agent', password: 'hidden' }, ['id', 'role']),
    { id: '1', role: 'agent' },
  );
});

test('database audit is append-only, redacted, tenant scoped and hash chained', async () => {
  const migration = await read('migrations/20260720_190_immutable_audit_log.sql');
  assert.match(migration, /create table if not exists public\.crm_audit_log/);
  assert.match(migration, /crm_audit_redact/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /sequence_no bigint generated always as identity/);
  assert.match(migration, /previous_hash/);
  assert.match(migration, /event_hash/);
  assert.match(migration, /before update or delete/);
  assert.match(migration, /crm_audit_log_is_immutable/);
  assert.match(migration, /agency_id = public\.current_crm_agency_id\(\)/);
  assert.doesNotMatch(migration, /grant (insert|update|delete).*authenticated/i);
});

test('every mandatory sensitive workflow emits the central audit event', async () => {
  const sources = await Promise.all([
    read('lib/auth-context.tsx'),
    read('app/api/auth/audit/route.ts'),
    read('app/api/team/members/[id]/route.ts'),
    read('app/api/clients/duplicates/route.ts'),
    read('app/api/contacts/route.ts'),
    read('app/api/properties/bulk/route.ts'),
    read('app/api/properties/delete/route.ts'),
    read('app/api/feed/properties.xml/route.ts'),
    read('app/api/transactions/route.ts'),
    read('app/api/transactions/removals/route.ts'),
  ]);
  const source = sources.join('\n');
  for (const action of [
    'auth.login',
    'auth.login_failed',
    'auth.logout',
    'team.role_changed',
    'team.permissions_changed',
    'contact.sensitive_list_accessed',
    'contact.merged',
    'property.agent_reassigned',
    'property.archived',
    'feed.exported',
    'transaction.commission_changed',
    'transaction.finalized',
    'portal.removal_processed',
  ]) {
    assert.match(source, new RegExp(action.replace('.', '\\.')), `${action} is not audited`);
  }
});

test('audit API is privileged, paginated and never returns the IP hash', async () => {
  const source = await read('app/api/audit/route.ts');
  assert.match(source, /module: 'team', action: 'manage_permissions'/);
  assert.match(source, /createPageWindow/);
  assert.match(source, /crm_verify_audit_chain/);
  assert.match(source, /ip_recorded: Boolean/);
  assert.match(source, /ip_hash: undefined/);
});
