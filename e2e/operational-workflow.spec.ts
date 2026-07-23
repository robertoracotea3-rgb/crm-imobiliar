import { expect, test } from '@playwright/test';
import {
  mockCrmBackend,
  TEST_ACCESS_TOKEN,
  TEST_USER,
  waitForLoginReady,
} from './fixtures/mock-crm';
import { mockOperationalWorkflow } from './fixtures/mock-operational-workflow';

test('synthetic property-to-removal journey preserves every operational link', async ({ page }) => {
  await mockCrmBackend(page);
  const workflow = await mockOperationalWorkflow(page);

  await page.goto('/login');
  await waitForLoginReady(page);
  await page.getByLabel('Nume utilizator').fill(TEST_USER.username);
  await page.getByLabel('Parola').fill(TEST_USER.password);
  await page.getByRole('button', { name: 'Logare' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const result = await page.evaluate(async ({ token, ids }) => {
    const jsonRequest = async (
      url: string,
      method: 'POST' | 'PATCH',
      requestBody: Record<string, unknown>,
      authenticated = true,
    ) => {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(authenticated ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(requestBody),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(`${url} failed with ${response.status}: ${JSON.stringify(payload)}`);
      }
      return payload;
    };

    const property = await jsonRequest('/api/properties/create', 'POST', {
      propertyData: {
        title: 'Apartament exclusiv pentru test automat',
        status: 'activa',
        category: 'apartament',
        transaction: 'vanzare',
        price: 100_000,
      },
    });
    const publication = await jsonRequest('/api/portals/storia/publish', 'POST', {
      property_id: property.property_id,
    });
    const lead = await jsonRequest('/api/portals/storia/webhook', 'POST', {
      object_id: 'message-object-1',
      transaction_id: 'storia-message-1',
      data: {
        ad_id: publication.portal_ad_id,
        sender_name: 'Client E2E',
        sender_phone: '0722123456',
      },
    }, false);
    const whatsApp = await jsonRequest('/api/leads/whatsapp', 'POST', {
      lead_id: lead.lead_id,
      action: 'confirmed_sent',
      property_id: property.property_id,
      share_idempotency_key: 'e2e-share-1',
      next_action_at: '2026-07-24T10:00:00.000Z',
    });
    const contact = await jsonRequest('/api/contacts', 'POST', {
      name: 'Client E2E',
      phone: '0722123456',
      email: 'client.e2e@example.invalid',
      source: 'storia',
    });
    const demand = await jsonRequest('/api/demands/create', 'POST', {
      contact_id: contact.contact.id,
      agent_id: ids.agent,
      intent: 'cumparare',
      property_types: ['apartament'],
      budget_min: 80_000,
      budget_max: 120_000,
      currency: 'EUR',
      cities: ['Făgăraș'],
    });
    const viewing = await jsonRequest('/api/viewings', 'POST', {
      lead_id: lead.lead_id,
      contact_id: contact.contact.id,
      property_id: property.property_id,
      agent_id: ids.agent,
      start_at: '2026-07-24T12:00:00.000Z',
      duration_minutes: 60,
    });
    const transaction = await jsonRequest('/api/transactions', 'POST', {
      lead_id: lead.lead_id,
      contact_id: contact.contact.id,
      property_id: property.property_id,
      agent_id: ids.agent,
      type: 'vanzare',
      currency: 'EUR',
      sale_price: 100_000,
      agency_commission: 3_000,
      agent_commission: 1_000,
    });
    const offer = await jsonRequest('/api/transactions', 'PATCH', {
      id: transaction.transaction.id,
      status: 'oferta',
    });
    const finalized = await jsonRequest('/api/transactions', 'PATCH', {
      id: transaction.transaction.id,
      status: 'finalizata',
    });
    const removal = await jsonRequest('/api/transactions/removals', 'POST', {
      transaction_id: transaction.transaction.id,
    });

    return {
      property,
      publication,
      lead,
      whatsApp,
      contact,
      demand,
      viewing,
      offer,
      finalized,
      removal,
    };
  }, {
    token: TEST_ACCESS_TOKEN,
    ids: { ...workflow.ids, agent: TEST_USER.id },
  });

  expect(result.property.status).toBe('activa');
  expect(result.publication.status).toBe('active');
  expect(result.lead.property_id).toBe(workflow.ids.property);
  expect(result.lead.agent_id).toBe(TEST_USER.id);
  expect(result.whatsApp.action).toBe('confirmed_sent');
  expect(result.demand.demand.contact_id).toBe(workflow.ids.contact);
  expect(result.viewing.viewing.property_id).toBe(workflow.ids.property);
  expect(result.offer.transaction.status).toBe('oferta');
  expect(result.finalized.finalization.financial_entries).toBe(2);
  expect(result.removal.deliveries[0].status).toBe('confirmed');
  expect(workflow.state).toEqual({
    propertyStatus: 'tranzactionata',
    listingStatus: 'deleted',
    leadStatus: 'contacted',
    whatsAppConfirmed: true,
    contactCreated: true,
    demandCreated: true,
    viewingCreated: true,
    transactionStatus: 'finalizata',
    removalStatus: 'confirmed',
  });
});
