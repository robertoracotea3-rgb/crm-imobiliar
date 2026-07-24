export const dynamic = 'force-dynamic';

import { appendAuditEvent } from '@/lib/server/audit-log';
import { requireApiAuth } from '@/lib/server/api-auth';
import {
  generateWeeklyReport,
  processWeeklyReportEmails,
  queueWeeklyReportEmail,
} from '@/lib/server/weekly-reports';
import { scheduledWeeklyPeriod } from '@/lib/weekly-report-period';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'reports', action: 'view' });
  if (!auth.ok) return auth.response;
  const { serviceAdmin, agencyId } = auth.context;
  const url = new URL(request.url);
  const page = Math.max(1, Math.min(1000, Number(url.searchParams.get('page')) || 1));
  const pageSize = 20;
  const from = (page - 1) * pageSize;
  const [{ data: reports, error, count }, { data: settings, error: settingsError }] =
    await Promise.all([
      serviceAdmin.from('weekly_reports')
        .select('id,period_start,period_end,status,generation_version,general_metrics,agent_metrics,generated_at,email_status,email_recipient,email_attempt_count,email_accepted_at,email_last_error,created_at', {
          count: 'exact',
        })
        .eq('agency_id', agencyId)
        .order('period_end', { ascending: false })
        .range(from, from + pageSize - 1),
      serviceAdmin.from('agency_weekly_report_settings')
        .select('enabled,weekday,local_time,timezone,include_pdf,last_scheduled_period_end')
        .eq('agency_id', agencyId)
        .maybeSingle(),
    ]);
  if (error || settingsError) {
    return Response.json({ error: error?.message || settingsError?.message }, { status: 500 });
  }
  return Response.json({
    reports: reports || [],
    settings: settings || {
      enabled: true,
      weekday: 5,
      local_time: '18:00',
      timezone: 'Europe/Bucharest',
      include_pdf: true,
      last_scheduled_period_end: null,
    },
    pagination: {
      page,
      page_size: pageSize,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / pageSize),
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'reports', action: 'create' });
  if (!auth.ok) return auth.response;
  const { serviceAdmin, agencyId, user } = auth.context;
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || 'generate');
    if (!['generate', 'regenerate', 'resend'].includes(action)) {
      return Response.json({ error: 'Acțiune de raport necunoscută.' }, { status: 400 });
    }

    if (action === 'resend') {
      const reportId = String(body.report_id || '');
      if (!UUID.test(reportId)) return Response.json({ error: 'Raport invalid.' }, { status: 400 });
      const { data, error } = await serviceAdmin.from('weekly_reports')
        .select('*').eq('id', reportId).eq('agency_id', agencyId).maybeSingle();
      if (error || !data) return Response.json({ error: 'Raportul nu a fost găsit.' }, { status: 404 });
      const queued = await queueWeeklyReportEmail(serviceAdmin, data, true);
      const processed = queued.queued ? await processWeeklyReportEmails(serviceAdmin, 10) : null;
      await appendAuditEvent({
        client: serviceAdmin,
        request,
        agencyId,
        actorUserId: user.id,
        actorRole: auth.context.role,
        action: 'weekly_report.email_resend_requested',
        entityType: 'weekly_report',
        entityId: reportId,
        after: { queued: queued.queued, reason: queued.reason || null },
      });
      return Response.json({ queued, processed });
    }

    let periodStart: string;
    let periodEnd: string;
    if (action === 'regenerate') {
      const reportId = String(body.report_id || '');
      if (!UUID.test(reportId)) return Response.json({ error: 'Raport invalid.' }, { status: 400 });
      const { data, error } = await serviceAdmin.from('weekly_reports')
        .select('period_start,period_end')
        .eq('id', reportId).eq('agency_id', agencyId).maybeSingle();
      if (error || !data) return Response.json({ error: 'Raportul nu a fost găsit.' }, { status: 404 });
      periodStart = data.period_start;
      periodEnd = data.period_end;
    } else if (body.period_start && body.period_end) {
      periodStart = new Date(body.period_start).toISOString();
      periodEnd = new Date(body.period_end).toISOString();
    } else {
      const { data: settings } = await serviceAdmin.from('agency_weekly_report_settings')
        .select('weekday,local_time').eq('agency_id', agencyId).maybeSingle();
      const period = scheduledWeeklyPeriod(
        new Date(),
        Number(settings?.weekday ?? 5),
        String(settings?.local_time || '18:00'),
      );
      periodStart = period.start;
      periodEnd = period.end;
    }
    if (
      !Number.isFinite(new Date(periodStart).getTime())
      || !Number.isFinite(new Date(periodEnd).getTime())
      || new Date(periodEnd).getTime() <= new Date(periodStart).getTime()
      || new Date(periodEnd).getTime() - new Date(periodStart).getTime() > 32 * 86_400_000
    ) {
      return Response.json({ error: 'Perioada raportului este invalidă.' }, { status: 400 });
    }
    const report = await generateWeeklyReport(serviceAdmin, {
      agencyId,
      periodStart,
      periodEnd,
      requestedBy: user.id,
      queueEmail: false,
    });
    await appendAuditEvent({
      client: serviceAdmin,
      request,
      agencyId,
      actorUserId: user.id,
      actorRole: auth.context.role,
      action: action === 'regenerate'
        ? 'weekly_report.regenerated'
        : 'weekly_report.generated',
      entityType: 'weekly_report',
      entityId: report.id,
      after: {
        period_start: report.period_start,
        period_end: report.period_end,
        generation_version: report.generation_version,
      },
    });
    return Response.json({ report });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : 'Raportul nu a putut fi procesat.',
    }, { status: 500 });
  }
}
