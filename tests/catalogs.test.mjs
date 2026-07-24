import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ACTIVITY_TYPES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  LEAD_STATUS_TAB_GROUPS,
  LEAD_STATUS_TRANSITIONS,
  PROPERTY_STATUSES,
  PROPERTY_STATUS_TRANSITIONS,
  TRANSACTION_STATUSES,
  VIEWING_STATUSES,
  canTransition,
  isLeadStatus,
  isPropertyStatus,
  leadSourceLabel,
  normalizeCatalogKey,
  normalizeLeadSource,
} from '../lib/crm-catalogs.ts';

test('historical source spellings collapse to controlled source codes', () => {
  assert.equal(normalizeLeadSource('Storia'), 'storia');
  assert.equal(normalizeLeadSource('storia.ro'), 'storia');
  assert.equal(normalizeLeadSource('OLX.ro'), 'olx');
  assert.equal(normalizeLeadSource('Storia.ro + Olx.ro'), 'storia_olx');
  assert.equal(normalizeLeadSource('Prieteni/Cunostinte'), 'referral');
  assert.equal(normalizeLeadSource('referral'), 'referral');
  assert.equal(normalizeLeadSource('evaluation'), 'evaluation');
  assert.equal(normalizeLeadSource('direct'), 'direct');
  assert.equal(normalizeLeadSource('Website'), 'website');
  assert.equal(normalizeLeadSource('lead'), 'manual');
  assert.equal(normalizeLeadSource('canal istoric necunoscut'), 'other');
  assert.equal(normalizeLeadSource(null), null);
  assert.equal(leadSourceLabel('storia_olx'), 'Storia.ro + OLX.ro');
});

test('catalog key normalization is case, punctuation and diacritic insensitive', () => {
  assert.equal(normalizeCatalogKey('  Închiriată  '), 'inchiriata');
  assert.equal(normalizeCatalogKey('Prieteni/Cunoștințe'), 'prieteni_cunostinte');
});

test('catalogs contain unique stable codes and required presentation metadata', () => {
  for (const catalog of [LEAD_STATUSES, PROPERTY_STATUSES, VIEWING_STATUSES, TRANSACTION_STATUSES]) {
    assert.equal(new Set(catalog.map((entry) => entry.code)).size, catalog.length);
    for (const entry of catalog) {
      assert.ok(entry.code);
      assert.ok(entry.label);
      assert.ok(entry.order > 0);
      assert.ok(entry.category);
      assert.ok(entry.color);
      assert.equal(typeof entry.active, 'boolean');
    }
  }
  assert.equal(new Set(LEAD_SOURCES.map((entry) => entry.code)).size, LEAD_SOURCES.length);
  assert.equal(new Set(ACTIVITY_TYPES.map((entry) => entry.code)).size, ACTIVITY_TYPES.length);
});

test('invalid lead and property transitions are rejected by the shared policy', () => {
  assert.equal(canTransition(LEAD_STATUS_TRANSITIONS, 'new', 'contacted'), true);
  assert.equal(canTransition(LEAD_STATUS_TRANSITIONS, 'new', 'won'), false);
  assert.equal(canTransition(LEAD_STATUS_TRANSITIONS, 'lost', 'in_progress'), true);
  assert.equal(canTransition(PROPERTY_STATUS_TRANSITIONS, 'draft', 'activa'), true);
  assert.equal(canTransition(PROPERTY_STATUS_TRANSITIONS, 'draft', 'tranzactionata'), false);
  assert.equal(isLeadStatus('replied'), false);
  assert.equal(isPropertyStatus('arhivata'), true);
});

test('all lead statuses stay visible in exactly one client tab category', () => {
  for (const status of LEAD_STATUSES) {
    const occurrences = Object.values(LEAD_STATUS_TAB_GROUPS).filter((statuses) => statuses.includes(status.code)).length;
    assert.equal(occurrences, 1, `${status.code} must be visible in exactly one tab`);
  }
});

test('database migration seeds every code exposed by the application catalogs', () => {
  const migration = [
    '../migrations/20260720_070_status_source_catalogs.sql',
    '../migrations/20260724_250_factual_contact_interactions.sql',
  ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');
  for (const catalog of [LEAD_STATUSES, PROPERTY_STATUSES, VIEWING_STATUSES, TRANSACTION_STATUSES, LEAD_SOURCES, ACTIVITY_TYPES]) {
    for (const entry of catalog) {
      assert.ok(migration.includes(`('${entry.code}',`), `${entry.code} is missing from the SQL catalog seed`);
    }
  }
  for (const [from, targets] of Object.entries(LEAD_STATUS_TRANSITIONS)) {
    for (const to of targets) assert.ok(migration.includes(`('lead','${from}','${to}')`));
  }
  for (const [from, targets] of Object.entries(PROPERTY_STATUS_TRANSITIONS)) {
    for (const to of targets) assert.ok(migration.includes(`('property','${from}','${to}')`));
  }
});
