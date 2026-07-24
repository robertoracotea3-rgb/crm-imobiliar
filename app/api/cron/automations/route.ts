import { runAutomationBatch } from '@/lib/server/automation-engine';
import { getAdminClient } from '@/lib/server/api-auth';
import { verifyCronAuthorization } from '@/lib/server/cron-auth.mjs';
import {
  finishSystemOperation,
  startSystemOperation,
  type SystemOperationHandle,
} from '@/lib/server/observability';

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
      serviceCode: 'automations',
      operation: 'scheduled_batch',
      triggerType: 'cron',
      route: '/api/cron/automations',
      method: 'GET',
    });
  } catch {
    // The durable automation journal remains authoritative if telemetry is unavailable.
  }

  try {
    const summary = await runAutomationBatch(serviceAdmin, { limit: 20, sweep: true });
    if (observation) {
      await finishSystemOperation(serviceAdmin, observation, {
        status: summary.failed > 0 || summary.retrying > 0 ? 'degraded' : 'succeeded',
        httpStatus: summary.failed > 0 ? 207 : 200,
        processedCount: summary.claimed,
        successCount: summary.completed,
        errorCount: summary.failed,
        retryCount: summary.retrying,
        nextRunAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        errorCode: summary.failed > 0 ? 'automation_jobs_failed' : null,
        errorMessage: summary.failed > 0
          ? `${summary.failed} automatizări au eșuat în această execuție.`
          : null,
        metadata: {
          swept: summary.swept,
          cancelled: summary.cancelled,
          contact_sla: summary.contactSla,
          contact_lifecycle: summary.contactLifecycle,
        },
      }).catch(() => undefined);
    }
    return Response.json(
      { success: summary.failed === 0, summary },
      {
        status: summary.failed > 0 ? 207 : 200,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch {
    if (observation) {
      await finishSystemOperation(serviceAdmin, observation, {
        status: 'failed',
        httpStatus: 500,
        errorCount: 1,
        errorCode: 'automation_batch_failed',
        errorMessage: 'Motorul de automatizări nu a putut fi executat.',
        nextRunAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }).catch(() => undefined);
    }
    return Response.json(
      { error: 'Motorul de automatizări nu a putut fi executat.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
