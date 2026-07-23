import { createHash, timingSafeEqual } from 'node:crypto';

function digest(value) {
  return createHash('sha256').update(String(value || ''), 'utf8').digest();
}

export function verifyCronAuthorization(headerValue, secretValue) {
  const secret = String(secretValue || '');
  if (secret.length < 16) return false;
  const expected = `Bearer ${secret}`;
  const actualDigest = digest(headerValue);
  const expectedDigest = digest(expected);
  return timingSafeEqual(actualDigest, expectedDigest);
}
