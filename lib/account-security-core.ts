import { createHash } from 'node:crypto';

export interface AccessTokenClaims {
  sessionId: string;
  subject: string;
  aal: 'aal1' | 'aal2';
  issuedAt: string;
  expiresAt: string;
}

function securitySalt(): string {
  const salt = process.env.AUTH_SECURITY_HASH_SALT || '';
  if (salt.length < 32) {
    throw new Error('AUTH_SECURITY_HASH_SALT trebuie să aibă minimum 32 de caractere.');
  }
  return salt;
}

export function hashSecurityValue(scope: string, value: string): string {
  return createHash('sha256')
    .update(securitySalt())
    .update('\0')
    .update(scope)
    .update('\0')
    .update(value.trim().toLowerCase())
    .digest('hex');
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function verifiedAccessTokenClaims(token: string, verifiedUserId: string): AccessTokenClaims | null {
  const payload = parseJwtPayload(token);
  const sessionId = typeof payload?.session_id === 'string' ? payload.session_id : '';
  const subject = typeof payload?.sub === 'string' ? payload.sub : '';
  const aal = payload?.aal === 'aal2' ? 'aal2' : 'aal1';
  const issued = typeof payload?.iat === 'number' ? payload.iat : 0;
  const expires = typeof payload?.exp === 'number' ? payload.exp : 0;
  if (
    subject !== verifiedUserId
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)
    || issued <= 0
    || expires <= issued
  ) {
    return null;
  }
  return {
    sessionId,
    subject,
    aal,
    issuedAt: new Date(issued * 1_000).toISOString(),
    expiresAt: new Date(expires * 1_000).toISOString(),
  };
}
