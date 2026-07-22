import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareClientIdentities,
  identityLookupKeys,
  normalizeClientEmail,
  normalizeClientPhone,
} from '../lib/client-identity.ts';

test('Romanian and international phone spellings share one canonical identity', () => {
  assert.equal(normalizeClientPhone('0722 123 456'), '40722123456');
  assert.equal(normalizeClientPhone('+40 722 123 456'), '40722123456');
  assert.equal(normalizeClientPhone('0040-722-123-456'), '40722123456');
  assert.equal(normalizeClientPhone('+44 7700 900123'), '447700900123');
});

test('invalid phone and e-mail values are excluded from reconciliation', () => {
  assert.equal(normalizeClientPhone('123'), null);
  assert.equal(normalizeClientPhone('07xx'), null);
  assert.equal(normalizeClientEmail('not-an-email'), null);
  assert.equal(normalizeClientEmail(''), null);
});

test('e-mail reconciliation is case and whitespace insensitive', () => {
  assert.equal(normalizeClientEmail('  Client@Example.RO '), 'client@example.ro');
});

test('exact identifiers have explicit reasons and deterministic confidence', () => {
  assert.deepEqual(
    compareClientIdentities(
      { phone: '0722 123 456', email: 'client@example.ro' },
      { phone: '+40722123456', email: 'CLIENT@example.ro' },
    ),
    { score: 100, reasons: ['same_phone', 'same_email'], safe: true },
  );
  assert.equal(compareClientIdentities({ email: 'a@b.ro' }, { email: 'a@b.ro' }).score, 90);
  assert.equal(compareClientIdentities({ phone: '0722123456' }, { phone: '0722123456' }).score, 95);
});

test('names are never identity keys and portal matching requires both official parts', () => {
  assert.deepEqual(identityLookupKeys({}), []);
  assert.deepEqual(identityLookupKeys({ portal: 'storia', portalClientId: 'ABC-1' }), [
    'portal:storia:abc-1',
  ]);
  assert.equal(compareClientIdentities({ portal: 'storia' }, { portal: 'storia' }).safe, false);
});
