import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createFeedToken, hashFeedToken } from '../lib/feed-token.ts';
import {
  buildPropertyFeed,
  evaluatePropertyForFeed,
  normalizeFeedProperty,
  validatePropertyFeedXml,
} from '../lib/property-feed.ts';

const property = {
  id: '20000000-0000-4000-8000-000000000099',
  internal_code: 'KIRA-101',
  title: 'Apartament luminos in Fagaras',
  description: 'Apartament luminos, complet renovat, cu pozitie centrala si acces rapid la toate facilitatile orasului.',
  price: 85000,
  currency: 'EUR',
  category: 'apartament',
  transaction: 'vanzare',
  status: 'activa',
  city: 'Fagaras',
  county: 'Brasov',
  zone: 'Centru',
  street: 'Strada Secreta',
  street_number: '12',
  surface_useful: 72,
  surface_built: 80,
  latitude: 45.8416,
  longitude: 24.9731,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-02T00:00:00.000Z',
  attributes: {
    publicare: { site: true, storia: true },
    ascunde_adresa: true,
    nr_camere: 3,
    nr_bai: 1,
    etaj: '2',
    photos: ['https://cdn.example.test/a/medium.webp'],
  },
};

const generatedAt = '2026-07-20T12:00:00.000Z';

test('feed tokens are random and only their SHA-256 hash needs storage', () => {
  const first = createFeedToken();
  const second = createFeedToken();
  assert.match(first.token, /^kira_feed_[A-Za-z0-9_-]{43}$/);
  assert.match(first.tokenHash, /^[a-f0-9]{64}$/);
  assert.equal(first.tokenHash, hashFeedToken(first.token));
  assert.notEqual(first.token, second.token);
  assert.equal(first.tokenPrefix.includes(first.token), false);
  assert.equal(hashFeedToken('invalid'), '');
});

test('generic XML matches the protected-address snapshot and contains only the public site URL', () => {
  const decision = evaluatePropertyForFeed(property, 'generic');
  assert.equal(decision.included, true);
  const xml = `${buildPropertyFeed('generic', [decision.property], generatedAt)}\n`;
  const snapshot = readFileSync(new URL('./snapshots/feed-generic.xml', import.meta.url), 'utf8');
  assert.equal(xml, snapshot);
  assert.equal(xml.includes('Strada Secreta'), false);
  assert.equal(xml.includes('<street_number>'), false);
  assert.equal(xml.includes(property.id), false);
  assert.equal(xml.includes('crm.kiraimobiliare.ro'), false);
  assert.match(xml, /https:\/\/www\.kiraimobiliare\.ro\/proprietati\//);
  assert.deepEqual(validatePropertyFeedXml(xml.trim(), 'generic'), []);
});

test('Storia XML matches the official root/header structure snapshot', () => {
  const decision = evaluatePropertyForFeed(property, 'storia');
  assert.equal(decision.included, true);
  const xml = `${buildPropertyFeed('storia', [decision.property], generatedAt, 'agentie@example.ro')}\n`;
  const snapshot = readFileSync(new URL('./snapshots/feed-storia.xml', import.meta.url), 'utf8');
  assert.equal(xml, snapshot);
  assert.match(xml, /<site_urn>urn:site:storiaro<\/site_urn>/);
  assert.match(xml, /<custom_fields><id>KIRA-101<\/id>/);
  assert.equal(xml.includes(property.id), false);
  assert.deepEqual(validatePropertyFeedXml(xml.trim(), 'storia'), []);
});

test('inactive, unselected, incomplete and sold properties are excluded with explicit reasons', () => {
  assert.deepEqual(evaluatePropertyForFeed({ ...property, status: 'tranzactionata' }, 'generic').reasons, ['status_tranzactionata']);
  const unselected = evaluatePropertyForFeed({ ...property, attributes: { ...property.attributes, publicare: { site: false } } }, 'generic');
  assert.deepEqual(unselected.reasons, ['not_selected_for_site']);
  const incomplete = evaluatePropertyForFeed({ ...property, description: '', price: 0, attributes: { publicare: { site: true }, photos: [] } }, 'generic');
  assert.ok(incomplete.reasons.includes('missing_description'));
  assert.ok(incomplete.reasons.includes('invalid_price'));
  assert.ok(incomplete.reasons.includes('missing_photos'));
});

test('surfaces use top-level columns first and legacy attributes as controlled fallback', () => {
  const normalized = normalizeFeedProperty({
    ...property,
    surface_useful: null,
    surface_built: null,
    surface_land: null,
    attributes: {
      ...property.attributes,
      sup_utila: '71.5',
      sup_construita: '79',
      sup_teren: '350',
    },
  }, 'generic');
  assert.equal(normalized.usefulArea, 71.5);
  assert.equal(normalized.builtArea, 79);
  assert.equal(normalized.landArea, 350);
});

test('Storia rejects unsupported taxonomy/currency and out-of-range coordinates before export', () => {
  const invalid = evaluatePropertyForFeed({
    ...property,
    category: 'castel_necunoscut',
    currency: 'GBP',
    latitude: 120,
  }, 'storia');
  assert.ok(invalid.reasons.includes('unsupported_category'));
  assert.ok(invalid.reasons.includes('unsupported_currency'));
  assert.ok(invalid.reasons.includes('invalid_coordinates'));
});

test('the validators reject malformed XML, internal CRM links and internal UUID identifiers', () => {
  assert.ok(validatePropertyFeedXml('<?xml version="1.0" encoding="UTF-8"?><properties portal="generic" count="1" generated="x"><id>x</properties>', 'generic').length > 0);
  assert.ok(validatePropertyFeedXml('<?xml version="1.0" encoding="UTF-8"?><properties portal="generic" count="1" generated="x"><url>https://crm.kiraimobiliare.ro/properties/x</url></properties>', 'generic').includes('internal_crm_url_exposed'));
  assert.ok(validatePropertyFeedXml('<?xml version="1.0" encoding="UTF-8"?><properties portal="generic" count="1" generated="x"><id>20000000-0000-4000-8000-000000000099</id></properties>', 'generic').includes('internal_uuid_exposed'));
});
