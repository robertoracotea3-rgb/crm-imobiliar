export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, undefined, {
    allowMfaSetup: true,
    allowPasswordChange: true,
  });
  if (!auth.ok) return auth.response;

  const {
    serviceAdmin, user, agencyId, role, permissions, session,
  } = auth.context;
  const [{ data: profile }, { data: agency }] = await Promise.all([
    serviceAdmin
      .from('profiles')
      .select('full_name, status, force_password_change, mfa_enrolled_at')
      .eq('user_id', user.id)
      .eq('agency_id', agencyId)
      .single(),
    serviceAdmin.from('agencies').select('id, name').eq('id', agencyId).single(),
  ]);

  const nextPath = session.passwordChangeRequired
    ? '/auth/schimba-parola'
    : session.mfaRequired && session.aal !== 'aal2'
      ? '/auth/mfa'
      : null;

  return Response.json({
    user: {
      id: user.id,
      email: user.email || '',
      full_name: profile?.full_name || '',
    },
    agency,
    role,
    permissions,
    security: {
      aal: session.aal,
      mfa_required: session.mfaRequired,
      mfa_enrolled_at: profile?.mfa_enrolled_at || null,
      password_change_required: session.passwordChangeRequired,
      session_id: session.sessionId,
      session_created_at: session.createdAt,
      session_last_seen_at: session.lastSeenAt,
      next_path: nextPath,
    },
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
