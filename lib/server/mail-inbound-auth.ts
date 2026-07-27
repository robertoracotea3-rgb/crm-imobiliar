import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function verifyMailInboundAuthorization(request: Request): boolean {
  const configured = String(process.env.MAIL_INBOUND_SECRET || '').trim();
  if (configured.length < 32) return false;
  const authorization = request.headers.get('authorization') || '';
  const provided = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  return timingSafeEqual(digest(configured), digest(provided));
}
