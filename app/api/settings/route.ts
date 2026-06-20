export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getCallerProfile(token: string) {
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) throw new Error('Sesiune invalida');
  const { data: profile } = await admin.from('profiles')
    .select('agency_id, role, full_name, user_id')
    .eq('user_id', user.id).single();
  if (!profile?.agency_id) throw new Error('Agentie negasita');
  return { user, profile };
}

export async function GET(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });
    const { profile } = await getCallerProfile(token);

    const { data: agency } = await admin.from('agencies')
      .select('id, name, created_at, settings')
      .eq('id', profile.agency_id).single();

    const { data: authUser } = await admin.auth.admin.getUserById(profile.user_id);
    const meta = authUser?.user?.user_metadata || {};

    const wm = (agency?.settings as Record<string, unknown>)?.watermark as Record<string, unknown> | undefined;

    return Response.json({
      agency: agency ? {
        id: agency.id, name: agency.name, created_at: agency.created_at,
        watermark: {
          enabled:  !!wm?.enabled,
          logo_url: (wm?.logo_url as string) || null,
        },
      } : null,
      profile: {
        ...profile,
        email: authUser?.user?.email || '',
        phone: meta.phone || '',
        job_title: meta.job_title || '',
      },
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });
    const { user, profile } = await getCallerProfile(token);

    const body = await request.json();
    const { full_name, phone, job_title, agency_name, watermark_enabled } = body;
    const isManager = ['owner', 'admin'].includes(profile.role);

    // Toggling the global watermark flag is owner/admin only; merge into agencies.settings.
    if (typeof watermark_enabled === 'boolean' && isManager) {
      const { data: agency } = await admin.from('agencies').select('settings').eq('id', profile.agency_id).single();
      const settings = (agency?.settings as Record<string, unknown>) || {};
      const watermark = { ...(settings.watermark as Record<string, unknown> || {}), enabled: watermark_enabled };
      await admin.from('agencies').update({ settings: { ...settings, watermark } }).eq('id', profile.agency_id);
    }

    await Promise.all([
      ...(full_name !== undefined ? [admin.from('profiles').update({ full_name: full_name?.trim() || null }).eq('user_id', user.id)] : []),
      ...(full_name !== undefined || phone !== undefined || job_title !== undefined
        ? [admin.auth.admin.updateUserById(user.id, {
            user_metadata: { full_name: full_name?.trim(), phone: phone?.trim(), job_title: job_title?.trim() },
          })]
        : []),
      ...(agency_name && isManager
        ? [admin.from('agencies').update({ name: agency_name.trim() }).eq('id', profile.agency_id)]
        : []),
    ]);

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
