export const TRANSACTION_TYPES = ['vanzare', 'inchiriere'] as const;
export const TRANSACTION_CURRENCIES = ['EUR', 'RON'] as const;

export function nonNegativeMoney(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null;
}

export function nextRemovalAttempt(attempts: number, now = Date.now()): string {
  const safeAttempts = Math.max(1, Math.min(8, Math.trunc(attempts)));
  const delayMinutes = Math.min(24 * 60, 5 * (2 ** (safeAttempts - 1)));
  return new Date(now + delayMinutes * 60_000).toISOString();
}

export function safePortalError(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value || 'Eroare portal necunoscută');
  return text.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 500);
}
