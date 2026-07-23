import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createOAuthState,
  createPortalTokenEncryptionKey,
  decryptPortalToken,
  encryptPortalToken,
  hashAuthenticatedSession,
  hashOAuthState,
  isValidOAuthState,
  portalTokenEncryptionConfigured,
} from '../lib/server/portal-token-crypto.mjs';

const agencyA = 'aaaaaaaa-0000-0000-0000-000000000001';
const agencyB = 'bbbbbbbb-0000-0000-0000-000000000001';
const key = createPortalTokenEncryptionKey();

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('OAuth state is random, opaque, valid and stored as a hash', () => {
  const first = createOAuthState();
  const second = createOAuthState();
  assert.equal(isValidOAuthState(first), true);
  assert.equal(isValidOAuthState(second), true);
  assert.notEqual(first, second);
  assert.match(hashOAuthState(first), /^[a-f0-9]{64}$/);
  assert.notEqual(hashOAuthState(first), hashOAuthState(second));
  assert.equal(first.includes(agencyA), false);
});

test('malformed OAuth states are rejected before hashing', () => {
  for (const value of ['', 'short', `${createOAuthState()}.extra`, agencyA, null]) {
    assert.equal(isValidOAuthState(value), false);
  }
  assert.throws(() => hashOAuthState('not-valid'), /portal_oauth_state_invalid/);
});

test('authenticated sessions are represented only by a stable SHA-256 hash', () => {
  const token = 'private-session-token';
  const digest = hashAuthenticatedSession(token);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(digest.includes(token), false);
  assert.equal(hashAuthenticatedSession(token), digest);
  assert.throws(() => hashAuthenticatedSession(''), /portal_oauth_session_missing/);
});

test('portal tokens round-trip with AES-256-GCM in the same tenant context', () => {
  const context = { agencyId: agencyA, portal: 'storia', purpose: 'access' };
  const ciphertext = encryptPortalToken('secret-access-token', context, key);
  assert.match(ciphertext, /^v1\./);
  assert.equal(ciphertext.includes('secret-access-token'), false);
  assert.equal(decryptPortalToken(ciphertext, context, key), 'secret-access-token');
});

test('ciphertexts cannot be moved to another agency or token purpose', () => {
  const ciphertext = encryptPortalToken(
    'secret-refresh-token',
    { agencyId: agencyA, portal: 'storia', purpose: 'refresh' },
    key,
  );
  assert.throws(
    () => decryptPortalToken(
      ciphertext,
      { agencyId: agencyB, portal: 'storia', purpose: 'refresh' },
      key,
    ),
    /portal_token_decryption_failed/,
  );
  assert.throws(
    () => decryptPortalToken(
      ciphertext,
      { agencyId: agencyA, portal: 'storia', purpose: 'access' },
      key,
    ),
    /portal_token_decryption_failed/,
  );
});

test('tampered ciphertext and missing or weak keys fail closed', () => {
  const context = { agencyId: agencyA, portal: 'storia', purpose: 'access' };
  const ciphertext = encryptPortalToken('token', context, key);
  const tampered = `${ciphertext.slice(0, -1)}${ciphertext.endsWith('A') ? 'B' : 'A'}`;
  assert.throws(
    () => decryptPortalToken(tampered, context, key),
    /portal_token_decryption_failed/,
  );
  assert.equal(portalTokenEncryptionConfigured(''), false);
  assert.equal(portalTokenEncryptionConfigured('too-short'), false);
  assert.equal(portalTokenEncryptionConfigured(key), true);
});

test('connect and callback routes bind agency server-side and validate state', async () => {
  const [connect, callback] = await Promise.all([
    read('app/api/portals/storia/connect/route.ts'),
    read('app/api/portals/storia/callback/route.ts'),
  ]);
  assert.match(connect, /\.from\('portal_oauth_sessions'\)/);
  assert.match(connect, /agency_id:\s*agencyId/);
  assert.match(connect, /session_hash:\s*sessionHash/);
  assert.match(connect, /hashOAuthState\(state\)/);
  assert.doesNotMatch(connect, /`\$\{user\.id\}/);

  assert.match(callback, /crm_consume_portal_oauth_session/);
  assert.match(callback, /hashOAuthState\(state\)/);
  assert.match(callback, /session\.agency_id/);
  assert.match(callback, /crm_complete_portal_oauth/);
  assert.doesNotMatch(callback, /\.from\('agencies'\)/);
  assert.doesNotMatch(callback, /encodeURIComponent\(error\)/);
  assert.doesNotMatch(callback, /access_token:\s*tokens\.access_token/);
});

test('disconnect route performs an audited tenant-scoped revocation', async () => {
  const source = await read('app/api/portals/storia/disconnect/route.ts');
  assert.match(source, /requireApiAuth/);
  assert.match(source, /module:\s*'portals',\s*action:\s*'delete'/);
  assert.match(source, /crm_revoke_portal_connection/);
  assert.match(source, /p_agency_id:\s*agencyId/);
  assert.match(source, /p_actor_id:\s*user\.id/);
});

test('migration protects secrets and exposes OAuth functions only to service role', async () => {
  const migration = await read('migrations/20260720_140_storia_oauth_security.sql');
  assert.match(migration, /access_token_ciphertext/);
  assert.match(migration, /portal_oauth_sessions/);
  assert.match(migration, /portal_token_events/);
  assert.match(migration, /crm_consume_portal_oauth_session/);
  assert.match(migration, /crm_claim_portal_token_refresh/);
  assert.match(migration, /crm_revoke_portal_connection/);
  assert.match(migration, /revoke all on public\.portal_tokens from public,anon,authenticated/);
  assert.match(migration, /grant execute on function public\.crm_complete_portal_oauth[\s\S]*to service_role/);
});
