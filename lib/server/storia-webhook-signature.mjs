import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const OLX_SIGNATURE_HEADER = 'x-signature';

/**
 * OLX signs the UTF-8 string "<OBJECT_ID>,<TRANSACTION_ID>" with HMAC-SHA1.
 * This intentionally follows the marketplace specification rather than signing
 * the raw request body.
 */
export function computeOlxWebhookSignature({ objectId, transactionId, secret }) {
  if (!objectId || !transactionId || !secret) {
    throw new TypeError('objectId, transactionId and secret are required');
  }

  return createHmac('sha1', secret)
    .update(`${objectId},${transactionId}`, 'utf8')
    .digest('hex');
}

export function verifyOlxWebhookSignature({ signature, objectId, transactionId, secret }) {
  if (!secret) return { ok: false, reason: 'missing_secret' };
  if (!signature) return { ok: false, reason: 'missing_signature' };
  if (!objectId || !transactionId) return { ok: false, reason: 'missing_identifiers' };

  const normalizedSignature = String(signature).trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(normalizedSignature)) {
    return { ok: false, reason: 'invalid_signature_format' };
  }

  const expected = Buffer.from(
    computeOlxWebhookSignature({ objectId, transactionId, secret }),
    'hex',
  );
  const actual = Buffer.from(normalizedSignature, 'hex');

  return timingSafeEqual(expected, actual)
    ? { ok: true, reason: null }
    : { ok: false, reason: 'invalid_signature' };
}

export function hashWebhookPayload(rawPayload) {
  return createHash('sha256').update(String(rawPayload ?? ''), 'utf8').digest('hex');
}
