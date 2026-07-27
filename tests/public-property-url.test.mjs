import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('database URL snapshots accept the legacy property category enum', () => {
  const migration = readFileSync(
    new URL('../migrations/20260724_230_storia_lead_property_assignment.sql', import.meta.url),
    'utf8',
  );
  assert.match(migration, /property\.category::text/);
  assert.match(migration, /property_row\.category::text/);
});
