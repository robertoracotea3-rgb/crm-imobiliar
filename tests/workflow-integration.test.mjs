import assert from 'node:assert/strict';
import test from 'node:test';

import { compareClientIdentities } from '../lib/client-identity.ts';
import { calculatePropertyCommission } from '../lib/commission.ts';
import {
  TRANSACTION_STATUS_TRANSITIONS,
  canTransition,
} from '../lib/crm-catalogs.ts';
import { normalizeDemandRecord } from '../lib/demand-record.ts';
import { scoreMatch } from '../lib/match-score.ts';
import { createPageWindow, paginationMetadata } from '../lib/pagination.ts';
import {
  buildPropertyFeed,
  evaluatePropertyForFeed,
  validatePropertyFeedXml,
} from '../lib/property-feed.ts';
import {
  buildStoriaAdvertLookupPlan,
} from '../lib/server/storia-ad-identity.mjs';
import { buildAssociatedStoriaLeadRecord } from '../lib/server/storia-lead-record.mjs';
import {
  createOAuthState,
  hashOAuthState,
  isValidOAuthState,
} from '../lib/server/portal-token-crypto.mjs';
import {
  computeOlxWebhookSignature,
  verifyOlxWebhookSignature,
} from '../lib/server/storia-webhook-signature.mjs';
import { nextRemovalAttempt } from '../lib/transactions.ts';
import { normalizeViewingRequest } from '../lib/viewings.ts';

const agencyId = '00000000-0000-4000-8000-000000000011';
const agentId = '00000000-0000-4000-8000-000000000022';
const propertyId = '00000000-0000-4000-8000-000000000033';
const listingId = '00000000-0000-4000-8000-000000000044';
const contactId = '00000000-0000-4000-8000-000000000055';

test('integration: signed Storia webhook becomes a property- and agent-linked lead draft', () => {
  const transactionId = 'storia-event-e2e-1';
  const objectId = 'message-object-1';
  const secret = 'synthetic-test-secret';
  const signature = computeOlxWebhookSignature({ objectId, transactionId, secret });
  assert.deepEqual(
    verifyOlxWebhookSignature({ signature, objectId, transactionId, secret }),
    { ok: true, reason: null },
  );

  const input = {
    ad_id: 987654321,
    conversation_id: 'conversation-22',
    sender_name: 'Client Test',
    sender_email: 'client.test@example.invalid',
    sender_phone: '0722 123 456',
    message: 'Doresc o vizionare.',
    from: 'Storia',
  };
  assert.deepEqual(buildStoriaAdvertLookupPlan(input)[0], {
    kind: 'portal_ad_id',
    value: '987654321',
  });

  const record = buildAssociatedStoriaLeadRecord(input, {
    agencyId,
    propertyId,
    portalListingId: listingId,
    portalAdId: '987654321',
    responsibleAgentId: agentId,
    city: 'Făgăraș',
    county: 'Brașov',
    category: 'apartament',
    title: 'Apartament test',
    publicCode: 'KIRA-TEST-33',
    publicUrl: 'https://www.kiraimobiliare.ro/proprietati/apartament-fagaras-kira-test-33',
    mainPhotoUrl: 'https://cdn.example.invalid/property-cover.webp',
    price: 92_000,
    currency: 'EUR',
  }, transactionId, '2026-07-23T09:00:00.000Z');

  assert.equal(record.agency_id, agencyId);
  assert.equal(record.property_id, propertyId);
  assert.equal(record.agent_id, agentId);
  assert.equal(record.webhook_transaction_id, transactionId);
  assert.equal(record.portal_ad_id, '987654321');
  assert.equal(record.property_public_code, 'KIRA-TEST-33');
  assert.equal(record.property_price, 92_000);
  assert.equal(record.responsible_agent_id, agentId);
  assert.equal(record.assigned_at, '2026-07-23T09:00:00.000Z');
  assert.equal(record.first_contact_due_at, '2026-07-24T09:00:00.000Z');
  assert.equal(record.lead_assignment_status, 'assigned');
  assert.equal(record.next_action_at, '2026-07-23T09:15:00.000Z');
});

test('integration: a Storia lead for an unassigned property stays visible for owner allocation', () => {
  const record = buildAssociatedStoriaLeadRecord({
    ad_id: '987654322',
    sender_name: 'Client fără agent',
    message: 'Doresc detalii.',
    from: 'Storia',
  }, {
    agencyId,
    propertyId,
    portalListingId: listingId,
    portalAdId: '987654322',
    responsibleAgentId: null,
    city: 'Făgăraș',
    county: 'Brașov',
    category: 'apartament',
    title: 'Apartament fără agent',
    publicCode: 'KIRA-UNASSIGNED',
    publicUrl: 'https://www.kiraimobiliare.ro/proprietati/apartament-fagaras-kira-unassigned',
    mainPhotoUrl: null,
    price: 75_000,
    currency: 'EUR',
  }, 'storia-event-unassigned', '2026-07-23T09:00:00.000Z');

  assert.equal(record.agent_id, null);
  assert.equal(record.responsible_agent_id, null);
  assert.equal(record.assigned_at, null);
  assert.equal(record.first_contact_due_at, null);
  assert.equal(record.lead_assignment_status, 'pending_owner');
  assert.equal(record.property_public_code, 'KIRA-UNASSIGNED');
});

test('integration: linked lead identity becomes one client demand and a deterministic match', () => {
  const identity = compareClientIdentities(
    { phone: '0722 123 456', email: 'client.test@example.invalid' },
    { phone: '+40 722 123 456', email: 'CLIENT.TEST@example.invalid' },
  );
  assert.equal(identity.safe, true);

  const demand = normalizeDemandRecord({
    contact_id: contactId,
    agent_id: agentId,
    intent: 'cumparare',
    property_types: ['apartament'],
    budget_min: 80_000,
    budget_max: 100_000,
    currency: 'EUR',
    counties: ['Brașov'],
    cities: ['Făgăraș'],
    rooms_min: 3,
    parking_required: true,
    source: 'storia',
  });
  assert.equal(demand.contact_id, contactId);
  assert.equal(demand.transaction, 'vanzare');

  const match = scoreMatch({
    category: 'apartament',
    transaction: 'vanzare',
    city: 'Fagaras',
    county: 'Brasov',
    price: 92_000,
    currency: 'EUR',
    surface_useful: 72,
    attributes: { nr_camere: 3, nr_parcare: 1 },
  }, demand);
  assert.equal(match.eligible, true);
  assert.equal(match.price_difference, 0);
  assert.ok(match.score > 0);
});

test('integration: a viewing request keeps every operational relationship and reminder', () => {
  const viewingInput = {
    lead_id: '00000000-0000-4000-8000-000000000066',
    contact_id: contactId,
    property_id: propertyId,
    agent_id: agentId,
    start_at: '2026-07-24T10:00:00.000Z',
    duration_minutes: 90,
    location: 'Făgăraș, Centru',
    participants: ['Client Test', 'Agent Test', 'Client Test'],
    reminder_at: '2026-07-24T09:00:00.000Z',
  };
  const viewing = normalizeViewingRequest(viewingInput, '2026-07-23T09:00:00.000Z');

  assert.equal(viewing.contactId, contactId);
  assert.equal(viewing.propertyId, propertyId);
  assert.equal(viewing.agentId, agentId);
  assert.equal(viewing.durationMinutes, 90);
  assert.deepEqual(viewing.participants, ['Client Test', 'Agent Test']);
  assert.throws(
    () => normalizeViewingRequest(
      { ...viewingInput, start_at: '2026-07-22T10:00:00.000Z' },
      '2026-07-23T09:00:00.000Z',
    ),
    /viewing_must_be_future/,
  );
});

test('integration: offer can finalize with exact commission and a bounded portal retry', () => {
  assert.equal(canTransition(TRANSACTION_STATUS_TRANSITIONS, 'oferta', 'rezervata'), true);
  assert.equal(canTransition(TRANSACTION_STATUS_TRANSITIONS, 'rezervata', 'finalizata'), true);

  const commission = calculatePropertyCommission({
    price: 100_000,
    currency: 'EUR',
    attributes: { comision_prop_pct: 2.5, comision_chir_pct: 1 },
  });
  assert.deepEqual(
    { agency: commission.total, agent: commission.counterparty },
    { agency: 3_500, agent: 1_000 },
  );
  assert.equal(
    nextRemovalAttempt(1, Date.parse('2026-07-23T09:00:00.000Z')),
    '2026-07-23T09:05:00.000Z',
  );
});

test('integration: selected property produces valid public XML and an OAuth state remains opaque', () => {
  const property = {
    id: propertyId,
    internal_code: 'KIRA-E2E-1',
    title: 'Apartament test Făgăraș',
    description: 'Descriere suficientă pentru proprietatea folosită exclusiv în testul automat.',
    price: 92_000,
    currency: 'EUR',
    category: 'apartament',
    transaction: 'vanzare',
    status: 'activa',
    city: 'Făgăraș',
    county: 'Brașov',
    surface_useful: 72,
    latitude: 45.8416,
    longitude: 24.9731,
    attributes: {
      publicare: { site: true, storia: true },
      ascunde_adresa: true,
      nr_camere: 3,
      photos: ['https://cdn.example.invalid/property.webp'],
    },
  };
  const decision = evaluatePropertyForFeed(property, 'storia');
  assert.equal(decision.included, true);
  const xml = buildPropertyFeed(
    'storia',
    [decision.property],
    '2026-07-23T09:00:00.000Z',
    'agentie@example.invalid',
  );
  assert.deepEqual(validatePropertyFeedXml(xml, 'storia'), []);
  assert.equal(xml.includes('crm.kiraimobiliare.ro'), false);
  assert.equal(xml.includes(propertyId), false);

  const state = createOAuthState();
  assert.equal(isValidOAuthState(state), true);
  assert.match(hashOAuthState(state), /^[a-f0-9]{64}$/);
  assert.equal(hashOAuthState(state).includes(state), false);
});

test('integration: pagination caps abusive input and calculates an exact last page', () => {
  const window = createPageWindow('3', '500', { maxPageSize: 50 });
  assert.deepEqual(window, { page: 3, pageSize: 50, from: 100, to: 149 });
  assert.deepEqual(paginationMetadata(121, window), {
    page: 3,
    page_size: 50,
    total: 121,
    pages: 3,
  });
  assert.deepEqual(createPageWindow('-2', 'invalid'), {
    page: 1,
    pageSize: 25,
    from: 0,
    to: 24,
  });
});
