import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPublicPropertyUrl } from '../lib/public-property-url.ts';

test('builds a public kiraimobiliare.ro URL and never a CRM URL', () => {
  const url = buildPublicPropertyUrl({
    id: '12345678-0000-4000-8000-000000000001',
    internal_code: 'KI-042',
    category: 'apartament',
    city: 'Făgăraș',
  });
  assert.equal(url, 'https://www.kiraimobiliare.ro/proprietati/apartament-fagaras-ki-042');
  assert.doesNotMatch(url, /crm\./);
});

test('uses a stable non-empty fallback when optional public fields are absent', () => {
  assert.equal(
    buildPublicPropertyUrl({ id: 'abcdef12-0000-4000-8000-000000000001' }),
    'https://www.kiraimobiliare.ro/proprietati/proprietate-fagaras-abcdef12',
  );
});
