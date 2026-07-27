import 'server-only';

import { Webhook } from 'svix';

const RESEND_API = 'https://api.resend.com';
const MAX_WEBHOOK_BYTES = 1_000_000;
const MAX_ATTACHMENT_BYTES = 4_000_000;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
]);

export type ResendWebhookEvent = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
    [key: string]: unknown;
  };
};

export type ResendInboundAttachment = {
  filename: string;
  contentType: string;
  sizeBytes: number;
  contentId: string | null;
  disposition: 'inline' | 'attachment';
  bytes: Uint8Array | null;
  status: 'available' | 'quarantined' | 'failed';
};

export type ResendInboundEmail = {
  id: string;
  to: string[];
  from: string;
  fromName: string | null;
  cc: string[];
  replyTo: string[];
  subject: string;
  html: string | null;
  text: string;
  messageId: string | null;
  inReplyTo: string | null;
  createdAt: string;
  attachments: ResendInboundAttachment[];
};

function providerKey(): string {
  return String(process.env.RESEND_API_KEY || '').trim();
}

function webhookSecret(): string {
  return String(process.env.RESEND_WEBHOOK_SECRET || '').trim();
}

function cleanText(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function safeProviderMessage(value: unknown): string {
  const message = value && typeof value === 'object' && 'message' in value
    ? String(value.message)
    : 'Resend nu a putut furniza mesajul.';
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
    .slice(0, 1000);
}

function displayName(value: unknown): string | null {
  const header = cleanText(value, 400);
  const match = header.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
  return match?.[1]?.trim().slice(0, 200) || null;
}

function htmlToText(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function trustedAttachmentUrl(value: unknown): URL | null {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return null;
    if (url.hostname !== 'resend.com' && !url.hostname.endsWith('.resend.com')) return null;
    return url;
  } catch {
    return null;
  }
}

async function limitedBytes(response: Response, maximum: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maximum) throw new Error('attachment_too_large');
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximum) {
      await reader.cancel();
      throw new Error('attachment_too_large');
    }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function resendJson(
  path: string,
  fetchImpl: typeof fetch,
): Promise<Record<string, unknown>> {
  const key = providerKey();
  if (!key) throw new Error('resend_provider_not_configured');
  const response = await fetchImpl(`${RESEND_API}${path}`, {
    headers: {
      Authorization: `Bearer ${key}`,
      'User-Agent': 'Kira-CRM/1.0',
    },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(safeProviderMessage(payload));
  return payload;
}

export function verifyResendWebhook(rawBody: string, headers: Headers): ResendWebhookEvent {
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_WEBHOOK_BYTES) {
    throw new Error('webhook_too_large');
  }
  const secret = webhookSecret();
  if (!secret.startsWith('whsec_') || secret.length < 32) {
    throw new Error('resend_webhook_not_configured');
  }
  const verified = new Webhook(secret).verify(rawBody, {
    'svix-id': headers.get('svix-id') || '',
    'svix-timestamp': headers.get('svix-timestamp') || '',
    'svix-signature': headers.get('svix-signature') || '',
  });
  if (!verified || typeof verified !== 'object') throw new Error('invalid_webhook');
  return verified as ResendWebhookEvent;
}

export async function retrieveResendInboundEmail(
  emailId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ResendInboundEmail> {
  const safeId = cleanText(emailId, 120);
  if (!/^[a-zA-Z0-9-]+$/.test(safeId)) throw new Error('invalid_resend_email_id');
  const payload = await resendJson(`/emails/receiving/${encodeURIComponent(safeId)}`, fetchImpl);
  const headers = payload.headers && typeof payload.headers === 'object'
    ? payload.headers as Record<string, unknown>
    : {};
  const html = cleanText(payload.html, 500_000) || null;
  const text = cleanText(payload.text, 500_000) || (html ? htmlToText(html).slice(0, 500_000) : '');
  const attachmentList = Array.isArray(payload.attachments) && payload.attachments.length
    ? await resendJson(
      `/emails/receiving/${encodeURIComponent(safeId)}/attachments`,
      fetchImpl,
    )
    : { data: [] };
  const metadata = Array.isArray(attachmentList.data) ? attachmentList.data.slice(0, 20) : [];
  const attachments: ResendInboundAttachment[] = [];
  for (const item of metadata) {
    const entry = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const filename = cleanText(entry.filename, 180)
      .replace(/[^\p{L}\p{N}._ -]/gu, '_') || 'atașament';
    const contentType = cleanText(entry.content_type, 200).toLowerCase() || 'application/octet-stream';
    const sizeBytes = Math.max(0, Math.min(Number(entry.size || 0) || 0, 26_214_400));
    const allowed = ALLOWED_ATTACHMENT_TYPES.has(contentType) && sizeBytes <= MAX_ATTACHMENT_BYTES;
    const downloadUrl = trustedAttachmentUrl(entry.download_url);
    let bytes: Uint8Array | null = null;
    let status: ResendInboundAttachment['status'] = allowed ? 'available' : 'quarantined';
    if (allowed && downloadUrl) {
      try {
        const response = await fetchImpl(downloadUrl, {
          redirect: 'error',
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) throw new Error(`attachment_http_${response.status}`);
        bytes = await limitedBytes(response, MAX_ATTACHMENT_BYTES);
      } catch {
        status = 'failed';
      }
    } else if (allowed) {
      status = 'failed';
    }
    attachments.push({
      filename,
      contentType,
      sizeBytes: bytes?.byteLength || sizeBytes,
      contentId: cleanText(entry.content_id, 300) || null,
      disposition: entry.content_disposition === 'inline' ? 'inline' : 'attachment',
      bytes,
      status,
    });
  }

  return {
    id: safeId,
    to: Array.isArray(payload.to) ? payload.to.map(value => cleanText(value, 320)).filter(Boolean) : [],
    from: cleanText(payload.from, 320).toLowerCase(),
    fromName: displayName(headers.from),
    cc: Array.isArray(payload.cc) ? payload.cc.map(value => cleanText(value, 320)).filter(Boolean) : [],
    replyTo: Array.isArray(payload.reply_to)
      ? payload.reply_to.map(value => cleanText(value, 320)).filter(Boolean)
      : [],
    subject: cleanText(payload.subject, 998) || '(Fără subiect)',
    html,
    text,
    messageId: cleanText(payload.message_id, 998) || null,
    inReplyTo: cleanText(headers['in-reply-to'], 998) || null,
    createdAt: cleanText(payload.created_at, 80) || new Date().toISOString(),
    attachments,
  };
}
