export const dynamic = 'force-dynamic';

import { appendAuditEvent } from '@/lib/server/audit-log';
import { getAdminClient } from '@/lib/server/api-auth';
import { verifyMailDeliveryWebhookAuthorization } from '@/lib/server/mail-delivery-webhook-auth';

const EVENTS = new Set([
  'processed',
  'delivered',
  'bounce',
  'reject',
  'spam',
  'open',
  'click',
  'unsubscribe',
]);

function text(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

async function webhookBody(request: Request): Promise<Record<string, unknown> | null> {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const value = await request.json().catch(() => null);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  }
  const form = await request.formData().catch(() => null);
  if (!form) return null;
  return Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value)]));
}

export async function POST(request: Request) {
  if (!verifyMailDeliveryWebhookAuthorization(request)) {
    return Response.json({ error: 'Autorizare webhook invalidă.' }, { status: 401 });
  }
  const body = await webhookBody(request);
  if (!body) return Response.json({ error: 'Payload webhook invalid.' }, { status: 400 });
  const event = text(body.event, 50).toLowerCase();
  const providerMessageId = text(body.email_id, 300);
  if (!EVENTS.has(event) || !providerMessageId) {
    return Response.json({ error: 'Eveniment sau identificator invalid.' }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data: message, error } = await admin
    .from('crm_mail_messages')
    .select('id,agency_id,status,error_code,error_message')
    .eq('provider', 'smtp2go')
    .eq('provider_message_id', providerMessageId)
    .maybeSingle();
  if (error) return Response.json({ error: 'Starea mesajului nu poate fi verificată.' }, { status: 500 });
  if (!message) return Response.json({ accepted: true, matched: false });

  let nextStatus: string | null = null;
  if (event === 'bounce') nextStatus = 'bounced';
  else if (event === 'reject') nextStatus = 'failed';
  else if (event === 'delivered' && !['bounced', 'failed'].includes(message.status)) nextStatus = 'delivered';
  else if (event === 'processed' && message.status === 'queued') nextStatus = 'accepted';
  if (!nextStatus || nextStatus === message.status) {
    return Response.json({ accepted: true, matched: true, changed: false });
  }

  const failureMessage = ['bounce', 'reject'].includes(event)
    ? text(body.message, 1000) || `SMTP2GO: ${event}`
    : null;
  const patch = {
    status: nextStatus,
    error_code: failureMessage ? `smtp2go_${event}` : null,
    error_message: failureMessage,
    updated_at: new Date().toISOString(),
  };
  const { error: updateError } = await admin
    .from('crm_mail_messages')
    .update(patch)
    .eq('id', message.id)
    .eq('agency_id', message.agency_id);
  if (updateError) return Response.json({ error: 'Starea mesajului nu a putut fi actualizată.' }, { status: 500 });

  await admin
    .from('email_delivery_logs')
    .update({
      status: nextStatus,
      error_code: patch.error_code,
      error_message: patch.error_message,
      failed_at: failureMessage ? new Date().toISOString() : null,
    })
    .eq('agency_id', message.agency_id)
    .eq('provider', 'smtp2go')
    .eq('provider_message_id', providerMessageId)
    .then(() => undefined, () => undefined);

  await appendAuditEvent({
    client: admin,
    request,
    agencyId: message.agency_id,
    action: 'mail.delivery_status_changed',
    entityType: 'crm_mail_message',
    entityId: message.id,
    before: { status: message.status },
    after: { status: nextStatus },
    result: failureMessage ? 'failure' : 'success',
    reason: failureMessage,
    metadata: { provider: 'smtp2go', event, provider_message_id: providerMessageId },
  }).catch(() => undefined);

  return Response.json({ accepted: true, matched: true, changed: true });
}
