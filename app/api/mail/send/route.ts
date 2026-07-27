export const dynamic = 'force-dynamic';

import { createHash } from 'node:crypto';

import { appendAuditEvent } from '@/lib/server/audit-log';
import { sendAgentMail } from '@/lib/server/agent-mail-provider';
import { requireApiAuth } from '@/lib/server/api-auth';
import { ownMailbox, mailboxRequiredResponse } from '@/lib/server/mailbox-access';
import { mailSnippet, parseMailRecipients } from '@/lib/mail';

function cleanText(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
    .replace(/\r?\n/g, '<br>');
}

function normalizedSubject(value: string): string {
  return value.replace(/^(?:re|fw|fwd)\s*:\s*/i, '').trim().toLowerCase();
}

function threadKey(subject: string, participants: string[]): string {
  return createHash('sha256')
    .update([normalizedSubject(subject), ...participants.sort()].join('|'))
    .digest('hex');
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'mail', action: 'create' });
  if (!auth.ok) return auth.response;
  try {
    const mailbox = await ownMailbox(auth.context);
    if (!mailbox) return mailboxRequiredResponse();
    if (mailbox.status !== 'active') {
      return Response.json({ error: 'Căsuța de e-mail este dezactivată.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const to = parseMailRecipients(body.to);
    const cc = parseMailRecipients(body.cc);
    const bcc = parseMailRecipients(body.bcc);
    const subject = cleanText(body.subject, 998) || '(Fără subiect)';
    const text = cleanText(body.text, 2_000_000);
    if (!to.length) return Response.json({ error: 'Adaugă cel puțin un destinatar valid.' }, { status: 400 });
    if (!text) return Response.json({ error: 'Mesajul nu poate fi gol.' }, { status: 400 });
    if (to.length + cc.length + bcc.length > 20) {
      return Response.json({ error: 'Poți trimite către maximum 20 de destinatari simultan.' }, { status: 400 });
    }

    const replyMessageId = cleanText(body.reply_message_id, 100);
    let reply: { internet_message_id?: string | null; thread_key?: string | null } | null = null;
    if (replyMessageId) {
      const { data } = await auth.context.serviceAdmin
        .from('crm_mail_messages')
        .select('internet_message_id,thread_key')
        .eq('id', replyMessageId)
        .eq('agency_id', auth.context.agencyId)
        .eq('mailbox_id', mailbox.id)
        .maybeSingle();
      reply = data;
    }

    const id = crypto.randomUUID();
    const idempotencyKey = `mail:${id}`;
    const now = new Date().toISOString();
    const calculatedThread = reply?.thread_key || threadKey(subject, [mailbox.address, ...to, ...cc]);
    const { error: insertError } = await auth.context.serviceAdmin.from('crm_mail_messages').insert({
      id,
      agency_id: auth.context.agencyId,
      mailbox_id: mailbox.id,
      external_key: idempotencyKey,
      direction: 'outbound',
      folder: 'sent',
      provider: 'resend',
      thread_key: calculatedThread,
      in_reply_to: reply?.internet_message_id || null,
      from_email: mailbox.address,
      from_name: mailbox.display_name,
      to_emails: to,
      cc_emails: cc,
      bcc_emails: bcc,
      reply_to_email: mailbox.address,
      subject,
      text_body: text,
      html_body: `<p>${escapeHtml(text)}</p>`,
      snippet: mailSnippet(text),
      status: 'queued',
      created_by: auth.context.user.id,
      created_at: now,
      updated_at: now,
    });
    if (insertError) throw new Error(insertError.message);

    const result = await sendAgentMail({
      fromEmail: mailbox.address,
      senderName: mailbox.display_name,
      to,
      cc,
      bcc,
      replyTo: mailbox.address,
      subject,
      text,
      html: `<p>${escapeHtml(text)}</p>`,
      inReplyTo: reply?.internet_message_id || null,
      idempotencyKey,
    });
    const status = result.accepted ? 'accepted' : 'failed';
    const { data: message, error: updateError } = await auth.context.serviceAdmin
      .from('crm_mail_messages')
      .update({
        provider_message_id: result.messageId,
        status,
        error_code: result.errorCode,
        error_message: result.errorMessage,
        sent_at: result.accepted ? now : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('agency_id', auth.context.agencyId)
      .select('id,status,provider_message_id,error_code,error_message,sent_at')
      .single();
    if (updateError) throw new Error(updateError.message);

    await auth.context.serviceAdmin.from('email_delivery_logs').insert({
      agency_id: auth.context.agencyId,
      message_type: 'agent_mail',
      recipient_email: to.join(', ').slice(0, 1000),
      subject,
      provider: result.provider,
      provider_message_id: result.messageId,
      status,
      idempotency_key: idempotencyKey,
      error_code: result.errorCode,
      error_message: result.errorMessage,
      accepted_at: result.accepted ? now : null,
      failed_at: result.accepted ? null : now,
      created_by: auth.context.user.id,
      metadata: { mailbox_id: mailbox.id, message_id: id, cc_count: cc.length, bcc_count: bcc.length },
    }).then(() => undefined, () => undefined);

    await appendAuditEvent({
      client: auth.context.serviceAdmin,
      request,
      agencyId: auth.context.agencyId,
      actorUserId: auth.context.user.id,
      actorRole: auth.context.role,
      action: result.accepted ? 'mail.message_accepted' : 'mail.message_failed',
      entityType: 'crm_mail_message',
      entityId: id,
      result: result.accepted ? 'success' : 'failure',
      reason: result.errorCode,
      metadata: {
        recipient_count: to.length + cc.length + bcc.length,
        provider: result.provider,
        body_omitted: true,
      },
    });

    if (!result.accepted) {
      return Response.json({
        error: result.errorMessage || 'Mesajul nu a fost acceptat de furnizor.',
        code: result.errorCode,
        message,
      }, { status: result.errorCode === 'provider_not_configured' ? 503 : 502 });
    }
    return Response.json({ message }, { status: 201 });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : 'Mesajul nu a putut fi trimis.',
    }, { status: 500 });
  }
}
