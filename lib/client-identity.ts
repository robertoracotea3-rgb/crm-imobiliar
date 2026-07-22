export type ClientIdentity = {
  phone?: string | null;
  email?: string | null;
  portal?: string | null;
  portalClientId?: string | null;
};

export type NormalizedClientIdentity = {
  phone: string | null;
  email: string | null;
  portal: string | null;
  portalClientId: string | null;
};

export type IdentityMatch = {
  score: number;
  reasons: string[];
  safe: boolean;
};

/**
 * Canonical E.164 digits without the leading plus. Romanian mobile numbers
 * written as 07xxxxxxxx are converted to 407xxxxxxxx. Invalid/short values
 * are deliberately ignored instead of being used for identity matching.
 */
export function normalizeClientPhone(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  let digits = raw.replace(/^tel:/i, '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (/^07\d{8}$/.test(digits)) digits = `4${digits}`;

  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

export function normalizeClientEmail(value: unknown): string | null {
  const email = String(value ?? '').trim().toLocaleLowerCase('en-US');
  if (!email || email.length > 320) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function normalizePortalIdentityPart(value: unknown): string | null {
  const normalized = String(value ?? '').trim().toLocaleLowerCase('en-US');
  return normalized ? normalized.slice(0, 255) : null;
}

export function normalizeClientIdentity(identity: ClientIdentity): NormalizedClientIdentity {
  return {
    phone: normalizeClientPhone(identity.phone),
    email: normalizeClientEmail(identity.email),
    portal: normalizePortalIdentityPart(identity.portal),
    portalClientId: normalizePortalIdentityPart(identity.portalClientId),
  };
}

export function compareClientIdentities(
  left: ClientIdentity,
  right: ClientIdentity,
): IdentityMatch {
  const a = normalizeClientIdentity(left);
  const b = normalizeClientIdentity(right);
  const reasons: string[] = [];

  if (a.phone && b.phone && a.phone === b.phone) reasons.push('same_phone');
  if (a.email && b.email && a.email === b.email) reasons.push('same_email');
  if (
    a.portal && b.portal && a.portal === b.portal
    && a.portalClientId && b.portalClientId
    && a.portalClientId === b.portalClientId
  ) reasons.push('same_portal_client');

  const score = reasons.includes('same_portal_client')
    ? 100
    : reasons.length >= 2
      ? 100
      : reasons.includes('same_phone')
        ? 95
        : reasons.includes('same_email')
          ? 90
          : 0;

  return { score, reasons, safe: score >= 90 };
}

export function identityLookupKeys(identity: ClientIdentity): string[] {
  const normalized = normalizeClientIdentity(identity);
  return [
    normalized.phone ? `phone:${normalized.phone}` : null,
    normalized.email ? `email:${normalized.email}` : null,
    normalized.portal && normalized.portalClientId
      ? `portal:${normalized.portal}:${normalized.portalClientId}`
      : null,
  ].filter((value): value is string => Boolean(value));
}
