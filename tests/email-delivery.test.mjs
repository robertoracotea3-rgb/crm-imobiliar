import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('email configuration separates provider verification from mailbox confirmation', async () => {
  const [migration, route, panel] = await Promise.all([
    read('migrations/20260724_290_agency_email_delivery.sql'),
    read('app/api/settings/email/route.ts'),
    read('components/EmailSettingsPanel.tsx'),
  ]);
  assert.match(migration, /provider_domain_status/);
  assert.match(migration, /mailbox_status/);
  assert.match(migration, /documents_verified_at/);
  assert.match(migration, /reports_verified_at/);
  assert.match(route, /action === 'verify_domain'/);
  assert.match(route, /action === 'send_test'/);
  assert.match(route, /action === 'confirm_received'/);
  assert.match(route, /24 \* 60 \* 60 \* 1000/);
  assert.match(panel, /Acceptarea mesajului de către furnizor nu înseamnă/);
  assert.match(panel, /Confirmă primirea/);
});

test('a provider attempt is logged and never presented as sent without provider acceptance', async () => {
  const [provider, route, migration] = await Promise.all([
    read('lib/server/email-provider.ts'),
    read('app/api/settings/email/route.ts'),
    read('migrations/20260724_290_agency_email_delivery.sql'),
  ]);
  assert.match(provider, /if \(!response\.ok \|\| typeof payload\.id !== 'string'\)/);
  assert.match(provider, /accepted: true/);
  assert.match(provider, /Idempotency-Key/);
  assert.match(route, /email_delivery_logs/);
  assert.match(route, /if \(logError\)/);
  assert.match(route, /provider_accepted: result\.accepted/);
  assert.match(migration, /email_delivery_idempotency_idx/);
  assert.match(migration, /status in \('queued', 'accepted', 'delivered', 'failed', 'bounced'\)/);
});

test('email secrets remain server-side and configuration has an explicit manual runbook', async () => {
  const [provider, example, runbook] = await Promise.all([
    read('lib/server/email-provider.ts'),
    read('.env.example'),
    read('docs/email-configuration-runbook.md'),
  ]);
  assert.match(provider, /process\.env\.RESEND_API_KEY/);
  assert.doesNotMatch(provider, /NEXT_PUBLIC_EMAIL/);
  assert.match(example, /RESEND_API_KEY=/);
  assert.match(runbook, /nu este confirmată/i);
  assert.match(runbook, /SPF și DKIM/);
  assert.match(runbook, /autentificarea în doi pași/);
});
