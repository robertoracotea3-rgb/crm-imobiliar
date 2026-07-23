import { createHash } from 'node:crypto';

const SECRET_KEY = /(password|passwd|token|secret|authorization|cookie|api.?key|refresh.?token|access.?token)/i;
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 100;
const MAX_OBJECT_KEYS = 100;
const MAX_STRING_LENGTH = 2_000;

export function redactAuditValue(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, MAX_STRING_LENGTH);
  if (depth >= MAX_DEPTH) return '[TRUNCATED]';
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map(item => redactAuditValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, MAX_OBJECT_KEYS)
        .map(([key, nested]) => [
          key,
          SECRET_KEY.test(key) ? '[REDACTED]' : redactAuditValue(nested, depth + 1),
        ]),
    );
  }
  return String(value).slice(0, MAX_STRING_LENGTH);
}

export function normalizedForwardedIp(value: string | null): string | null {
  const candidate = value?.split(',')[0]?.trim() || '';
  if (!candidate || candidate.length > 64 || !/^[0-9a-f:.]+$/i.test(candidate)) return null;
  return candidate.toLowerCase();
}

export function hashAuditIp(ip: string | null, salt: string | undefined): string | null {
  if (!ip || !salt || salt.length < 16) return null;
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

export function auditSnapshot(
  value: Record<string, unknown> | null | undefined,
  fields: readonly string[],
): Record<string, unknown> | null {
  if (!value) return null;
  return Object.fromEntries(fields
    .filter(field => Object.prototype.hasOwnProperty.call(value, field))
    .map(field => [field, redactAuditValue(value[field])]));
}
