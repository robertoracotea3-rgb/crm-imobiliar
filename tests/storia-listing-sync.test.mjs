import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { verifyCronAuthorization } from '../lib/server/cron-auth.mjs';
import {
  listingIsConfirmedActive,
  listingNeedsOnDemandCheck,
  mapStoriaStatus,
  parseStoriaMetadata,
  presentStoriaListing,
  STORIA_STALE_AFTER_MS,
} from '../lib/server/storia-listing-state.mjs';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const officialMetadata = {
  uuid: 'f7695d17-8ee2-4409-89ac-74c673630edb',
  last_action_status: 'POSTED',
  last_action_at: '2026-07-20T17:21:05.537+0000',
  state: {
    code: 'active',
    visible_in_profile: 'true',
    ttl: '2026-08-20T16:01:12.000+0000',
    url: 'https://www.storia.ro/ro/oferta/apartament-IDabc.html',
    moderation: { reason: null, description: null },
  },
  last_error: null,
};

test('parses official advert metadata including the nested public URL', () => {
  const parsed = parseStoriaMetadata(officialMetadata);
  assert.equal(parsed.externalId, officialMetadata.uuid);
  assert.equal(parsed.advertUrl, officialMetadata.state.url);
  assert.equal(parsed.status, 'active');
  assert.equal(parsed.payload.visible_in_profile, 'true');
  assert.equal(parsed.payload.expires_at, officialMetadata.state.ttl);
});

test('maps the complete documented transient lifecycle conservatively', () => {
  for (const status of ['TO_POST', 'TO_PUT', 'TO_DELETE', 'TO_ACTIVATE', 'TO_DEACTIVATE']) {
    assert.equal(mapStoriaStatus(status), 'pending');
  }
  assert.equal(mapStoriaStatus('POSTED'), 'active');
  assert.equal(mapStoriaStatus('PUT'), 'active');
  assert.equal(mapStoriaStatus('REJECTED'), 'rejected');
  assert.equal(mapStoriaStatus('DELETED'), 'deleted');
});

test('a local active flag is never presented as confirmed without a fresh remote check', () => {
  const now = Date.now();
  const unverified = presentStoriaListing({
    status: 'active',
    remote_exists: null,
    last_check_result: 'never',
    last_checked_at: null,
  }, now);
  assert.equal(unverified.status, 'unverified');
  assert.equal(unverified.verified_active, false);

  const verified = {
    status: 'active',
    remote_exists: true,
    last_check_result: 'verified',
    last_checked_at: new Date(now - 60_000).toISOString(),
  };
  assert.equal(listingIsConfirmedActive(verified, now), true);
  assert.equal(presentStoriaListing(verified, now).status, 'active');

  const stale = {
    ...verified,
    last_checked_at: new Date(now - STORIA_STALE_AFTER_MS - 1).toISOString(),
  };
  assert.equal(listingIsConfirmedActive(stale, now), false);
  assert.equal(presentStoriaListing(stale, now).status, 'stale');
});

test('on-demand checks are bounded and skip deleted listings', () => {
  const now = Date.now();
  assert.equal(listingNeedsOnDemandCheck({
    status: 'active',
    external_id: 'uuid',
    last_checked_at: null,
  }, now), true);
  assert.equal(listingNeedsOnDemandCheck({
    status: 'active',
    external_id: 'uuid',
    last_checked_at: new Date(now).toISOString(),
  }, now), false);
  assert.equal(listingNeedsOnDemandCheck({
    status: 'deleted',
    external_id: 'uuid',
    last_checked_at: null,
  }, now), false);
});

test('cron authorization fails closed and uses a timing-safe comparison', async () => {
  const secret = 'a-secure-cron-secret-value';
  assert.equal(verifyCronAuthorization(`Bearer ${secret}`, secret), true);
  assert.equal(verifyCronAuthorization('Bearer wrong', secret), false);
  assert.equal(verifyCronAuthorization(`Bearer ${secret}`, 'short'), false);
  const source = await read('lib/server/cron-auth.mjs');
  assert.match(source, /timingSafeEqual/);
});

test('sync uses official metadata endpoints, safe pagination and durable checks', async () => {
  const [api, service, statusRoute, migration] = await Promise.all([
    read('lib/storia-api.ts'),
    read('lib/server/storia-listing-sync.ts'),
    read('app/api/portals/storia/status/route.ts'),
    read('migrations/20260720_150_storia_listing_sync.sql'),
  ]);
  assert.match(api, /\/advert\/v1\/\$\{safeId\}\/meta/);
  assert.match(api, /let path = '\/advert\/v1\/meta'/);
  assert.match(api, /body\.links\?\.next\?\.href/);
  assert.match(api, /url\.origin !== OLX_API_BASE/);
  assert.doesNotMatch(api, /JSON\.stringify\(body\)\.slice/);

  assert.match(service, /fetchAllAdvertStatuses/);
  assert.match(service, /crm_record_portal_listing_check/);
  assert.match(service, /crm_mark_stale_portal_listings/);
  assert.match(statusRoute, /presentStoriaListing/);
  assert.doesNotMatch(statusRoute, /\.select\('\*'\)/);

  assert.match(migration, /portal_listing_checks/);
  assert.match(migration, /portal_sync_runs/);
  assert.match(migration, /portal_sync_health/);
  assert.match(migration, /last_checked_at/);
  assert.match(migration, /last_sync_at/);
  assert.match(migration, /last_error_code/);
});

test('Vercel cron is daily and secured with CRON_SECRET', async () => {
  const [configText, route] = await Promise.all([
    read('vercel.json'),
    read('app/api/cron/storia-sync/route.ts'),
  ]);
  const config = JSON.parse(configText);
  assert.deepEqual(config.crons, [{
    path: '/api/cron/storia-sync',
    schedule: '17 2 * * *',
  }]);
  assert.match(route, /verifyCronAuthorization/);
  assert.match(route, /process\.env\.CRON_SECRET/);
  assert.match(route, /syncStoriaAgency/);
});

test('publishing rejects incomplete or unsupported Storia mappings before API delivery', async () => {
  const api = await read('lib/storia-api.ts');
  assert.match(api, /spatiu_industrial:/);
  assert.match(api, /urn:concept:offices-for-sale/);
  assert.match(api, /urn:concept:garages-for-sale/);
  assert.match(api, /Categorie\/tranzacție acceptată de Storia/);
  assert.match(api, /Monedă acceptată de Storia \(EUR sau RON\)/);
  assert.match(api, /Coordonate pe hartă \(lat\/lon\)/);
  assert.match(api, /Suprafață teren \(mp\)/);
  assert.match(api, /Număr camere \(obligatoriu pentru OLX\)/);
  assert.match(api, /lat < -90 \|\| lat > 90 \|\| lon < -180 \|\| lon > 180/);
});
