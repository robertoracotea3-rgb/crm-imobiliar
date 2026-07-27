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
    session_id: '00000000-0000-4000-8000-000000000033',
    aal: 'aal2',
    iat: Math.floor(Date.now() / 1000),
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
  contact_sla: {
    new_requests: 4,
    assigned: 4,
    contacted_on_time: 3,
    contacted_late: 0,
    uncontacted: 1,
    average_first_contact_minutes: 12,
    due_today: 1,
    overdue: 0,
    missing_description: 0,
    missing_next_action: 0,
    sla_percent: 75,
  },
  definitions: new Proxy({}, { get: () => 'Definiție verificabilă pentru test.' }),
  notifications: [],
};

export const systemHealthFixture = {
  generated_at: '2026-07-23T09:15:00.000Z',
  overall_status: 'degraded',
  summary: { healthy: 2, degraded: 1, failed: 0, stalled: 0, running: 0, never: 0 },
  services: [
    {
      code: 'webhook.storia',
      label: 'Webhook Storia',
      status: 'healthy',
      last_started_at: '2026-07-23T09:10:00.000Z',
      last_success_at: '2026-07-23T09:10:01.000Z',
      last_error_at: null,
      last_error_code: null,
      last_error: null,
      duration_ms: 820,
      next_run_at: null,
      retry_count: 0,
      metrics: { processed_24h: 7, failed_24h: 0 },
    },
    {
      code: 'automations.queue',
      label: 'Coadă automatizări',
      status: 'degraded',
      last_started_at: '2026-07-23T08:47:00.000Z',
      last_success_at: '2026-07-23T08:47:02.000Z',
      last_error_at: '2026-07-23T08:48:00.000Z',
      last_error_code: 'job_failed',
      last_error: '1 joburi au eșuat.',
      duration_ms: 2_100,
      next_run_at: '2026-07-24T02:47:00.000Z',
      retry_count: 1,
      metrics: { pending: 2, failed: 1, stalled: 0 },
    },
    {
      code: 'feed.xml',
      label: 'Feeduri XML',
      status: 'healthy',
      last_started_at: '2026-07-23T08:30:00.000Z',
      last_success_at: '2026-07-23T08:30:01.000Z',
      last_error_at: null,
      last_error_code: null,
      last_error: null,
      duration_ms: 700,
      next_run_at: null,
      retry_count: 0,
      metrics: { generated_24h: 3, errors_24h: 0 },
    },
  ],
  recent_runs: [{
    id: '00000000-0000-4000-8000-000000000066',
    service_code: 'automations',
    operation: 'scheduled_batch',
    status: 'degraded',
    started_at: '2026-07-23T08:47:00.000Z',
    finished_at: '2026-07-23T08:47:02.000Z',
    duration_ms: 2_100,
    error_code: 'automation_jobs_failed',
    http_status: 207,
    processed_count: 3,
    error_count: 1,
    retry_count: 1,
  }],
};

export async function mockCrmBackend(page: Page) {
  await page.route('**/api/auth/login', async (route) => {
    const credentials = route.request().postDataJSON() as { username?: string; password?: string };
    if (credentials.username?.trim().toLowerCase() !== TEST_USER.username.toLowerCase()
      || credentials.password !== TEST_USER.password) {
      await json(route, { error: 'Nume utilizator sau parolă incorectă.' }, 401);
      return;
    }
    await json(route, {
      access_token: TEST_ACCESS_TOKEN,
      refresh_token: 'synthetic-e2e-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3_600,
      user: { id: TEST_USER.id, email: TEST_USER.email },
      security: { aal: 'aal2', mfa_required: true, password_change_required: false },
      next_path: '/dashboard',
    });
  });

  await page.route('**/api/auth/context', (route) => json(route, {
    user: { id: TEST_USER.id, email: TEST_USER.email, full_name: 'Agent E2E' },
    agency: {
      id: '00000000-0000-4000-8000-000000000011',
      name: 'Agenție E2E',
    },
    role: 'owner',
    permissions: {},
    security: {
      aal: 'aal2',
      mfa_required: true,
      mfa_enrolled_at: '2026-07-23T08:00:00.000Z',
      password_change_required: false,
      session_id: '00000000-0000-4000-8000-000000000033',
      session_created_at: '2026-07-23T08:00:00.000Z',
      session_last_seen_at: '2026-07-23T09:00:00.000Z',
      next_path: null,
    },
  }));

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
  await page.route('**/api/auth/audit**', (route) => json(route, { success: true }, 201));
  await page.route('**/api/audit?**', (route) => json(route, {
    events: [{
      id: '00000000-0000-4000-8000-0000000000aa',
      actor_user_id: TEST_USER.id,
      actor_name: 'Agent E2E',
      actor_role: 'owner',
      action: 'auth.login',
      entity_type: 'session',
      entity_id: TEST_USER.id,
      before_values: null,
      after_values: { authenticated: true },
      result: 'success',
      reason: null,
      route: '/api/auth/audit',
      user_agent: 'Synthetic E2E',
      ip_recorded: true,
      occurred_at: '2026-07-23T09:00:00.000Z',
    }],
    integrity: { valid: true, checked: 1 },
    pagination: { page: 1, page_size: 30, total: 1, pages: 1 },
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
  await page.route('**/api/notifications**', route => json(route, {
    notifications: [],
    unread_count: 0,
    pagination: { page: 1, page_size: 30, total: 0, pages: 1 },
    sync_warnings: [],
  }));
  await page.route('**/api/system/health**', route => json(route, systemHealthFixture));
}

export async function waitForLoginReady(page: Page) {
  await page.getByRole('button', { name: 'Logare' }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const button = document.querySelector<HTMLButtonElement>('button[type="submit"]');
    return Boolean(button && !button.disabled);
  });
}
