import { redactAuditValue } from './audit-values.ts';

const CODE_RE = /^[a-z][a-z0-9_.:-]{1,119}$/;
const SECRET_ASSIGNMENT_RE = /\b(password|passwd|token|secret|authorization|cookie|api[-_ ]?key)\b\s*[:=]\s*[^\s,;]+/gi;
const BEARER_RE = /\bbearer\s+[a-z0-9._~+/-]+=*/gi;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

export function safeObservationCode(
  value: string | null | undefined,
  fallback: string,
): string {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_.:-]+/g, '_');
  return CODE_RE.test(normalized) ? normalized : fallback;
}

export function sanitizeObservationMessage(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value || 'Eroare necunoscută');
  return message
    .replace(BEARER_RE, 'Bearer [REDACTED]')
    .replace(SECRET_ASSIGNMENT_RE, '$1=[REDACTED]')
    .replace(EMAIL_RE, '[EMAIL_REDACTED]')
    .slice(0, 500);
}

export function sanitizeObservationMetadata(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const redacted = redactAuditValue(value || {});
  if (!redacted || typeof redacted !== 'object' || Array.isArray(redacted)) return {};
  const scrub = (nested: unknown): unknown => {
    if (typeof nested === 'string') return sanitizeObservationMessage(nested);
    if (Array.isArray(nested)) return nested.map(scrub);
    if (nested && typeof nested === 'object') {
      return Object.fromEntries(
        Object.entries(nested as Record<string, unknown>).map(([key, item]) => [key, scrub(item)]),
      );
    }
    return nested;
  };
  return scrub(redacted) as Record<string, unknown>;
}
