import { expect, test, type Route } from '@playwright/test';

import { mockCrmBackend, TEST_USER, waitForLoginReady } from './fixtures/mock-crm';

const mailbox = {
  id: '00000000-0000-4000-8000-0000000000b1',
  user_id: TEST_USER.id,
  address: 'agent.e2e@kiraimobiliare.ro',
  display_name: 'Agent E2E',
};
const message = {
  id: '00000000-0000-4000-8000-0000000000c1',
  direction: 'inbound',
  folder: 'inbox',
  from_email: 'client@example.ro',
  from_name: 'Client Test',
  to_emails: [mailbox.address],
  cc_emails: [],
  subject: 'Interes pentru apartament',
  snippet: 'Doresc să programez o vizionare.',
  text_body: 'Bună ziua, doresc să programez o vizionare.',
  html_body: null,
  reply_to_email: 'client@example.ro',
  status: 'received',
  read_at: '2026-07-27T10:05:00.000Z',
  archived_at: null,
  sent_at: null,
  received_at: '2026-07-27T10:00:00.000Z',
  created_at: '2026-07-27T10:00:00.000Z',
  contact_id: '00000000-0000-4000-8000-0000000000d1',
  lead_id: '00000000-0000-4000-8000-0000000000d2',
  property_id: '00000000-0000-4000-8000-0000000000d3',
  attachments: [],
};

const json = (route: Route, body: unknown, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

test.beforeEach(async ({ page }) => {
  await mockCrmBackend(page);
  await page.route('**/api/mail/messages/*', route => {
    if (route.request().method() === 'PATCH') {
      return json(route, { message: { id: message.id, folder: 'inbox', read_at: message.read_at } });
    }
    return json(route, { message });
  });
  await page.route('**/api/mail/send', route => json(route, {
    message: { id: '00000000-0000-4000-8000-0000000000c2', status: 'accepted' },
  }, 201));
  await page.route('**/api/mail?**', route => {
    const summary = new URL(route.request().url()).searchParams.get('summary') === '1';
    if (summary) return json(route, { mailbox, unread_count: 1 });
    return json(route, {
      mailbox,
      mailboxes: [mailbox],
      messages: [message],
      unread_count: 1,
      pagination: { page: 1, page_size: 30, total: 1, pages: 1 },
    });
  });
});

test('agent reads linked CRM mail and sends a reply', async ({ page }) => {
  await page.goto('/login');
  await waitForLoginReady(page);
  await page.getByLabel('Nume utilizator').fill(TEST_USER.username);
  await page.getByLabel('Parola').fill(TEST_USER.password);
  await page.getByRole('button', { name: 'Logare' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto('/mail');
  await expect(page.getByRole('heading', { name: 'E-mail' })).toBeVisible();
  await expect(page.getByText(mailbox.address)).toBeVisible();
  await page.getByText('Interes pentru apartament').click();
  await expect(page.getByText('Bună ziua, doresc să programez o vizionare.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Deschide proprietatea' }))
    .toHaveAttribute('href', `/properties/${message.property_id}`);

  await page.getByRole('button', { name: 'Răspunde' }).click();
  await page.getByRole('textbox', { name: 'Mesaj', exact: true })
    .fill('Confirm. Vă sun pentru stabilirea orei.');
  await page.getByRole('button', { name: 'Trimite' }).click();
  await expect(page.getByText('Mesajul a fost acceptat pentru livrare.')).toBeVisible();
});
