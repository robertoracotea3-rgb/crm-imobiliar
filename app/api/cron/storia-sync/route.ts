import { getAdminClient } from '@/lib/server/api-auth';
import { verifyCronAuthorization } from '@/lib/server/cron-auth.mjs';
import {
  finishSystemOperation,
  startSystemOperation,
  type SystemOperationHandle,
} from '@/lib/server/observability';
import { syncStoriaAgency } from '@/lib/server/storia-listing-sync';
import type { StoriaSyncSummary } from '@/lib/server/storia-listing-sync';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Daily safety reconciliation. Vercel sends CRON_SECRET as a Bearer token.
export async function GET(request: Request) {
  if (!verifyCronAuthorization(
    request.headers.get('authorization'),
    process.env.CRON_SECRET,
  )) {
    return Response.json({ error: 'Neautorizat' }, { status: 401 });
  }

  const serviceAdmin = getAdminClient();
  const { data: connections, error } = await serviceAdmin
    .from('portal_tokens')
    .select('agency_id')
    .eq('portal', 'storia')
    .eq('connection_status', 'connected');
  if (error) return Response.json({ error: 'Sincronizarea nu a putut porni.' }, { status: 500 });

  const jobKey = new Date().toISOString().slice(0, 10);
  const summaries: StoriaSyncSummary[] = [];
  for (const connection of connections || []) {
    let observation: SystemOperationHandle | null = null;
    try {
      observation = await startSystemOperation(serviceAdmin, {
        agencyId: connection.agency_id,
        serviceCode: 'portal.storia',
        operation: 'scheduled_sync',
        triggerType: 'cron',
        correlationKey: jobKey,
        route: '/api/cron/storia-sync',
        method: 'GET',
      });
    } catch {
      // portal_sync_runs remains the source of truth when shared telemetry is unavailable.
    }
    try {
      const summary = await syncStoriaAgency(
        serviceAdmin,
        connection.agency_id,
        'cron',
        jobKey,
      );
      summaries.push(summary);
      if (observation) {
        await finishSystemOperation(serviceAdmin, observation, {
          status: summary.status === 'completed'
            ? 'succeeded'
            : summary.status === 'failed' ? 'failed' : 'degraded',
          httpStatus: summary.status === 'failed' ? 500 : summary.status === 'partial' ? 207 : 200,
          processedCount: summary.checked,
          successCount: summary.active,
          errorCount: summary.errors,
          retryCount: summary.stale,
          errorCode: summary.error_code,
          errorMessage: summary.error_code
            ? 'Sincronizarea Storia necesită verificare în panoul Portaluri.'
            : null,
          nextRunAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          metadata: {
            changed: summary.changed,
            missing: summary.missing,
            stale: summary.stale,
          },
        }).catch(() => undefined);
      }
    } catch {
      const failedSummary: StoriaSyncSummary = {
        agency_id: connection.agency_id,
        run_id: null,
        status: 'failed',
        error_code: 'sync_persistence_failed',
        checked: 0,
        active: 0,
        changed: 0,
        missing: 0,
        errors: 1,
        stale: 0,
      };
      summaries.push(failedSummary);
      if (observation) {
        await finishSystemOperation(serviceAdmin, observation, {
          status: 'failed',
          httpStatus: 500,
          errorCount: 1,
          errorCode: 'sync_persistence_failed',
          errorMessage: 'Sincronizarea Storia nu și-a putut salva rezultatul.',
          nextRunAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }).catch(() => undefined);
      }
    }
  }

  const failed = summaries.filter(summary => summary.status === 'failed').length;
  return Response.json(
    {
      success: failed === 0,
      agencies: summaries.length,
      failed_agencies: failed,
      summaries,
    },
    {
      status: failed > 0 ? 207 : 200,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
