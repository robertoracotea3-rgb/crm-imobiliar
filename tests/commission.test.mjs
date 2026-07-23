import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePropertyCommission } from '../lib/commission.ts';

test('explicit owner and counterparty commission values take precedence', () => {
  assert.deepEqual(
    calculatePropertyCommission({
      price: 100_000,
      currency: 'EUR',
      attributes: {
        comision_prop_val: 2_500,
        comision_prop_pct: 3,
        comision_chir_val: 1_000,
        comision_chir_pct: 2,
      },
    }),
    {
      owner: 2_500,
      counterparty: 1_000,
      total: 3_500,
      currency: 'EUR',
      source: 'explicit_value',
    },
  );
});

test('percentage commission is calculated deterministically to cents', () => {
  const result = calculatePropertyCommission({
    price: '123456.78',
    currency: 'ron',
    attributes: { comision_prop_pct: 2.5, comision_chir_pct: 1 },
  });
  assert.equal(result.owner, 3_086.42);
  assert.equal(result.counterparty, 1_234.57);
  assert.equal(result.total, 4_320.99);
  assert.equal(result.currency, 'RON');
  assert.equal(result.source, 'percentage');
});

test('legacy commission is used only when no side-specific commission exists', () => {
  const legacy = calculatePropertyCommission({
    price: 80_000,
    attributes: { comision: 3 },
  });
  assert.equal(legacy.owner, 2_400);
  assert.equal(legacy.total, 2_400);
  assert.equal(legacy.source, 'legacy_percentage');

  const invalid = calculatePropertyCommission({
    price: -1,
    attributes: { comision: 'invalid', comision_prop_val: -2 },
  });
  assert.equal(invalid.total, 0);
  assert.equal(invalid.source, 'none');
});
