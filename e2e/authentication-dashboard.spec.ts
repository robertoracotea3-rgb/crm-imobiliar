import { expect, test } from '@playwright/test';
import {
  mockCrmBackend, TEST_ACCESS_TOKEN, TEST_USER, waitForLoginReady,
} from './fixtures/mock-crm';

test.beforeEach(async ({ page }) => {
  await mockCrmBackend(page);
});

test('invalid credentials remain on login and show a safe message', async ({ page }) => {
  await page.goto('/login');
  await waitForLoginReady(page);
  await page.getByLabel('Nume utilizator').fill('E2E_AGENT');
  await page.getByLabel('Parola').fill('wrong-password');
  await page.getByRole('button', { name: 'Logare' }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Nume utilizator sau parola incorecta.')).toBeVisible();
});

test('synthetic user signs in and receives exact dashboard KPIs', async ({ page }) => {
  await page.goto('/login');
  await waitForLoginReady(page);
  await page.getByLabel('Nume utilizator').fill(TEST_USER.username);
  await page.getByLabel('Parola').fill(TEST_USER.password);
  await page.getByRole('button', { name: 'Logare' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText('Bun venit, Agent E2E')).toBeVisible();
  await expect(page.getByText('Contact în maximum 24 de ore')).toBeVisible();
  await expect(page.getByText('Leaduri noi')).toBeVisible();
  await expect(page.getByText('4', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('3.000 EUR')).toBeVisible();
  await expect(page.getByText('25%')).toBeVisible();
});

test('synthetic owner can verify the immutable audit journal', async ({ page }) => {
  await page.goto('/login');
  await waitForLoginReady(page);
  await page.getByLabel('Nume utilizator').fill(TEST_USER.username);
  await page.getByLabel('Parola').fill(TEST_USER.password);
  await page.getByRole('button', { name: 'Logare' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto('/audit');
  await expect(page.getByRole('heading', { name: 'Jurnal de audit' })).toBeVisible();
  await expect(page.getByText('Lanț verificat: 1 evenimente')).toBeVisible();
  await expect(page.getByText('Autentificare', { exact: true })).toBeVisible();
  await expect(page.getByText(/IP pseudonimizat/)).toBeVisible();
});

test('synthetic owner sees the unified system health dashboard', async ({ page }) => {
  await page.goto('/login');
  await waitForLoginReady(page);
  await page.getByLabel('Nume utilizator').fill(TEST_USER.username);
  await page.getByLabel('Parola').fill(TEST_USER.password);
  await page.getByRole('button', { name: 'Logare' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto('/system-health');
  await expect(page.getByRole('heading', { name: 'Sănătatea sistemului' })).toBeVisible();
  await expect(page.getByText('Necesită atenție').first()).toBeVisible();
  await expect(page.getByText('Webhook Storia')).toBeVisible();
  await expect(page.getByText('Coadă automatizări')).toBeVisible();
  await expect(page.getByText(/1 joburi au eșuat/)).toBeVisible();
});

test('owner completes the required authenticator challenge before dashboard access', async ({ page }) => {
  const factor = {
    id: '00000000-0000-4000-8000-000000000044',
    status: 'verified',
    factor_type: 'totp',
    friendly_name: 'Kira CRM',
    created_at: '2026-07-23T08:00:00.000Z',
    updated_at: '2026-07-23T08:00:00.000Z',
  };
  const fulfill = (route: Parameters<Parameters<typeof page.route>[1]>[0], body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route('**/api/auth/login', route => fulfill(route, {
    access_token: TEST_ACCESS_TOKEN,
    refresh_token: 'synthetic-e2e-refresh-token',
    user: { id: TEST_USER.id, email: TEST_USER.email },
    security: { aal: 'aal1', mfa_required: true, password_change_required: false },
    next_path: '/auth/mfa',
  }));
  await page.route('**/auth/v1/user**', route => fulfill(route, {
    id: TEST_USER.id,
    email: TEST_USER.email,
    aud: 'authenticated',
    role: 'authenticated',
    factors: [factor],
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: '2026-07-23T00:00:00.000Z',
  }));
  await page.route('**/auth/v1/factors/*/challenge', route => fulfill(route, {
    id: '00000000-0000-4000-8000-000000000055',
    expires_at: Math.floor(Date.now() / 1000) + 300,
  }));
  await page.route('**/auth/v1/factors/*/verify', route => fulfill(route, {
    access_token: TEST_ACCESS_TOKEN,
    refresh_token: 'synthetic-e2e-refresh-token-after-mfa',
    expires_in: 3_600,
    expires_at: Math.floor(Date.now() / 1000) + 3_600,
    user: {
      id: TEST_USER.id,
      email: TEST_USER.email,
      factors: [factor],
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      aud: 'authenticated',
      role: 'authenticated',
      created_at: '2026-07-23T00:00:00.000Z',
    },
  }));
  await page.route('**/api/auth/security', route => fulfill(route, {
    success: true,
    next_path: '/dashboard',
  }));

  await page.goto('/login');
  await waitForLoginReady(page);
  await page.getByLabel('Nume utilizator').fill(TEST_USER.username);
  await page.getByLabel('Parola').fill(TEST_USER.password);
  await page.getByRole('button', { name: 'Logare' }).click();
  await expect(page).toHaveURL(/\/auth\/mfa$/);
  await page.getByLabel('Cod din aplicație').fill('123456');
  await page.getByRole('button', { name: 'Verifică și continuă' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('temporary password flow requires the current password and returns to login', async ({ page }) => {
  await page.route('**/api/auth/login', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      access_token: TEST_ACCESS_TOKEN,
      refresh_token: 'synthetic-e2e-refresh-token',
      user: { id: TEST_USER.id, email: TEST_USER.email },
      security: { aal: 'aal1', mfa_required: true, password_change_required: true },
      next_path: '/auth/schimba-parola',
    }),
  }));
  await page.route('**/api/auth/security', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, next_path: '/login' }),
  }));

  await page.goto('/login');
  await waitForLoginReady(page);
  await page.getByLabel('Nume utilizator').fill(TEST_USER.username);
  await page.getByLabel('Parola').fill(TEST_USER.password);
  await page.getByRole('button', { name: 'Logare' }).click();
  await expect(page).toHaveURL(/\/auth\/schimba-parola$/);
  await page.getByLabel('Parola curentă sau temporară').fill(TEST_USER.password);
  await page.getByLabel('Parolă nouă').fill('Parola-Noua-2026!');
  await page.getByLabel('Confirmă parola').fill('Parola-Noua-2026!');
  await page.getByRole('button', { name: 'Salvează parola' }).click();
  await expect(page).toHaveURL(/\/login$/);
});
