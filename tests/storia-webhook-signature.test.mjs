import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeOlxWebhookSignature,
  hashWebhookPayload,
  OLX_SIGNATURE_HEADER,
  verifyOlxWebhookSignature,
} from '../lib/server/storia-webhook-signature.mjs';

const officialFixture = {
  objectId: '9de9b5e3-1720-11e8-8790-0242ac110002',
  transactionId: 'e9a0b0c8-6aad-4a63-8679-501bd2d28761',
  secret: 'mywonderfulsecret',
  signature: 'a7b00386657384a3738d45462749d5a1b0ebd1e7',
};

test('uses only the official x-signature header name', () => {
  assert.equal(OLX_SIGNATURE_HEADER, 'x-signature');
});

test('computes the official OLX HMAC-SHA1 fixture', () => {
  assert.equal(computeOlxWebhookSignature(officialFixture), officialFixture.signature);
});

test('accepts a valid signature', () => {
  assert.deepEqual(
    verifyOlxWebhookSignature(officialFixture),
    { ok: true, reason: null },
  );
});

test('rejects an invalid signature', () => {
  const result = verifyOlxWebhookSignature({
    ...officialFixture,
    signature: '0000000000000000000000000000000000000000',
  });
  assert.deepEqual(result, { ok: false, reason: 'invalid_signature' });
});

test('rejects a missing signature', () => {
  const result = verifyOlxWebhookSignature({ ...officialFixture, signature: '' });
  assert.deepEqual(result, { ok: false, reason: 'missing_signature' });
});

test('rejects a missing secret', () => {
  const result = verifyOlxWebhookSignature({ ...officialFixture, secret: '' });
  assert.deepEqual(result, { ok: false, reason: 'missing_secret' });
});

test('rejects missing identifiers and malformed hexadecimal signatures', () => {
  assert.deepEqual(
    verifyOlxWebhookSignature({ ...officialFixture, objectId: '' }),
    { ok: false, reason: 'missing_identifiers' },
  );
  assert.deepEqual(
    verifyOlxWebhookSignature({ ...officialFixture, signature: 'not-hex' }),
    { ok: false, reason: 'invalid_signature_format' },
  );
});

test('a changed transaction id invalidates the signature', () => {
  const result = verifyOlxWebhookSignature({
    ...officialFixture,
    transactionId: 'different-transaction',
  });
  assert.deepEqual(result, { ok: false, reason: 'invalid_signature' });
});

test('payload hashes detect changed data for the same signed identifiers', () => {
  const original = JSON.stringify({
    object_id: officialFixture.objectId,
    transaction_id: officialFixture.transactionId,
    data: { message: 'original' },
  });
  const changed = JSON.stringify({
    object_id: officialFixture.objectId,
    transaction_id: officialFixture.transactionId,
    data: { message: 'changed' },
  });

  assert.notEqual(hashWebhookPayload(original), hashWebhookPayload(changed));
  assert.equal(hashWebhookPayload(original), hashWebhookPayload(original));
});
