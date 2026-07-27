import 'server-only';

import { MAIL_ADDRESS_PATTERN } from '@/lib/mail';

const SMTP2GO_SEND_API = 'https://api.smtp2go.com/v3/email/send';

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
  provider: 'smtp2go';
  messageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

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
      provider: 'smtp2go',
      messageId: null,
      errorCode: 'invalid_input',
      errorMessage: invalid,
    };
  }

  const apiKey = String(process.env.SMTP2GO_API_KEY || '').trim();
  if (!apiKey) {
    return {
      accepted: false,
      provider: 'smtp2go',
      messageId: null,
      errorCode: 'provider_not_configured',
      errorMessage: 'Trimiterea va deveni activă după configurarea cheii SMTP2GO.',
    };
  }

  const customHeaders = [
    ...(input.replyTo ? [{ header: 'Reply-To', value: input.replyTo }] : []),
    ...(input.inReplyTo ? [
      { header: 'In-Reply-To', value: input.inReplyTo },
      { header: 'References', value: input.inReplyTo },
    ] : []),
    { header: 'X-Kira-Idempotency-Key', value: input.idempotencyKey },
  ];

  try {
    const response = await fetchImpl(SMTP2GO_SEND_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Smtp2go-Api-Key': apiKey,
      },
      body: JSON.stringify({
        sender: `${input.senderName.trim().slice(0, 120)} <${input.fromEmail}>`,
        to: input.to,
        cc: input.cc || [],
        bcc: input.bcc || [],
        subject: input.subject.trim(),
        text_body: input.text,
        html_body: input.html,
        custom_headers: customHeaders,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => ({})) as {
      data?: { succeeded?: number; failed?: number; email_id?: string };
      error?: string;
      error_code?: string;
    };
    const accepted = response.ok && Number(payload.data?.succeeded || 0) > 0;
    return {
      accepted,
      provider: 'smtp2go',
      messageId: typeof payload.data?.email_id === 'string' ? payload.data.email_id : null,
      errorCode: accepted
        ? null
        : typeof payload.error_code === 'string'
          ? payload.error_code.slice(0, 120)
          : `http_${response.status}`,
      errorMessage: accepted ? null : safeError(payload.error || 'Trimiterea nu a fost acceptată.'),
    };
  } catch (error) {
    return {
      accepted: false,
      provider: 'smtp2go',
      messageId: null,
      errorCode: 'provider_unreachable',
      errorMessage: safeError(error),
    };
  }
}
