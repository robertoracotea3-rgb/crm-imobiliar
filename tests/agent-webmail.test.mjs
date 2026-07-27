import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('each agent can claim one immutable tenant-scoped mailbox', async () => {
  const migration = await read('migrations/20260727_350_agent_webmail.sql');
  assert.match(migration, /create table if not exists public\.crm_mailboxes/i);
  assert.match(migration, /unique\s*\(user_id\)/i);
  assert.match(migration, /unique\s*\(address\)/i);
  assert.match(migration, /crm_claim_personal_mailbox/i);
  assert.match(migration, /mailbox_identity_immutable/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /crm-mail-attachments/i);
});

test('mailbox selection is permanent, validated server-side and part of first login', async () => {
  const [setupRoute, setupPage, login, context, feature] = await Promise.all([
    read('app/api/mail/setup/route.ts'),
    read('app/auth/email-setup/page.tsx'),
    read('app/api/auth/login/route.ts'),
    read('app/api/auth/context/route.ts'),
    read('lib/server/mail-feature.ts'),
  ]);
  assert.match(setupRoute, /confirm_permanent/);
  assert.match(setupRoute, /crm_claim_personal_mailbox/);
  assert.match(setupPage, /confirm_permanent:\s*true/);
  assert.match(login, /mailboxRequired[\s\S]*\/auth\/email-setup/);
  assert.match(context, /mailboxRequired[\s\S]*\/auth\/email-setup/);
  assert.match(feature, /MAIL_ONBOARDING_ENABLED/);
});

test('personal inbox is authorized, auditable and provider acceptance is explicit', async () => {
  const [send, provider, deliveryEvents, inbox, message, sidebar] = await Promise.all([
    read('app/api/mail/send/route.ts'),
    read('lib/server/agent-mail-provider.ts'),
    read('app/api/mail/provider-events/route.ts'),
    read('app/api/mail/route.ts'),
    read('app/api/mail/messages/[id]/route.ts'),
    read('components/Sidebar.tsx'),
  ]);
  assert.match(send, /requireApiAuth\(request, \{ module: 'mail', action: 'create' \}\)/);
  assert.match(send, /status = result\.accepted \? 'accepted' : 'failed'/);
  assert.match(send, /appendAuditEvent/);
  assert.match(provider, /process\.env\.SMTP2GO_API_KEY/);
  assert.doesNotMatch(provider, /NEXT_PUBLIC_/);
  assert.match(deliveryEvents, /email_id/);
  assert.match(deliveryEvents, /'delivered'/);
  assert.match(deliveryEvents, /'bounced'/);
  assert.match(inbox, /module: 'mail', action: 'view'/);
  assert.match(message, /contextCanManageAll/);
  assert.match(sidebar, /href: '\/mail', label: 'E-mail'/);
});

test('Cloudflare inbound gateway authenticates, parses MIME and preserves plus addressing', async () => {
  const [worker, route, guard] = await Promise.all([
    read('ops/cloudflare-email-worker/src/index.ts'),
    read('app/api/mail/inbound/route.ts'),
    read('lib/server/mail-inbound-auth.ts'),
  ]);
  assert.match(worker, /PostalMime\.parse/);
  assert.match(worker, /message\.to/);
  assert.match(worker, /MAIL_INBOUND_SECRET/);
  assert.match(route, /recipientLocalPart/);
  assert.match(route, /propertyIdFromTag/);
  assert.match(route, /verifyMailInboundAuthorization/);
  assert.match(guard, /timingSafeEqual/);
});
