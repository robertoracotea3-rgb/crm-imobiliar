import { expect, test } from '@playwright/test';
import { mockCrmBackend, TEST_USER, waitForLoginReady } from './fixtures/mock-crm';

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
