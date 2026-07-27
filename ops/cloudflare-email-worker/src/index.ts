import PostalMime from 'postal-mime';

interface Env {
  CRM_INBOUND_URL: string;
  MAIL_INBOUND_SECRET: string;
}

type ParsedAddress = {
  name?: string;
  address?: string;
};

const MAX_ATTACHMENT_BYTES = 2_000_000;
const MAX_TOTAL_ATTACHMENT_BYTES = 2_000_000;
const MAX_BODY_CHARS = 500_000;

function addresses(values: ParsedAddress[] | undefined): string[] {
  return (values || [])
    .map(value => String(value.address || '').trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
}

function attachmentContent(value: ArrayBuffer | Uint8Array | string): Uint8Array {
  if (typeof value === 'string') return new TextEncoder().encode(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function base64(input: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < input.length; offset += 0x8000) {
    binary += String.fromCharCode(...input.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export default {
  async email(message, env): Promise<void> {
    const inboundUrl = new URL('/api/mail/inbound', env.CRM_INBOUND_URL).toString();
    const parsed = await PostalMime.parse(
      await new Response(message.raw).arrayBuffer(),
      { attachmentEncoding: 'arraybuffer' },
    );

    let attachmentBytes = 0;
    const attachments = [];
    for (const attachment of parsed.attachments || []) {
      const content = attachmentContent(attachment.content);
      const bytes = content.byteLength;
      if (bytes > MAX_ATTACHMENT_BYTES || attachmentBytes + bytes > MAX_TOTAL_ATTACHMENT_BYTES) {
        attachments.push({
          filename: attachment.filename || 'atasament',
          content_type: attachment.mimeType || 'application/octet-stream',
          size: bytes,
          disposition: attachment.disposition || 'attachment',
          content_id: attachment.contentId || null,
          content_base64: '',
        });
        continue;
      }
      attachmentBytes += bytes;
      attachments.push({
        filename: attachment.filename || 'atasament',
        content_type: attachment.mimeType || 'application/octet-stream',
        size: bytes,
        disposition: attachment.disposition || 'attachment',
        content_id: attachment.contentId || null,
        content_base64: base64(content),
      });
    }

    const response = await fetch(inboundUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.MAIL_INBOUND_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_id: parsed.messageId || message.headers.get('Message-ID') || null,
        message_id: parsed.messageId || null,
        in_reply_to: parsed.inReplyTo || null,
        thread_key: parsed.references || parsed.inReplyTo || parsed.messageId || null,
        date: parsed.date || null,
        from: parsed.from?.address || message.from,
        from_name: parsed.from?.name || null,
        to: message.to,
        cc: addresses(parsed.cc),
        reply_to: parsed.replyTo?.[0]?.address || null,
        subject: String(parsed.subject || '').slice(0, 998),
        text: String(parsed.text || '').slice(0, MAX_BODY_CHARS),
        html: String(parsed.html || '').slice(0, MAX_BODY_CHARS),
        attachments,
      }),
    });

    if (response.status === 404) {
      message.setReject('Adresa de e-mail nu exista.');
      return;
    }
    if (!response.ok) {
      throw new Error(`CRM inbound rejected message with HTTP ${response.status}`);
    }
  },
} satisfies ExportedHandler<Env>;
