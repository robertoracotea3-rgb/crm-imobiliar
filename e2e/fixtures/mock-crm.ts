import type { Page, Route } from '@playwright/test';

export const TEST_USER = {
  id: '00000000-0000-4000-8000-000000000022',
  username: 'E2E_AGENT',
  email: 'e2e_agent@fortis.crm',
  password: 'e2e-password-only',
};

const base64Url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
export const TEST_ACCESS_TOKEN = [
  base64Url({ alg: 'HS256', typ: 'JWT' }),
  base64Url({
    sub: TEST_USER.id,
    email: TEST_USER.email,
    role: 'authenticated',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3_600,
  }),
  'synthetic-e2e-signature',
].join('.');

const authUser = {
  id: TEST_USER.id,
  aud: 'authenticated',
  role: 'authenticated',
  email: TEST_USER.email,
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  created_at: '2026-07-23T00:00:00.000Z',
};

const json = (route: Route, body: unknown, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

export const dashboardFixture = {
  user: { name: 'Agent E2E', role: 'owner' },
  scope: 'agency',
  period: '30d',
  generated_at: '2026-07-23T09:00:00.000Z',
  kpis: {
    new_leads: 4,
    uncontacted_leads: 1,
    average_response_minutes: 12,
    viewings: 3,
    offers: 2,
    reservations: 1,
    transactions: 1,
    active_properties: 8,
    expired_properties: 0,
    listing_errors: 0,
    open_tasks: 2,
    overdue_tasks: 0,
    followups: 1,
    leads_without_next_action: 0,
    conversion_rate: 25,
  },
  revenue_by_currency: [{ currency: 'EUR', amount: 3_000 }],
  estimated_commission_by_currency: [{ currency: 'EUR', amount: 4_500 }],
  lead_sources: [{ source: 'storia', count: 3 }, { source: 'site', count: 1 }],
  portal_performance: [],
  agent_performance: [],
  definitions: new Proxy({}, { get: () => 'Definiție verificabilă pentru test.' }),
  notifications: [],
};

export async function mockCrmBackend(page: Page) {
  await page.route('**/auth/v1/token**', async (route) => {
    const credentials = route.request().postDataJSON() as { email?: string; password?: string };
    if (credentials.email !== TEST_USER.email || credentials.password !== TEST_USER.password) {
      await json(route, { code: 'invalid_credentials', message: 'Invalid login credentials' }, 400);
      return;
    }
    await json(route, {
      access_token: TEST_ACCESS_TOKEN,
      token_type: 'bearer',
      expires_in: 3_600,
      expires_at: Math.floor(Date.now() / 1000) + 3_600,
      refresh_token: 'synthetic-e2e-refresh-token',
      user: authUser,
    });
  });

  await page.route('**/auth/v1/user**', (route) => json(route, authUser));
  await page.route('**/rest/v1/profiles**', (route) => json(route, {
    agency_id: '00000000-0000-4000-8000-000000000011',
    role: 'owner',
    permissions: {},
    status: 'active',
    agencies: { id: '00000000-0000-4000-8000-000000000011', name: 'Agenție E2E' },
  }));
  await page.route('**/api/dashboard/overview**', (route) => {
    const plainFixture = {
      ...dashboardFixture,
      definitions: Object.fromEntries([
        'new_leads', 'uncontacted_leads', 'average_response_minutes', 'viewings',
        'offers', 'reservations', 'transactions', 'active_properties',
        'expired_properties', 'listing_errors', 'open_tasks', 'overdue_tasks',
        'followups', 'leads_without_next_action', 'conversion_rate', 'revenue',
        'estimated_commission',
      ].map((key) => [key, `Definiție verificabilă: ${key}`])),
    };
    return json(route, plainFixture);
  });
}

export async function waitForLoginReady(page: Page) {
  await page.getByRole('button', { name: 'Logare' }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const button = document.querySelector<HTMLButtonElement>('button[type="submit"]');
    return Boolean(button && !button.disabled);
  });
}
