export const dynamic = 'force-dynamic';

import { appendAuditEvent } from '@/lib/server/audit-log';
import { requireApiAuth } from '@/lib/server/api-auth';

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, undefined, {
    allowMfaSetup: true,
    allowPasswordChange: true,
  });
  if (!auth.ok) return auth.response;
  const {
    serviceAdmin, user, agencyId, session,
  } = auth.context;

  const { data, error } = await serviceAdmin
    .from('crm_user_sessions')
    .select('session_id, aal, created_at, last_seen_at, token_expires_at, user_agent, ip_hash, revoked_at, revoked_reason')
    .eq('user_id', user.id)
    .eq('agency_id', agencyId)
    .order('last_seen_at', { ascending: false })
    .limit(50);
  if (error) return Response.json({ error: 'Sesiunile nu au putut fi încărcate.' }, { status: 500 });

  return Response.json({
    sessions: (data || []).map(item => ({
      session_id: item.session_id,
      aal: item.aal,
      created_at: item.created_at,
      last_seen_at: item.last_seen_at,
      token_expires_at: item.token_expires_at,
      user_agent: item.user_agent || 'Dispozitiv necunoscut',
      ip_recorded: Boolean(item.ip_hash),
      revoked_at: item.revoked_at,
      revoked_reason: item.revoked_reason,
      current: item.session_id === session.sessionId,
    })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(request: Request) {
  const auth = await requireApiAuth(request, undefined, {
    allowMfaSetup: true,
    allowPasswordChange: true,
  });
  if (!auth.ok) return auth.response;
  const {
    serviceAdmin, user, agencyId, accessToken, session, role,
  } = auth.context;
  const body = await request.json().catch(() => ({}));
  const scope = body.scope === 'others' ? 'others' : body.scope === 'global' ? 'global' : null;
  if (!scope) return Response.json({ error: 'Acțiune de sesiune invalidă.' }, { status: 400 });

  let update = serviceAdmin
    .from('crm_user_sessions')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: user.id,
      revoked_reason: scope === 'others' ? 'user_logout_others' : 'user_logout_global',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .eq('agency_id', agencyId)
    .is('revoked_at', null);
  if (scope === 'others') update = update.neq('session_id', session.sessionId);
  const { error: updateError } = await update;
  if (updateError) return Response.json({ error: 'Sesiunile nu au putut fi revocate.' }, { status: 500 });

  const { error: signOutError } = await serviceAdmin.auth.admin.signOut(accessToken, scope);
  if (signOutError) {
    return Response.json({ error: 'Revocarea Supabase nu a putut fi confirmată.' }, { status: 502 });
  }
  await appendAuditEvent({
    client: serviceAdmin,
    request,
    agencyId,
    actorUserId: user.id,
    actorRole: role,
    action: scope === 'others' ? 'auth.sessions_others_revoked' : 'auth.sessions_all_revoked',
    entityType: 'session',
    entityId: session.sessionId,
    after: { scope },
  });
  return Response.json({ success: true, scope });
}
