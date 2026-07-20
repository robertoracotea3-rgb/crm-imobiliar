export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'settings', action: 'view' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, serviceAdmin, agencyId, user } = auth.context;

    const { data: agency } = await admin.from('agencies')
      .select('id, name, created_at, settings')
      .eq('id', agencyId)
      .single();

    const { data: authUser } = await serviceAdmin.auth.admin.getUserById(user.id);
    const { data: profile } = await admin
      .from('profiles')
      .select('agency_id, role, full_name, user_id')
      .eq('user_id', user.id)
      .eq('agency_id', agencyId)
      .single();
    const meta = authUser?.user?.user_metadata || {};
    const wm = (agency?.settings as Record<string, unknown>)?.watermark as Record<string, unknown> | undefined;

    return Response.json({
      agency: agency ? {
        id: agency.id,
        name: agency.name,
        created_at: agency.created_at,
        watermark: {
          enabled: !!wm?.enabled,
          logo_url: (wm?.logo_url as string) || null,
        },
      } : null,
      profile: profile ? {
        ...profile,
        email: authUser?.user?.email || '',
        phone: meta.phone || '',
        job_title: meta.job_title || '',
      } : null,
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(request, { module: 'settings', action: 'edit' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, serviceAdmin, agencyId, user } = auth.context;
    const body = await request.json();
    const { full_name, phone, job_title, agency_name, watermark_enabled } = body;
    if (typeof watermark_enabled === 'boolean') {
      const { data: agency } = await admin.from('agencies').select('settings').eq('id', agencyId).single();
      const settings = (agency?.settings as Record<string, unknown>) || {};
      const watermark = { ...((settings.watermark as Record<string, unknown>) || {}), enabled: watermark_enabled };
      await admin.from('agencies').update({ settings: { ...settings, watermark } }).eq('id', agencyId);
    }

    await Promise.all([
      ...(full_name !== undefined ? [
        serviceAdmin.from('profiles').update({ full_name: full_name?.trim() || null }).eq('user_id', user.id).eq('agency_id', agencyId),
      ] : []),
      ...(full_name !== undefined || phone !== undefined || job_title !== undefined ? [
        serviceAdmin.auth.admin.updateUserById(user.id, {
          user_metadata: {
            full_name: full_name?.trim(),
            phone: phone?.trim(),
            job_title: job_title?.trim(),
          },
        }),
      ] : []),
      ...(agency_name ? [
        admin.from('agencies').update({ name: agency_name.trim() }).eq('id', agencyId),
      ] : []),
    ]);

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
