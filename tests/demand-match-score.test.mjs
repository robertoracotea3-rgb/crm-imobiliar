import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeMatchKey, scoreMatch } from '../lib/match-score.ts';

const property = {
  category: 'apartament', transaction: 'vanzare', city: 'Făgăraș', county: 'Brașov',
  zone: 'Central', price: 90000, currency: 'EUR', surface_useful: 70,
  attributes: { nr_camere: 3, etaj: 2, mobilat: 'Mobilat', nr_parcare: 1 },
};

test('Romanian location spellings normalize deterministically', () => {
  assert.equal(normalizeMatchKey(' FĂGĂRAȘ '), normalizeMatchKey('fagaras'));
});

test('unknown budget is not converted to a zero-to-infinity match', () => {
  const result = scoreMatch(property, {
    property_types: ['apartament'], transaction: 'vanzare', cities: ['Făgăraș'],
    budget_unknown: true,
  });
  assert.equal(result.explanations.some((item) => item.key === 'price'), false);
  assert.equal(result.price_difference, null);
});

test('the score explains matched, unmatched and unknown criteria', () => {
  const result = scoreMatch(property, {
    property_types: ['apartament'], transaction: 'vanzare', cities: ['Făgăraș'], zones: ['Nord'],
    budget_min: 60000, budget_max: 80000, currency: 'EUR', budget_unknown: false,
    rooms_min: 3, rooms_max: 4, land_area_min: 200, parking_required: true,
  });
  assert.equal(result.eligible, true);
  assert.ok(result.matched.some((message) => message.includes('Localitate')));
  assert.ok(result.unmatched.some((message) => message.includes('Diferență')));
  assert.ok(result.unknown.some((message) => message.includes('Teren')));
  assert.equal(result.price_difference, 10000);
});

test('an explicit property type or city mismatch blocks noisy recommendations', () => {
  const wrongType = scoreMatch(property, { property_types: ['teren'], transaction: 'vanzare', cities: ['Făgăraș'], budget_unknown: true });
  const wrongCity = scoreMatch(property, { property_types: ['apartament'], transaction: 'vanzare', cities: ['Sibiu'], budget_unknown: true });
  assert.equal(wrongType.eligible, false);
  assert.equal(wrongCity.eligible, false);
});

test('missing property data lowers coverage without being treated as numeric zero', () => {
  const result = scoreMatch({ category: 'teren', transaction: 'vanzare', city: 'Beclean' }, {
    property_types: ['teren'], transaction: 'vanzare', cities: ['Beclean'], budget_unknown: true,
    land_area_min: 1000,
  });
  assert.ok(result.coverage < 100);
  assert.ok(result.unknown.some((message) => message.includes('Teren')));
});
