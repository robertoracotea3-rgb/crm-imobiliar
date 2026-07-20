import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildStoriaAdvertLookupPlan,
  extractStoriaAdvertIdentity,
  normalizePortalAdId,
} from '../lib/server/storia-ad-identity.mjs';

test('extracts the numeric public advert id separately from the API uuid', () => {
  assert.deepEqual(
    extractStoriaAdvertIdentity({
      data: { id: 18196158, uuid: 'de5dfea0-7576-4db9-84be-f56b299ca386' },
    }),
    {
      portalAdId: '18196158',
      externalId: 'de5dfea0-7576-4db9-84be-f56b299ca386',
      advertUrl: null,
    },
  );
});

test('supports documented incoming-message ad_id values', () => {
  assert.equal(extractStoriaAdvertIdentity({ ad_id: 18265408 }).portalAdId, '18265408');
});

test('does not mistake a uuid for the numeric advert id', () => {
  assert.deepEqual(
    extractStoriaAdvertIdentity({ data: { uuid: '8c654bd2-35d1-4425-8786-e5975abfd7fe' } }),
    {
      portalAdId: null,
      externalId: '8c654bd2-35d1-4425-8786-e5975abfd7fe',
      advertUrl: null,
    },
  );
});

test('normalizes numeric and trimmed text advert ids', () => {
  assert.equal(normalizePortalAdId(42), '42');
  assert.equal(normalizePortalAdId(' 42 '), '42');
  assert.equal(normalizePortalAdId('   '), null);
});

test('builds the deterministic association lookup order', () => {
  assert.deepEqual(buildStoriaAdvertLookupPlan({
    ad_id: 18196158,
    external_id: 'api-uuid',
    property_id: 'property-uuid',
    ad_url: 'https://example.test/ad',
  }), [
    { kind: 'portal_ad_id', value: '18196158' },
    { kind: 'external_id', value: 'api-uuid' },
    { kind: 'property_id', value: 'property-uuid' },
    { kind: 'advert_url', value: 'https://example.test/ad' },
  ]);
});
