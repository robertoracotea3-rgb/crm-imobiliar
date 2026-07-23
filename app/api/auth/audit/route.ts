export const dynamic = 'force-dynamic';

import { appendAuditEvent } from '@/lib/server/audit-log';
import { getAdminClient, requireApiAuth } from '@/lib/server/api-auth';

const ACTIONS = {
  login: 'auth.login',
  logout: 'auth.logout',
} as const;
const failedAttemptWindows = new Map<string, { count: number; resetAt: number }>();

function allowFailedAttempt(request: Request): boolean {
  const now = Date.now();
  const key = (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown'
  ).slice(0, 64);
  const current = failedAttemptWindows.get(key);
  if (!current || current.resetAt <= now) {
    failedAttemptWindows.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  current.count += 1;
  return current.count <= 20;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const action = typeof body.action === 'string' ? body.action : '';
  if (action === 'login_failed') {
    const origin = request.headers.get('origin');
    const sameOrigin = !origin || origin === new URL(request.url).origin;
    const fetchSite = request.headers.get('sec-fetch-site');
    if (!sameOrigin || (fetchSite && !['same-origin', 'none'].includes(fetchSite))) {
      return Response.json({ error: 'Cerere invalidă.' }, { status: 403 });
    }
    if (!allowFailedAttempt(request)) {
      return Response.json({ accepted: true }, { status: 202 });
    }
    await appendAuditEvent({
      client: getAdminClient(),
      request,
      action: 'auth.login_failed',
      entityType: 'session',
      result: 'failure',
      reason: 'invalid_credentials',
      metadata: { provider: 'password', identifier_omitted: true },
    });
    return Response.json({ accepted: true }, { status: 202 });
  }

  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;
  if (!(action in ACTIONS)) {
    return Response.json({ error: 'Acțiune de autentificare invalidă.' }, { status: 400 });
  }
  const { serviceAdmin, agencyId, user, role } = auth.context;
  await appendAuditEvent({
    client: serviceAdmin,
    request,
    agencyId,
    actorUserId: user.id,
    actorRole: role,
    action: ACTIONS[action as keyof typeof ACTIONS],
    entityType: 'session',
    entityId: user.id,
    after: { authenticated: action === 'login' },
  });
  return Response.json({ success: true }, { status: 201 });
}
