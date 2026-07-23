import type { Page, Route } from '@playwright/test';
import { TEST_ACCESS_TOKEN, TEST_USER } from './mock-crm';

const IDS = {
  property: '10000000-0000-4000-8000-000000000001',
  listing: '10000000-0000-4000-8000-000000000002',
  lead: '10000000-0000-4000-8000-000000000003',
  contact: '10000000-0000-4000-8000-000000000004',
  demand: '10000000-0000-4000-8000-000000000005',
  viewing: '10000000-0000-4000-8000-000000000006',
  transaction: '10000000-0000-4000-8000-000000000007',
  removal: '10000000-0000-4000-8000-000000000008',
};

export type OperationalWorkflowState = {
  propertyStatus: string | null;
  listingStatus: string | null;
  leadStatus: string | null;
  whatsAppConfirmed: boolean;
  contactCreated: boolean;
  demandCreated: boolean;
  viewingCreated: boolean;
  transactionStatus: string | null;
  removalStatus: string | null;
};

const response = (route: Route, body: unknown, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

const body = (route: Route) => route.request().postDataJSON() as Record<string, unknown>;

function authorized(route: Route) {
  if (route.request().headers().authorization === `Bearer ${TEST_ACCESS_TOKEN}`) return true;
  void response(route, { error: 'Unauthorized synthetic request' }, 401);
  return false;
}

function requireState(route: Route, condition: boolean, message: string) {
  if (condition) return true;
  void response(route, { error: message }, 409);
  return false;
}

export async function mockOperationalWorkflow(page: Page) {
  const state: OperationalWorkflowState = {
    propertyStatus: null,
    listingStatus: null,
    leadStatus: null,
    whatsAppConfirmed: false,
    contactCreated: false,
    demandCreated: false,
    viewingCreated: false,
    transactionStatus: null,
    removalStatus: null,
  };

  await page.route('**/api/properties/create', (route) => {
    if (!authorized(route)) return;
    const request = body(route);
    const propertyData = request.propertyData as Record<string, unknown> | undefined;
    if (!propertyData?.title) return response(route, { error: 'Date lipsa' }, 400);
    state.propertyStatus = String(propertyData.status || 'activa');
    return response(route, {
      property_id: IDS.property,
      agency_id: '00000000-0000-4000-8000-000000000011',
      status: state.propertyStatus,
      matching: { evaluated: 0, matched: 0 },
    }, 201);
  });

  await page.route('**/api/portals/storia/publish', (route) => {
    if (!authorized(route)) return;
    const request = body(route);
    if (!requireState(
      route,
      state.propertyStatus === 'activa' && request.property_id === IDS.property,
      'Property must exist before publication',
    )) return;
    state.listingStatus = 'active';
    return response(route, {
      success: true,
      method: 'POST',
      external_id: 'storia-synthetic-uuid',
      portal_ad_id: '987654321',
      advert_url: 'https://www.storia.ro/ro/oferta/test-ID987654321.html',
      status: state.listingStatus,
    });
  });

  await page.route('**/api/portals/storia/webhook', (route) => {
    const request = body(route);
    if (!requireState(
      route,
      state.listingStatus === 'active'
        && request.transaction_id === 'storia-message-1'
        && (request.data as Record<string, unknown> | undefined)?.ad_id === '987654321',
      'Published listing is required before lead ingestion',
    )) return;
    state.leadStatus = 'new';
    return response(route, {
      accepted: true,
      outcome: 'created',
      lead_id: IDS.lead,
      property_id: IDS.property,
      agent_id: TEST_USER.id,
    }, 202);
  });

  await page.route('**/api/leads/whatsapp', (route) => {
    if (!authorized(route)) return;
    const request = body(route);
    if (!requireState(
      route,
      state.leadStatus === 'new'
        && request.lead_id === IDS.lead
        && request.action === 'confirmed_sent',
      'Lead must exist before WhatsApp confirmation',
    )) return;
    state.whatsAppConfirmed = true;
    state.leadStatus = 'contacted';
    return response(route, {
      action: 'confirmed_sent',
      lead_id: IDS.lead,
      property_share_warning: null,
    });
  });

  await page.route('**/api/contacts', (route) => {
    if (!authorized(route)) return;
    const request = body(route);
    if (!requireState(route, state.whatsAppConfirmed && Boolean(request.name), 'Contact requires a confirmed lead')) return;
    state.contactCreated = true;
    return response(route, {
      contact: {
        id: IDS.contact,
        name: request.name,
        phone: request.phone,
        email: request.email,
        agent_id: TEST_USER.id,
        source: 'storia',
      },
      deduped: false,
    }, 201);
  });

  await page.route('**/api/demands/create', (route) => {
    if (!authorized(route)) return;
    const request = body(route);
    if (!requireState(
      route,
      state.contactCreated && request.contact_id === IDS.contact,
      'Demand requires the linked contact',
    )) return;
    state.demandCreated = true;
    return response(route, {
      demand: { id: IDS.demand, internal_code: 'CE-E2E-0001', ...request },
    }, 201);
  });

  await page.route('**/api/viewings', (route) => {
    if (!authorized(route)) return;
    const request = body(route);
    if (!requireState(
      route,
      state.demandCreated
        && request.contact_id === IDS.contact
        && request.property_id === IDS.property,
      'Viewing requires the demand, contact and property',
    )) return;
    state.viewingCreated = true;
    return response(route, {
      viewing: { id: IDS.viewing, status: 'programata', ...request },
    }, 201);
  });

  await page.route('**/api/transactions', (route) => {
    if (!authorized(route)) return;
    const request = body(route);
    if (route.request().method() === 'POST') {
      if (!requireState(
        route,
        state.viewingCreated
          && request.contact_id === IDS.contact
          && request.property_id === IDS.property,
        'Transaction requires the completed operational links',
      )) return;
      state.transactionStatus = 'draft';
      return response(route, {
        transaction: { id: IDS.transaction, status: state.transactionStatus, ...request },
      }, 201);
    }

    if (route.request().method() === 'PATCH') {
      if (!requireState(route, request.id === IDS.transaction, 'Transaction does not exist')) return;
      if (request.status === 'oferta' && state.transactionStatus === 'draft') {
        state.transactionStatus = 'oferta';
        return response(route, {
          transaction: { id: IDS.transaction, status: state.transactionStatus },
        });
      }
      if (request.status === 'finalizata' && state.transactionStatus === 'oferta') {
        state.transactionStatus = 'finalizata';
        state.propertyStatus = 'tranzactionata';
        state.listingStatus = 'pending_removal';
        state.removalStatus = 'pending';
        return response(route, {
          transaction: { id: IDS.transaction, status: state.transactionStatus },
          finalization: {
            property_status: state.propertyStatus,
            financial_entries: 2,
            removal_jobs: 1,
          },
          removal_deliveries: [{ id: IDS.removal, portal: 'storia', status: 'retry' }],
        });
      }
    }
    return response(route, { error: 'Invalid synthetic transaction transition' }, 409);
  });

  await page.route('**/api/transactions/removals', (route) => {
    if (!authorized(route)) return;
    const request = body(route);
    if (!requireState(
      route,
      state.removalStatus === 'pending' && request.transaction_id === IDS.transaction,
      'Removal job is not ready',
    )) return;
    state.removalStatus = 'confirmed';
    state.listingStatus = 'deleted';
    return response(route, {
      deliveries: [{ id: IDS.removal, portal: 'storia', status: 'confirmed' }],
    });
  });

  return { state, ids: IDS };
}
