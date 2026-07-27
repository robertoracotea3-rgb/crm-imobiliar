export const dynamic = 'force-dynamic';

import { Buffer } from 'node:buffer';

import { verifyMailInboundAuthorization } from '@/lib/server/mail-inbound-auth';
import { getAdminClient } from '@/lib/server/api-auth';
import { persistNotifications } from '@/lib/server/notifications';
import {
  MAIL_ADDRESS_PATTERN,
  MAIL_DOMAIN,
  cleanMailAddress,
  mailSnippet,
  parseMailRecipients,
} from '@/lib/mail';

const MAX_REQUEST_BYTES = 4_000_000;
const MAX_BODY_CHARS = 500_000;
const MAX_ATTACHMENT_BYTES = 4_000_000;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
]);

function cleanText(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function safeFilename(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  return name.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 180) || 'atașament';
}

function recipientLocalPart(address: string): { localPart: string; tag: string | null } | null {
  const [localWithTag, domain] = address.toLowerCase().split('@');
  if (!localWithTag || domain !== MAIL_DOMAIN) return null;
  const [localPart, tag] = localWithTag.split('+', 2);
  return { localPart, tag: tag || null };
}

function propertyIdFromTag(tag: string | null): string | null {
  const match = tag?.match(/^(?:p|property)-([0-9a-f-]{36})$/i);
  return match?.[1] || null;
}

export async function POST(request: Request) {
  if (!verifyMailInboundAuthorization(request)) {
    return Response.json({ error: 'Semnătură inbound invalidă.' }, { status: 401 });
  }
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_REQUEST_BYTES) {
    return Response.json({ error: 'Mesajul depășește limita acceptată de CRM.' }, { status: 413 });
  }

  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_REQUEST_BYTES) {
      return Response.json({ error: 'Mesajul depășește limita acceptată de CRM.' }, { status: 413 });
    }
    const body = (() => {
      try { return JSON.parse(rawBody); } catch { return null; }
    })();
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Payload inbound invalid.' }, { status: 400 });
    }
    const toAddress = cleanMailAddress(body.to);
    const fromAddress = cleanMailAddress(body.from);
    const recipient = recipientLocalPart(toAddress);
    if (!recipient || !MAIL_ADDRESS_PATTERN.test(fromAddress)) {
      return Response.json({ error: 'Expeditor sau destinatar invalid.' }, { status: 400 });
    }

    const admin = getAdminClient();
    const { data: mailbox, error: mailboxError } = await admin
      .from('crm_mailboxes')
      .select('id,agency_id,user_id,address,display_name,status')
      .eq('local_part', recipient.localPart)
      .eq('domain', MAIL_DOMAIN)
      .eq('status', 'active')
      .maybeSingle();
    if (mailboxError) throw new Error(mailboxError.message);
    if (!mailbox) return Response.json({ error: 'Destinatar necunoscut.' }, { status: 404 });

    const subject = cleanText(body.subject, 998) || '(Fără subiect)';
    const textBody = cleanText(body.text, MAX_BODY_CHARS);
    const htmlBody = cleanText(body.html, MAX_BODY_CHARS) || null;
    const internetMessageId = cleanText(body.message_id, 998) || null;
    const externalKey = cleanText(body.event_id, 300)
      || internetMessageId
      || `inbound:${crypto.randomUUID()}`;
    const { data: duplicate } = await admin
      .from('crm_mail_messages')
      .select('id')
      .eq('agency_id', mailbox.agency_id)
      .eq('external_key', externalKey)
      .maybeSingle();
    if (duplicate) return Response.json({ accepted: true, duplicate: true, message_id: duplicate.id });

    const [{ data: contact }, { data: lead }] = await Promise.all([
      admin.from('contacts').select('id').eq('agency_id', mailbox.agency_id)
        .ilike('email', fromAddress).is('deleted_at', null).limit(1).maybeSingle(),
      admin.from('leads').select('id,property_id').eq('agency_id', mailbox.agency_id)
        .ilike('contact_email', fromAddress).is('deleted_at', null)
        .order('received_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    const requestedPropertyId = propertyIdFromTag(recipient.tag);
    let propertyId = requestedPropertyId || lead?.property_id || null;
    if (propertyId) {
      const { data: property } = await admin.from('properties').select('id')
        .eq('id', propertyId).eq('agency_id', mailbox.agency_id).is('deleted_at', null).maybeSingle();
      if (!property) propertyId = null;
    }

    const messageId = crypto.randomUUID();
    const receivedAt = cleanText(body.date, 80);
    const safeReceivedAt = receivedAt && !Number.isNaN(Date.parse(receivedAt))
      ? new Date(receivedAt).toISOString()
      : new Date().toISOString();
    const { data: message, error: insertError } = await admin.from('crm_mail_messages').insert({
      id: messageId,
      agency_id: mailbox.agency_id,
      mailbox_id: mailbox.id,
      external_key: externalKey,
      direction: 'inbound',
      folder: 'inbox',
      provider: 'cloudflare',
      internet_message_id: internetMessageId,
      thread_key: cleanText(body.thread_key, 200) || internetMessageId || externalKey,
      in_reply_to: cleanText(body.in_reply_to, 998) || null,
      from_email: fromAddress,
      from_name: cleanText(body.from_name, 200) || null,
      to_emails: [toAddress],
      cc_emails: parseMailRecipients(body.cc),
      reply_to_email: cleanMailAddress(body.reply_to) || fromAddress,
      subject,
      text_body: textBody,
      html_body: htmlBody,
      snippet: mailSnippet(textBody || subject),
      status: 'received',
      received_at: safeReceivedAt,
      contact_id: contact?.id || null,
      lead_id: lead?.id || null,
      property_id: propertyId,
    }).select('id').single();
    if (insertError) {
      if (/duplicate|unique/i.test(insertError.message)) {
        return Response.json({ accepted: true, duplicate: true });
      }
      throw new Error(insertError.message);
    }

    const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 20) : [];
    for (const item of attachments) {
      const filename = safeFilename(item?.filename);
      const contentType = cleanText(item?.content_type, 200).toLowerCase() || 'application/octet-stream';
      const base64 = typeof item?.content_base64 === 'string' ? item.content_base64 : '';
      const sizeBytes = Math.min(Number(item?.size || 0) || Math.floor(base64.length * 0.75), 26_214_400);
      const allowed = ALLOWED_ATTACHMENT_TYPES.has(contentType)
        && sizeBytes <= MAX_ATTACHMENT_BYTES
        && base64.length <= Math.ceil(MAX_ATTACHMENT_BYTES * 4 / 3) + 8;
      let storagePath: string | null = null;
      let status = allowed ? 'available' : 'quarantined';
      if (allowed) {
        storagePath = `${mailbox.agency_id}/${mailbox.id}/${messageId}/${crypto.randomUUID()}-${filename}`;
        const bytes = Buffer.from(base64, 'base64');
        const { error: uploadError } = await admin.storage
          .from('crm-mail-attachments')
          .upload(storagePath, bytes, { contentType, upsert: false });
        if (uploadError) {
          storagePath = null;
          status = 'failed';
        }
      }
      await admin.from('crm_mail_attachments').insert({
        agency_id: mailbox.agency_id,
        mailbox_id: mailbox.id,
        message_id: messageId,
        filename,
        content_type: contentType,
        size_bytes: sizeBytes,
        storage_path: storagePath,
        content_id: cleanText(item?.content_id, 300) || null,
        disposition: item?.disposition === 'inline' ? 'inline' : 'attachment',
        status,
      });
    }

    await persistNotifications(admin, [{
      agency_id: mailbox.agency_id,
      user_id: mailbox.user_id,
      type: 'mail_received',
      title: `E-mail nou: ${subject}`.slice(0, 200),
      message: `${body.from_name || fromAddress}: ${mailSnippet(textBody || subject)}`.slice(0, 2000),
      entity_type: 'crm_mail_message',
      entity_id: message.id,
      priority: 'normal',
      action_url: `/mail?message=${message.id}`,
      dedup_key: `mail_received:${message.id}`,
      metadata: { from_email: fromAddress, contact_id: contact?.id || null, property_id: propertyId },
    }]).catch(() => 0);

    return Response.json({ accepted: true, message_id: message.id }, { status: 201 });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : 'Mesajul inbound nu a putut fi procesat.',
    }, { status: 500 });
  }
}
