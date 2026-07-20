import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDefaultWhatsAppMessage,
  createWhatsAppLink,
  normalizeWhatsAppPhone,
} from '../lib/whatsapp.mjs';

test('normalizes Romanian mobile numbers to E.164', () => {
  assert.deepEqual(normalizeWhatsAppPhone('0775 132 969'), {
    ok: true,
    reason: null,
    digits: '40775132969',
    e164: '+40775132969',
  });
});

test('keeps valid international numbers without changing the country code', () => {
  assert.equal(normalizeWhatsAppPhone('+44 7700 900123').digits, '447700900123');
  assert.equal(normalizeWhatsAppPhone('0049 151 23456789').digits, '4915123456789');
});

test('rejects numbers that cannot be valid E.164 values', () => {
  assert.equal(normalizeWhatsAppPhone('123').ok, false);
  assert.equal(normalizeWhatsAppPhone('07 12').reason, 'invalid_e164');
});

test('creates an encoded wa.me link with the public property URL', () => {
  const message = buildDefaultWhatsAppMessage({
    clientName: 'Ana',
    propertyTitle: 'Apartament central',
    propertyUrl: 'https://www.kiraimobiliare.ro/proprietati/apartament-fagaras-ki001',
  });
  const result = createWhatsAppLink({ phone: '0775-132-969', message });
  assert.equal(result.ok, true);
  assert.match(result.url, /^https:\/\/wa\.me\/40775132969\?text=/);
  assert.match(decodeURIComponent(result.url.split('?text=')[1]), /kiraimobiliare\.ro\/proprietati/);
});

test('does not create a link for an empty message', () => {
  assert.equal(createWhatsAppLink({ phone: '0775132969', message: '  ' }).reason, 'missing_message');
});
