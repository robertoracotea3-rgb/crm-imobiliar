export const MAIL_DOMAIN = 'kiraimobiliare.ro';
export const MAIL_LOCAL_PART_PATTERN = /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/;
export const MAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const RESERVED_MAIL_LOCAL_PARTS = new Set([
  'abuse',
  'admin',
  'administrator',
  'contact',
  'documente',
  'help',
  'info',
  'mail',
  'no-reply',
  'noreply',
  'office',
  'postmaster',
  'rapoarte',
  'root',
  'security',
  'support',
  'webmaster',
  'www',
]);

export function normalizeMailLocalPart(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/[._-]{2,}/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 30);
}

export function validateMailLocalPart(value: unknown): string | null {
  const localPart = normalizeMailLocalPart(value);
  if (!MAIL_LOCAL_PART_PATTERN.test(localPart)) {
    return 'Alege între 3 și 30 de caractere: litere mici, cifre, punct, cratimă sau underscore.';
  }
  if (RESERVED_MAIL_LOCAL_PARTS.has(localPart)) {
    return 'Această adresă este rezervată pentru funcțiile generale ale agenției.';
  }
  return null;
}

export function personalMailAddress(localPart: string): string {
  return `${normalizeMailLocalPart(localPart)}@${MAIL_DOMAIN}`;
}

export function cleanMailAddress(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase().slice(0, 320) : '';
}

export function parseMailRecipients(value: unknown, maximum = 20): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[;,\n]/)
      : [];
  const unique = [...new Set(raw.map(cleanMailAddress).filter(Boolean))];
  if (unique.length > maximum || unique.some(address => !MAIL_ADDRESS_PATTERN.test(address))) return [];
  return unique;
}

export function mailSnippet(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, 240)
    : '';
}
