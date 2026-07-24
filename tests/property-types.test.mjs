import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { normalizePropertyWrite } from '../lib/property-form.ts';
import {
  PORTAL_PROPERTY_TYPE_MAP,
  isPropertyFieldRequired,
  isPropertyFieldVisible,
  propertyCategoryFromLabel,
  propertyCategoryLabel,
  propertyCodePrefix,
} from '../lib/property-types.ts';
import {
  buildPropertyFeed,
  evaluatePropertyForFeed,
} from '../lib/property-feed.ts';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const studio = {
  id: '20000000-0000-4000-8000-000000000280',
  internal_code: 'GS-0028',
  title: 'Garsonieră luminoasă în Făgăraș',
  description: 'Garsonieră complet renovată, cu lumină naturală și acces rapid la toate facilitățile importante ale orașului.',
  price: 42000,
  currency: 'EUR',
  category: 'studio_apartment',
  transaction: 'vanzare',
  status: 'activa',
  city: 'Făgăraș',
  county: 'Brașov',
  surface_useful: 31,
  latitude: 45.8416,
  longitude: 24.9731,
  attributes: {
    publicare: { site: true, storia: true },
    nr_camere: 1,
    photos: ['https://cdn.example.test/studio/large.webp'],
  },
};

test('studio apartment uses a stable code and explicit presentation metadata', () => {
  assert.equal(propertyCategoryFromLabel('Garsonieră'), 'studio_apartment');
  assert.equal(propertyCategoryLabel('studio_apartment'), 'Garsonieră');
  assert.equal(propertyCodePrefix('studio_apartment'), 'GS');
  assert.equal(PORTAL_PROPERTY_TYPE_MAP.studio_apartment.storiaFamily, 'apartment');
  assert.equal(PORTAL_PROPERTY_TYPE_MAP.studio_apartment.schemaType, 'Apartment');
});

test('a studio can be saved and exported without becoming a generic one-room apartment', () => {
  const normalized = normalizePropertyWrite(studio, { mode: 'create' });
  assert.deepEqual(normalized.errors, []);
  assert.equal(normalized.columns.category, 'studio_apartment');

  const decision = evaluatePropertyForFeed(studio, 'storia');
  assert.equal(decision.included, true, decision.reasons.join(', '));
  assert.equal(decision.property.category, 'studio_apartment');
  const xml = buildPropertyFeed(
    'storia',
    [decision.property],
    '2026-07-24T12:00:00.000Z',
    'documente@kiraimobiliare.ro',
  );
  assert.match(xml, /urn:concept:apartments-for-sale/);
  assert.match(decision.property.publicUrl, /\/proprietati\/garsoniera-fagaras-gs-0028$/);
});

test('land and apartment forms use the same category rules as backend validation', () => {
  assert.equal(isPropertyFieldVisible('teren', 'surface_useful'), false);
  assert.equal(isPropertyFieldVisible('teren', 'rooms'), false);
  assert.equal(isPropertyFieldRequired('teren', 'surface_land'), true);
  assert.equal(isPropertyFieldVisible('apartament', 'land_details'), false);

  const land = normalizePropertyWrite({
    title: 'Teren intravilan',
    price: 30000,
    category: 'teren',
    transaction: 'vanzare',
    attributes: { sup_teren: 900, teren: { pot: '35', cut: '0.8' } },
  }, { mode: 'create' });
  assert.deepEqual(land.errors, []);

  const apartment = normalizePropertyWrite({
    title: 'Apartament central',
    price: 80000,
    category: 'apartament',
    transaction: 'vanzare',
    attributes: { sup_utila: 62, nr_camere: 3 },
  }, { mode: 'create' });
  assert.deepEqual(apartment.errors, []);
});

test('edit flow preserves hidden legacy values and sends the stable category', async () => {
  const [editor, api] = await Promise.all([
    read('app/properties/[id]/edit/complete/page.tsx'),
    read('app/api/properties/update-full/route.ts'),
  ]);
  assert.match(editor, /category,/);
  assert.match(editor, /Valorile istorice din câmpurile ascunse rămân păstrate/);
  assert.match(editor, /teren:\s*\{/);
  assert.match(editor, /comercial:\s*\{/);
  assert.match(api, /\.\.\.oldAttributes/);
  assert.match(api, /record\(oldAttributes\.teren\)/);
  assert.match(api, /record\(oldAttributes\.comercial\)/);
});
