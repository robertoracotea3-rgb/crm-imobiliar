export const dynamic = 'force-dynamic';

import { appendAuditEvent } from '@/lib/server/audit-log';
import { getAdminClient } from '@/lib/server/api-auth';
import { persistInboundMail } from '@/lib/server/persist-inbound-mail';
import {
  retrieveResendInboundEmail,
  verifyResendWebhook,
  type ResendWebhookEvent,
} from '@/lib/server/resend-mail';

const OUTBOUND_EVENTS = new Set([
  'email.sent',
  'email.delivered',
  'email.bounced',
  'email.failed',
  'email.delivery_delayed',
]);

function text(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function failureReason(event: ResendWebhookEvent): string | null {
  const data = event.data || {};
  const nested = ['bounce', 'failure'].flatMap(key => {
    const value = data[key];
    return value && typeof value === 'object'
      ? Object.values(value as Record<string, unknown>)
      : [];
  });
  return [
    data.message,
    data.reason,
    data.error,
    ...nested,
  ].map(value => text(value, 1000)).find(Boolean) || null;
}

async function processInbound(event: ResendWebhookEvent) {
  const emailId = text(event.data?.email_id, 120);
  if (!emailId) {
    return Response.json({ error: 'Evenimentul primit nu conține identificatorul mesajului.' }, { status: 400 });
  }
  const email = await retrieveResendInboundEmail(emailId);
  const destinations = [...new Set(email.to.map(value => value.toLowerCase()))].slice(0, 20);
  const results = [];
  for (const destination of destinations) {
    results.push(await persistInboundMail(email, destination));
  }
  return Response.json({
    accepted: true,
    event: 'email.received',
    matched: results.filter(result => result.matched).length,
    duplicates: results.filter(result => result.duplicate).length,
  });
}

async function processOutbound(event: ResendWebhookEvent, request: Request) {
  if (!OUTBOUND_EVENTS.has(event.type)) {
    return Response.json({ accepted: true, ignored: true });
  }
  const providerMessageId = text(event.data?.email_id, 300);
  if (!providerMessageId) {
    return Response.json({ error: 'Identificatorul Resend lipsește.' }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data: message, error } = await admin
    .from('crm_mail_messages')
    .select('id,agency_id,status,error_code,error_message')
    .eq('provider', 'resend')
    .eq('provider_message_id', providerMessageId)
    .maybeSingle();
  if (error) return Response.json({ error: 'Starea mesajului nu poate fi verificată.' }, { status: 500 });
  if (!message) return Response.json({ accepted: true, matched: false });

  let nextStatus: string | null = null;
  if (event.type === 'email.bounced') nextStatus = 'bounced';
  else if (event.type === 'email.failed') nextStatus = 'failed';
  else if (event.type === 'email.delivered' && !['bounced', 'failed'].includes(message.status)) {
    nextStatus = 'delivered';
  } else if (event.type === 'email.sent' && message.status === 'queued') {
    nextStatus = 'accepted';
  }
  if (!nextStatus || nextStatus === message.status) {
    return Response.json({ accepted: true, matched: true, changed: false });
  }

  const failed = ['email.bounced', 'email.failed'].includes(event.type);
  const reason = failed ? failureReason(event) || `Resend: ${event.type}` : null;
  const patch = {
    status: nextStatus,
    error_code: reason ? `resend_${event.type.replace('email.', '')}` : null,
    error_message: reason,
    updated_at: new Date().toISOString(),
  };
  const { error: updateError } = await admin
    .from('crm_mail_messages')
    .update(patch)
    .eq('id', message.id)
    .eq('agency_id', message.agency_id);
  if (updateError) {
    return Response.json({ error: 'Starea mesajului nu a putut fi actualizată.' }, { status: 500 });
  }

  await admin
    .from('email_delivery_logs')
    .update({
      status: nextStatus,
      error_code: patch.error_code,
      error_message: patch.error_message,
      failed_at: reason ? new Date().toISOString() : null,
    })
    .eq('agency_id', message.agency_id)
    .eq('provider', 'resend')
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
    result: reason ? 'failure' : 'success',
    reason,
    metadata: { provider: 'resend', event: event.type, provider_message_id: providerMessageId },
  }).catch(() => undefined);

  return Response.json({ accepted: true, matched: true, changed: true });
}

export async function POST(request: Request) {
  let event: ResendWebhookEvent;
  try {
    event = verifyResendWebhook(await request.text(), request.headers);
  } catch {
    return Response.json({ error: 'Semnătură webhook Resend invalidă.' }, { status: 401 });
  }

  try {
    if (event.type === 'email.received') return await processInbound(event);
    return await processOutbound(event, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Evenimentul Resend nu a putut fi procesat.';
    const status = message === 'resend_provider_not_configured' ? 503 : 500;
    return Response.json({ error: message }, { status });
  }
}
