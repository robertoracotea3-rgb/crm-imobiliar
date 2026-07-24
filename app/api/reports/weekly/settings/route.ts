export const dynamic = 'force-dynamic';

import { appendAuditEvent } from '@/lib/server/audit-log';
import { requireApiAuth } from '@/lib/server/api-auth';

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(request, { module: 'settings', action: 'edit' });
  if (!auth.ok) return auth.response;
  const { serviceAdmin, agencyId, user } = auth.context;
  try {
    const body = await request.json().catch(() => ({}));
    const weekday = Number(body.weekday);
    const localTime = String(body.local_time || '');
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return Response.json({ error: 'Ziua raportului este invalidă.' }, { status: 400 });
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(localTime)) {
      return Response.json({ error: 'Ora raportului este invalidă.' }, { status: 400 });
    }
    const patch = {
      agency_id: agencyId,
      enabled: body.enabled === true,
      weekday,
      local_time: localTime,
      timezone: 'Europe/Bucharest',
      include_pdf: body.include_pdf !== false,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    };
    const { data, error } = await serviceAdmin.from('agency_weekly_report_settings')
      .upsert(patch, { onConflict: 'agency_id' }).select('*').single();
    if (error) throw new Error(error.message);
    await appendAuditEvent({
      client: serviceAdmin,
      request,
      agencyId,
      actorUserId: user.id,
      actorRole: auth.context.role,
      action: 'weekly_report.settings_updated',
      entityType: 'agency_weekly_report_settings',
      entityId: agencyId,
      after: patch,
    });
    return Response.json({ settings: data });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : 'Programarea nu a putut fi salvată.',
    }, { status: 500 });
  }
}
