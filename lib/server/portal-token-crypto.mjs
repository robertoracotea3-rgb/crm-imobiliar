import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const TOKEN_FORMAT = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const OAUTH_STATE_BYTES = 32;

function decodeKey(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) throw new Error('portal_token_encryption_key_missing');

  let key;
  if (/^[a-f0-9]{64}$/i.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    try {
      key = Buffer.from(raw, 'base64');
    } catch {
      throw new Error('portal_token_encryption_key_invalid');
    }
  }

  if (key.length !== 32) throw new Error('portal_token_encryption_key_invalid');
  return key;
}

function tokenContext({ agencyId, portal, purpose }) {
  if (!agencyId || !portal || !purpose) throw new Error('portal_token_context_invalid');
  return `${TOKEN_FORMAT}\0${agencyId}\0${portal}\0${purpose}`;
}

export function createPortalTokenEncryptionKey() {
  return randomBytes(32).toString('base64');
}

export function encryptPortalToken(plaintext, context, keyValue = process.env.PORTAL_TOKEN_ENCRYPTION_KEY) {
  if (typeof plaintext !== 'string' || !plaintext) throw new Error('portal_token_plaintext_invalid');
  const key = decodeKey(keyValue);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(tokenContext(context), 'utf8'));
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    TOKEN_FORMAT,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptPortalToken(ciphertext, context, keyValue = process.env.PORTAL_TOKEN_ENCRYPTION_KEY) {
  const parts = String(ciphertext || '').split('.');
  if (parts.length !== 4 || parts[0] !== TOKEN_FORMAT) {
    throw new Error('portal_token_ciphertext_invalid');
  }
  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  const encrypted = Buffer.from(parts[3], 'base64url');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || !encrypted.length) {
    throw new Error('portal_token_ciphertext_invalid');
  }

  try {
    const decipher = createDecipheriv('aes-256-gcm', decodeKey(keyValue), iv, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(Buffer.from(tokenContext(context), 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('portal_token_encryption_key_')) {
      throw error;
    }
    throw new Error('portal_token_decryption_failed');
  }
}

export function createOAuthState() {
  return randomBytes(OAUTH_STATE_BYTES).toString('base64url');
}

export function isValidOAuthState(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function hashOAuthState(value) {
  if (!isValidOAuthState(value)) throw new Error('portal_oauth_state_invalid');
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function hashAuthenticatedSession(bearerToken) {
  const token = String(bearerToken || '').trim();
  if (!token) throw new Error('portal_oauth_session_missing');
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function portalTokenEncryptionConfigured(keyValue = process.env.PORTAL_TOKEN_ENCRYPTION_KEY) {
  try {
    decodeKey(keyValue);
    return true;
  } catch {
    return false;
  }
}
