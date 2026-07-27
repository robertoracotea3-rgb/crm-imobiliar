import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { Webhook } from 'svix';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Svix verification accepts the original Resend payload and rejects tampering', () => {
  const secret = `whsec_${randomBytes(32).toString('base64')}`;
  const verifier = new Webhook(secret);
  const payload = JSON.stringify({
    type: 'email.received',
    data: { email_id: 'email-123', to: ['roberto@kiraimobiliare.ro'] },
  });
  const id = 'msg_test_resend_signature';
  const timestamp = new Date();
  const headers = {
    'svix-id': id,
    'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
    'svix-signature': verifier.sign(id, timestamp, payload),
  };
  assert.deepEqual(verifier.verify(payload, headers), JSON.parse(payload));
  assert.throws(() => verifier.verify(payload.replace('roberto', 'atacator'), headers));
});

test('Resend receiving is bounded, provider-authenticated and rejects arbitrary download hosts', async () => {
  const source = await read('lib/server/resend-mail.ts');
  assert.match(source, /Authorization: `Bearer \$\{key\}`/);
  assert.match(source, /MAX_WEBHOOK_BYTES/);
  assert.match(source, /MAX_ATTACHMENT_BYTES/);
  assert.match(source, /hostname\.endsWith\('\.resend\.com'\)/);
  assert.match(source, /reader\.cancel\(\)/);
  assert.match(source, /AbortSignal\.timeout/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_RESEND/);
});

test('Resend delivery is idempotent and inbound duplicates are mailbox scoped', async () => {
  const [provider, inbound, route] = await Promise.all([
    read('lib/server/agent-mail-provider.ts'),
    read('lib/server/persist-inbound-mail.ts'),
    read('app/api/mail/provider-events/route.ts'),
  ]);
  assert.match(provider, /'Idempotency-Key': input\.idempotencyKey/);
  assert.match(inbound, /`resend:\$\{email\.id\}:\$\{mailbox\.id\}`/);
  assert.match(inbound, /duplicate:\s*true/);
  assert.match(route, /email\.delivery_delayed/);
  assert.match(route, /email\.failed/);
});
