import { createHash, randomBytes } from 'node:crypto';

const TOKEN_PREFIX = 'kira_feed_';
const MAX_TOKEN_LENGTH = 160;

export function hashFeedToken(token: string): string {
  const value = String(token || '').trim();
  if (!value.startsWith(TOKEN_PREFIX) || value.length > MAX_TOKEN_LENGTH) return '';
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function maskFeedToken(token: string): string {
  const value = String(token || '').trim();
  return value.length > 18 ? `${value.slice(0, 18)}…` : `${value}…`;
}

export function createFeedToken(): { token: string; tokenHash: string; tokenPrefix: string } {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
  return {
    token,
    tokenHash: hashFeedToken(token),
    tokenPrefix: maskFeedToken(token),
  };
}
