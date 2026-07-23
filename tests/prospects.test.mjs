import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  assessAgencySuspicion, canonicalizeProspectUrl, deriveProspectStatus,
  normalizeProspect, normalizeProspectStatus, prospectMatchKey,
} from '../lib/prospects/normalize.ts';

test('prospect values and URLs are normalized deterministically', () => {
  assert.equal(prospectMatchKey('  Făgăraș, Brașov '), 'fagaras brasov');
  assert.equal(
    canonicalizeProspectUrl('https://WWW.OLX.ro/d/oferta/test/?utm_source=x&b=2&a=1#foto'),
    'https://olx.ro/d/oferta/test?a=1&b=2',
  );
  const row = normalizeProspect({
    source: ' OLX ', external_id: '123', url: 'https://www.olx.ro/d/oferta/test/?utm_medium=x',
    title: 'Casă în Făgăraș', price: 120000, currency: 'lei', city: 'Făgăraș', category: 'Casă',
    transaction: 'De vânzare', phone: '+40 722 123 456',
  });
  assert.equal(row?.source, 'olx');
  assert.equal(row?.currency, 'RON');
  assert.equal(row?.category, 'casa');
  assert.equal(row?.phone_normalized, '0722123456');
  assert.match(row?.search_text || '', /fagaras/);
});

test('legacy statuses and automatic lifecycle never keep old rows as new', () => {
  assert.equal(normalizeProspectStatus('nou'), 'new');
  assert.equal(normalizeProspectStatus('mandat'), 'imported_to_portfolio');
  const now = '2026-07-22T12:00:00Z';
  assert.equal(deriveProspectStatus({
    previousStatus: 'nou', firstSeenAt: '2026-07-01T00:00:00Z', lastSeenAt: '2026-07-22T10:00:00Z', now,
  }), 'active');
  assert.equal(deriveProspectStatus({
    previousStatus: 'nou', firstSeenAt: '2026-07-01T00:00:00Z', lastSeenAt: '2026-07-10T10:00:00Z', now,
  }), 'stale');
  assert.equal(deriveProspectStatus({
    previousStatus: 'contactat', firstSeenAt: '2026-07-01T00:00:00Z', lastSeenAt: '2026-07-10T10:00:00Z', now,
  }), 'contacted');
  assert.equal(deriveProspectStatus({
    previousStatus: 'active', firstSeenAt: now, lastSeenAt: now, now, missingCount: 2,
  }), 'removed');
});

test('agency classification remains an explainable suspicion', () => {
  const clear = assessAgencySuspicion({ title: 'Vând apartament proprietar', seller_name: 'Ion' });
  assert.equal(clear.suspected, false);
  const suspected = assessAgencySuspicion({
    title: 'Agenție imobiliară, cod ofertă 24, comision', seller_name: 'Casa SRL',
  }, { similarListingCount: 10 });
  assert.equal(suspected.suspected, true);
  assert.ok(suspected.confidence < 100);
  assert.ok(suspected.reasons.length >= 2);
});

test('prospects endpoint is server paginated and obsolete phone filter is gone', () => {
  const route = readFileSync(new URL('../app/api/prospects/route.ts', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../app/prospects/page.tsx', import.meta.url), 'utf8');
  const http = readFileSync(new URL('../lib/prospects/http.ts', import.meta.url), 'utf8');
  assert.match(route, /PAGE_SIZE_MAX = 50/);
  assert.match(route, /\.range\(from, from \+ pageSize - 1\)/);
  assert.doesNotMatch(route, /MAX = 8000|for \(let from = 0/);
  assert.doesNotMatch(page, /Doar cu telefon|filters\.phone/);
  assert.doesNotMatch(http, /PROSPECTS_PROXY_URL|scraperapi|Mozilla\/5\.0/);
});

test('migration declares all lifecycle statuses and source observability', () => {
  const migration = readFileSync(new URL('../migrations/20260720_100_prospects_rebuild.sql', import.meta.url), 'utf8');
  for (const status of ['new','active','contacted','interested','rejected','stale','removed','duplicate','agency_suspected','imported_to_portfolio']) {
    assert.ok(migration.includes(`'${status}'`), `${status} missing from migration`);
  }
  assert.match(migration, /prospect_source_health/);
  assert.match(migration, /prospect_sync_runs/);
  assert.match(migration, /crm_mark_missing_prospects/);
  assert.match(migration, /crm_refresh_prospect_duplicate_groups/);
});
