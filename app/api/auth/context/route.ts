export const dynamic = 'force-dynamic';

import { contextHasPermission, requireApiAuth } from '@/lib/server/api-auth';
import { mailOnboardingEnabled, mailboxAddressForUser } from '@/lib/server/mail-feature';

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, undefined, {
    allowMfaSetup: true,
    allowPasswordChange: true,
  });
  if (!auth.ok) return auth.response;

  const {
    serviceAdmin, user, agencyId, role, permissions, session,
  } = auth.context;
  const [{ data: profile }, { data: agency }, mailboxAddress] = await Promise.all([
    serviceAdmin
      .from('profiles')
      .select('full_name, status, force_password_change, mfa_enrolled_at')
      .eq('user_id', user.id)
      .eq('agency_id', agencyId)
      .single(),
    serviceAdmin.from('agencies').select('id, name').eq('id', agencyId).single(),
    mailboxAddressForUser(serviceAdmin, agencyId, user.id).catch(() => undefined),
  ]);

  const mailboxRequired = mailOnboardingEnabled()
    && contextHasPermission(auth.context, 'mail', 'create')
    && mailboxAddress === null;
  const nextPath = session.passwordChangeRequired
    ? '/auth/schimba-parola'
    : session.mfaRequired && session.aal !== 'aal2'
      ? '/auth/mfa'
      : mailboxRequired
        ? '/auth/email-setup'
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
      mailbox_required: mailboxRequired,
      mailbox_address: mailboxAddress || null,
      session_id: session.sessionId,
      session_created_at: session.createdAt,
      session_last_seen_at: session.lastSeenAt,
      next_path: nextPath,
    },
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
