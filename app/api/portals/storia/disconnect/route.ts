import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/server/api-auth';

// DELETE /api/portals/storia/disconnect
// OLX does not document a remote revocation endpoint. This local revocation
// immediately removes every stored credential and requires explicit reconnect.
export async function DELETE(request: Request) {
  const auth = await requireApiAuth(request, { module: 'portals', action: 'delete' });
  if (!auth.ok) return auth.response;
  const { serviceAdmin, agencyId, user } = auth.context;

  const { data: revoked, error } = await serviceAdmin.rpc(
    'crm_revoke_portal_connection',
    {
      p_agency_id: agencyId,
      p_portal: 'storia',
      p_actor_id: user.id,
      p_reason: 'user_disconnect',
    },
  );
  if (error) {
    return NextResponse.json(
      { error: 'Contul Storia nu a putut fi deconectat.' },
      { status: 500 },
    );
  }
  if (revoked !== true) {
    return NextResponse.json({ error: 'Contul Storia nu este conectat.' }, { status: 404 });
  }
  return NextResponse.json(
    { success: true },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
