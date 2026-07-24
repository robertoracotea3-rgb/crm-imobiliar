import { verifyCronAuthorization } from '@/lib/server/cron-auth.mjs';
import { getAdminClient } from '@/lib/server/api-auth';
import {
  finishSystemOperation,
  startSystemOperation,
  type SystemOperationHandle,
} from '@/lib/server/observability';
import { runWeeklyReportScheduler } from '@/lib/server/weekly-reports';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!verifyCronAuthorization(
    request.headers.get('authorization'),
    process.env.CRON_SECRET,
  )) {
    return Response.json({ error: 'Neautorizat' }, { status: 401 });
  }
  const serviceAdmin = getAdminClient();
  let observation: SystemOperationHandle | null = null;
  try {
    observation = await startSystemOperation(serviceAdmin, {
      serviceCode: 'weekly_reports',
      operation: 'generate_and_deliver',
      triggerType: 'cron',
      route: '/api/cron/weekly-reports',
      method: 'GET',
    });
  } catch {
    // Raportul și jurnalul de e-mail rămân sursele operaționale de adevăr.
  }
  try {
    const summary = await runWeeklyReportScheduler(serviceAdmin);
    if (observation) {
      await finishSystemOperation(serviceAdmin, observation, {
        status: summary.failed > 0 || summary.emails.failed > 0 ? 'degraded' : 'succeeded',
        httpStatus: summary.failed > 0 ? 207 : 200,
        processedCount: summary.agencies + summary.emails.claimed,
        successCount: summary.generated + summary.emails.accepted,
        errorCount: summary.failed + summary.emails.failed,
        retryCount: summary.emails.retrying,
        nextRunAt: new Date(Date.now() + 60 * 60_000).toISOString(),
        errorCode: summary.failed > 0 ? 'weekly_report_jobs_failed' : null,
        errorMessage: summary.failed > 0
          ? `${summary.failed} rapoarte nu au putut fi generate.`
          : null,
        metadata: summary,
      }).catch(() => undefined);
    }
    return Response.json({ success: summary.failed === 0, summary }, {
      status: summary.failed > 0 ? 207 : 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    if (observation) {
      await finishSystemOperation(serviceAdmin, observation, {
        status: 'failed',
        httpStatus: 500,
        errorCount: 1,
        errorCode: 'weekly_report_scheduler_failed',
        errorMessage: 'Programarea rapoartelor săptămânale a eșuat.',
        nextRunAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      }).catch(() => undefined);
    }
    return Response.json({ error: 'Rapoartele săptămânale nu au putut fi procesate.' }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
