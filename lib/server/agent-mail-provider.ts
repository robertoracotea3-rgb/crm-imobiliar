import 'server-only';

import { MAIL_ADDRESS_PATTERN } from '@/lib/mail';

const RESEND_SEND_API = 'https://api.resend.com/emails';

export type AgentMailSendInput = {
  fromEmail: string;
  senderName: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string | null;
  subject: string;
  text: string;
  html: string;
  inReplyTo?: string | null;
  idempotencyKey: string;
};

export type AgentMailSendResult = {
  accepted: boolean;
  provider: 'resend';
  messageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

function providerKey(): string {
  return String(process.env.RESEND_API_KEY || '').trim();
}

function safeError(value: unknown): string {
  const text = value && typeof value === 'object' && 'message' in value
    ? String(value.message)
    : typeof value === 'string'
      ? value
      : 'Furnizorul de e-mail a refuzat mesajul.';
  return text
    .replace(/(?:api[_ -]?key|bearer)\s*[:=]?\s*[A-Za-z0-9._~-]+/gi, '[SECRET REDACTAT]')
    .slice(0, 1000);
}

function invalidInput(input: AgentMailSendInput): string | null {
  const recipients = [...input.to, ...(input.cc || []), ...(input.bcc || [])];
  if (!MAIL_ADDRESS_PATTERN.test(input.fromEmail)) return 'Adresa expeditorului este invalidă.';
  if (!input.to.length || recipients.length > 20 || recipients.some(email => !MAIL_ADDRESS_PATTERN.test(email))) {
    return 'Destinatarii sunt invalizi sau depășesc limita de 20.';
  }
  if (!input.subject.trim() || input.subject.length > 998) return 'Subiectul este invalid.';
  if (!input.text.trim() || input.text.length > 2_000_000) return 'Conținutul mesajului este invalid.';
  return null;
}

export async function sendAgentMail(
  input: AgentMailSendInput,
  fetchImpl: typeof fetch = fetch,
): Promise<AgentMailSendResult> {
  const invalid = invalidInput(input);
  if (invalid) {
    return {
      accepted: false,
      provider: 'resend',
      messageId: null,
      errorCode: 'invalid_input',
      errorMessage: invalid,
    };
  }

  const apiKey = providerKey();
  if (!apiKey) {
    return {
      accepted: false,
      provider: 'resend',
      messageId: null,
      errorCode: 'provider_not_configured',
      errorMessage: 'Trimiterea va deveni activă după configurarea cheii Resend.',
    };
  }

  const customHeaders: Record<string, string> = {
    'X-Kira-Idempotency-Key': input.idempotencyKey,
  };
  if (input.inReplyTo) {
    customHeaders['In-Reply-To'] = input.inReplyTo;
    customHeaders.References = input.inReplyTo;
  }

  try {
    const response = await fetchImpl(RESEND_SEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
        'User-Agent': 'Kira-CRM/1.0',
      },
      body: JSON.stringify({
        from: `${input.senderName.trim().slice(0, 120)} <${input.fromEmail}>`,
        to: input.to,
        cc: input.cc || [],
        bcc: input.bcc || [],
        reply_to: input.replyTo || undefined,
        subject: input.subject.trim(),
        text: input.text,
        html: input.html,
        headers: customHeaders,
        tags: [{ name: 'source', value: 'kira_crm' }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => ({})) as {
      id?: string;
      name?: string;
      message?: string;
    };
    const accepted = response.ok && typeof payload.id === 'string';
    return {
      accepted,
      provider: 'resend',
      messageId: accepted ? payload.id || null : null,
      errorCode: accepted
        ? null
        : typeof payload.name === 'string'
          ? payload.name.slice(0, 120)
          : `http_${response.status}`,
      errorMessage: accepted ? null : safeError(payload.message || 'Trimiterea nu a fost acceptată.'),
    };
  } catch (error) {
    return {
      accepted: false,
      provider: 'resend',
      messageId: null,
      errorCode: 'provider_unreachable',
      errorMessage: safeError(error),
    };
  }
}
