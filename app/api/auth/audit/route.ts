export const dynamic = 'force-dynamic';

import { appendAuditEvent } from '@/lib/server/audit-log';
import { requireApiAuth } from '@/lib/server/api-auth';

const ACTIONS = {
  logout: 'auth.logout',
} as const;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const action = typeof body.action === 'string' ? body.action : '';

  const auth = await requireApiAuth(request, undefined, {
    allowMfaSetup: true,
    allowPasswordChange: true,
  });
  if (!auth.ok) return auth.response;
  if (!(action in ACTIONS)) {
    return Response.json({ error: 'Acțiune de autentificare invalidă.' }, { status: 400 });
  }
  const { serviceAdmin, agencyId, user, role } = auth.context;
  await serviceAdmin.from('crm_user_sessions').update({
    revoked_at: new Date().toISOString(),
    revoked_by: user.id,
    revoked_reason: 'user_logout_local',
    updated_at: new Date().toISOString(),
  }).eq('session_id', auth.context.session.sessionId).eq('user_id', user.id);
  await appendAuditEvent({
    client: serviceAdmin,
    request,
    agencyId,
    actorUserId: user.id,
    actorRole: role,
    action: ACTIONS[action as keyof typeof ACTIONS],
    entityType: 'session',
    entityId: user.id,
    after: { authenticated: false, scope: 'local' },
  });
  return Response.json({ success: true }, { status: 201 });
}
