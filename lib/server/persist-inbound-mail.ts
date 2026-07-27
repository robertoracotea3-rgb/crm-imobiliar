import 'server-only';

import { Buffer } from 'node:buffer';

import {
  MAIL_ADDRESS_PATTERN,
  MAIL_DOMAIN,
  cleanMailAddress,
  mailSnippet,
  parseMailRecipients,
} from '@/lib/mail';
import { getAdminClient } from '@/lib/server/api-auth';
import { persistNotifications } from '@/lib/server/notifications';
import type { ResendInboundEmail } from '@/lib/server/resend-mail';

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

function safeDate(value: string): string {
  return value && !Number.isNaN(Date.parse(value))
    ? new Date(value).toISOString()
    : new Date().toISOString();
}

export async function persistInboundMail(
  email: ResendInboundEmail,
  toAddressValue: string,
): Promise<{ accepted: boolean; matched: boolean; duplicate?: boolean; messageId?: string }> {
  const toAddress = cleanMailAddress(toAddressValue);
  const fromAddress = cleanMailAddress(email.from);
  const recipient = recipientLocalPart(toAddress);
  if (!recipient || !MAIL_ADDRESS_PATTERN.test(fromAddress)) {
    return { accepted: true, matched: false };
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
  if (!mailbox) return { accepted: true, matched: false };

  const externalKey = `resend:${email.id}:${mailbox.id}`;
  const { data: duplicate } = await admin
    .from('crm_mail_messages')
    .select('id')
    .eq('agency_id', mailbox.agency_id)
    .eq('external_key', externalKey)
    .maybeSingle();
  if (duplicate) {
    return { accepted: true, matched: true, duplicate: true, messageId: duplicate.id };
  }

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
  const { data: message, error: insertError } = await admin.from('crm_mail_messages').insert({
    id: messageId,
    agency_id: mailbox.agency_id,
    mailbox_id: mailbox.id,
    external_key: externalKey,
    direction: 'inbound',
    folder: 'inbox',
    provider: 'resend',
    internet_message_id: email.messageId,
    thread_key: email.messageId || externalKey,
    in_reply_to: email.inReplyTo,
    from_email: fromAddress,
    from_name: email.fromName,
    to_emails: parseMailRecipients(email.to),
    cc_emails: parseMailRecipients(email.cc),
    reply_to_email: cleanMailAddress(email.replyTo[0]) || fromAddress,
    subject: email.subject,
    text_body: email.text,
    html_body: email.html,
    snippet: mailSnippet(email.text || email.subject),
    status: 'received',
    received_at: safeDate(email.createdAt),
    contact_id: contact?.id || null,
    lead_id: lead?.id || null,
    property_id: propertyId,
  }).select('id').single();
  if (insertError) {
    if (/duplicate|unique/i.test(insertError.message)) {
      return { accepted: true, matched: true, duplicate: true };
    }
    throw new Error(insertError.message);
  }

  for (const attachment of email.attachments) {
    let storagePath: string | null = null;
    let status = attachment.status;
    if (attachment.status === 'available' && attachment.bytes) {
      storagePath = `${mailbox.agency_id}/${mailbox.id}/${messageId}/${crypto.randomUUID()}-${attachment.filename}`;
      const { error: uploadError } = await admin.storage
        .from('crm-mail-attachments')
        .upload(storagePath, Buffer.from(attachment.bytes), {
          contentType: attachment.contentType,
          upsert: false,
        });
      if (uploadError) {
        storagePath = null;
        status = 'failed';
      }
    }
    await admin.from('crm_mail_attachments').insert({
      agency_id: mailbox.agency_id,
      mailbox_id: mailbox.id,
      message_id: messageId,
      filename: attachment.filename,
      content_type: attachment.contentType,
      size_bytes: attachment.sizeBytes,
      storage_path: storagePath,
      content_id: attachment.contentId,
      disposition: attachment.disposition,
      status,
    });
  }

  await persistNotifications(admin, [{
    agency_id: mailbox.agency_id,
    user_id: mailbox.user_id,
    type: 'mail_received',
    title: `E-mail nou: ${email.subject}`.slice(0, 200),
    message: `${email.fromName || fromAddress}: ${mailSnippet(email.text || email.subject)}`.slice(0, 2000),
    entity_type: 'crm_mail_message',
    entity_id: message.id,
    priority: 'normal',
    action_url: `/mail?message=${message.id}`,
    dedup_key: `mail_received:${message.id}`,
    metadata: { from_email: fromAddress, contact_id: contact?.id || null, property_id: propertyId },
  }]).catch(() => 0);

  return { accepted: true, matched: true, messageId: message.id };
}
