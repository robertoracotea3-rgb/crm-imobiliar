import 'server-only';

const RESEND_API = 'https://api.resend.com';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailAttachment = {
  filename: string;
  contentBase64: string;
  contentType?: string;
};

export type SendEmailInput = {
  fromEmail: string;
  senderName: string;
  to: string[];
  replyTo?: string | null;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
  attachments?: EmailAttachment[];
};

export type EmailProviderResult = {
  accepted: boolean;
  provider: 'resend';
  messageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

function providerKey(): string {
  return String(process.env.EMAIL_PROVIDER_API_KEY || process.env.RESEND_API_KEY || '').trim();
}

function safeProviderError(value: unknown): string {
  const message = value && typeof value === 'object' && 'message' in value
    ? String(value.message)
    : 'Furnizorul de e-mail a refuzat mesajul.';
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
    .slice(0, 1000);
}

function validInput(input: SendEmailInput): string | null {
  if (!EMAIL_PATTERN.test(input.fromEmail)) return 'Adresa expeditorului este invalidă.';
  if (!input.to.length || input.to.some((email) => !EMAIL_PATTERN.test(email))) {
    return 'Adresa destinatarului este invalidă.';
  }
  if (!input.subject.trim() || input.subject.length > 300) return 'Subiectul e-mailului este invalid.';
  if (!input.html.trim() || !input.text.trim()) return 'Conținutul e-mailului lipsește.';
  if (input.attachments?.some((attachment) =>
    !attachment.filename
    || !attachment.contentBase64
    || attachment.contentBase64.length > 15_000_000
  )) return 'Atașamentul este invalid sau prea mare.';
  return null;
}

export async function sendOperationalEmail(
  input: SendEmailInput,
  fetchImpl: typeof fetch = fetch,
): Promise<EmailProviderResult> {
  const invalid = validInput(input);
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
      errorMessage: 'Lipsește EMAIL_PROVIDER_API_KEY sau RESEND_API_KEY.',
    };
  }

  try {
    const response = await fetchImpl(`${RESEND_API}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey || crypto.randomUUID(),
      },
      body: JSON.stringify({
        from: `${input.senderName.trim().slice(0, 120)} <${input.fromEmail}>`,
        to: input.to,
        reply_to: input.replyTo || undefined,
        subject: input.subject.trim(),
        html: input.html,
        text: input.text,
        attachments: input.attachments?.map((attachment) => ({
          filename: attachment.filename.slice(0, 180),
          content: attachment.contentBase64,
          content_type: attachment.contentType,
        })),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok || typeof payload.id !== 'string') {
      return {
        accepted: false,
        provider: 'resend',
        messageId: null,
        errorCode: typeof payload.name === 'string' ? payload.name.slice(0, 120) : `http_${response.status}`,
        errorMessage: safeProviderError(payload),
      };
    }
    return {
      accepted: true,
      provider: 'resend',
      messageId: payload.id,
      errorCode: null,
      errorMessage: null,
    };
  } catch (error) {
    return {
      accepted: false,
      provider: 'resend',
      messageId: null,
      errorCode: 'provider_unreachable',
      errorMessage: safeProviderError(error),
    };
  }
}

export async function verifyEmailProviderDomain(
  domain: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ verified: boolean; status: string; error: string | null }> {
  if (domain !== 'kiraimobiliare.ro') {
    return { verified: false, status: 'failed', error: 'Domeniul nu este permis.' };
  }
  const apiKey = providerKey();
  if (!apiKey) {
    return { verified: false, status: 'unconfirmed', error: 'Furnizorul nu este configurat.' };
  }
  try {
    const response = await fetchImpl(`${RESEND_API}/domains`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => ({})) as {
      data?: Array<{ name?: string; status?: string }>;
      message?: string;
    };
    if (!response.ok) {
      return { verified: false, status: 'failed', error: safeProviderError(payload) };
    }
    const item = payload.data?.find((candidate) => candidate.name === domain);
    const status = String(item?.status || 'unconfirmed').toLowerCase();
    return {
      verified: status === 'verified',
      status: status === 'verified' ? 'verified' : status === 'failed' ? 'failed' : 'pending',
      error: item ? null : 'Domeniul nu există în contul furnizorului.',
    };
  } catch (error) {
    return { verified: false, status: 'failed', error: safeProviderError(error) };
  }
}
