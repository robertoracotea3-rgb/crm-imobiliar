export const dynamic = 'force-dynamic';
export const maxDuration = 90;

import { getSources } from '@/lib/prospects';
import { assessAgencySuspicion, normalizeProspect } from '@/lib/prospects/normalize';
import { requireApiAuth } from '@/lib/server/api-auth';

const UPSERT_CHUNK = 250;

function increment(map: Map<string, number>, key: string | null | undefined): void {
  if (key) map.set(key, (map.get(key) ?? 0) + 1);
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'prospects', action: 'create' });
  if (!auth.ok) return auth.response;

  try {
    const { serviceAdmin, agencyId, user } = auth.context;
    const body = await request.json().catch(() => ({}));
    const requestedKeys = Array.isArray(body.sources)
      ? body.sources.filter((key: unknown): key is string => typeof key === 'string')
      : undefined;
    const adapters = getSources(requestedKeys);
    if (!adapters.length) return Response.json({ error: 'Nicio sursă validă selectată.' }, { status: 400 });

    await serviceAdmin.from('prospect_source_health').upsert(adapters.map((source) => ({
      agency_id: agencyId, source: source.key, label: source.label, terms_url: source.termsUrl,
    })), { onConflict: 'agency_id,source', ignoreDuplicates: false });

    const { data: healthRows, error: healthError } = await serviceAdmin.from('prospect_source_health')
      .select('source,active,compliance_status,success_count,error_count,consecutive_failures').eq('agency_id', agencyId)
      .in('source', adapters.map((source) => source.key));
    if (healthError) {
      if (/relation|does not exist/i.test(healthError.message)) {
        return Response.json({ error: 'Rulează migrația Fazei 9 înainte de actualizare.', needsMigration: true }, { status: 409 });
      }
      return Response.json({ error: healthError.message }, { status: 500 });
    }
    const health = new Map((healthRows ?? []).map((row) => [row.source, row]));
    const environmentApproved = process.env.PROSPECTS_COLLECTION_APPROVED === 'true';
    const results: Array<Record<string, unknown>> = [];

    for (const source of adapters) {
      const sourceHealth = health.get(source.key);
      if (!sourceHealth?.active) {
        results.push({ source: source.key, label: source.label, count: 0, skipped: true, error: 'Sursă inactivă.' });
        continue;
      }
      if (!environmentApproved && sourceHealth.compliance_status !== 'approved') {
        const error = 'Colectarea este oprită până la aprobarea condițiilor portalului.';
        const now = new Date().toISOString();
        await serviceAdmin.from('prospect_sync_runs').insert({
          agency_id: agencyId, source: source.key, initiated_by: user.id, status: 'skipped',
          started_at: now, finished_at: now, error,
        });
        results.push({ source: source.key, label: source.label, count: 0, skipped: true, error });
        continue;
      }

      const startedAt = new Date();
      const { data: run, error: runError } = await serviceAdmin.from('prospect_sync_runs').insert({
        agency_id: agencyId, source: source.key, initiated_by: user.id, status: 'running', started_at: startedAt.toISOString(),
      }).select('id').single();
      if (runError) {
        results.push({ source: source.key, label: source.label, count: 0, error: runError.message });
        continue;
      }

      try {
        const fetched = await source.fetchBrasov();
        const normalized = fetched.items.map(normalizeProspect).filter((row): row is NonNullable<typeof row> => Boolean(row));
        const phoneCounts = new Map<string, number>();
        const sellerCounts = new Map<string, number>();
        for (const row of normalized) {
          increment(phoneCounts, row.phone_normalized);
          increment(sellerCounts, row.seller_name?.toLocaleLowerCase('ro-RO'));
        }
        const checkedAt = new Date().toISOString();
        const rows = normalized.map((row) => {
          const assessment = assessAgencySuspicion(row, {
            reusedPhoneCount: row.phone_normalized ? phoneCounts.get(row.phone_normalized) : 0,
            similarListingCount: row.seller_name ? sellerCounts.get(row.seller_name.toLocaleLowerCase('ro-RO')) : 0,
          });
          return {
            agency_id: agencyId, ...row, last_seen_at: checkedAt, last_checked_at: checkedAt,
            sync_error: null, missing_count: 0, agency_suspected: assessment.suspected,
            agency_confidence: assessment.confidence, agency_reasons: assessment.reasons,
          };
        });
        for (let index = 0; index < rows.length; index += UPSERT_CHUNK) {
          const { error } = await serviceAdmin.from('prospects').upsert(rows.slice(index, index + UPSERT_CHUNK), {
            onConflict: 'agency_id,source,external_id', ignoreDuplicates: false,
          });
          if (error) throw new Error(error.message);
        }

        let missingCount = 0;
        if (fetched.complete) {
          const { data, error } = await serviceAdmin.rpc('crm_mark_missing_prospects', {
            p_agency_id: agencyId, p_source: source.key,
            p_seen_external_ids: rows.map((row) => row.external_id), p_checked_at: checkedAt,
          });
          if (error) throw new Error(error.message);
          missingCount = Number(data ?? 0);
        }
        const durationMs = Date.now() - startedAt.getTime();
        const status = fetched.complete ? 'succeeded' : 'partial';
        await serviceAdmin.from('prospect_sync_runs').update({
          status, finished_at: new Date().toISOString(), duration_ms: durationMs,
          processed_count: rows.length, missing_count: missingCount, warnings: fetched.warnings,
        }).eq('id', run.id);
        await serviceAdmin.from('prospect_source_health').update({
          last_run_at: startedAt.toISOString(), last_success_at: new Date().toISOString(), last_error: null,
          last_duration_ms: durationMs, last_processed_count: rows.length,
          success_count: Number(sourceHealth.success_count ?? 0) + 1,
          consecutive_failures: 0, last_run_complete: fetched.complete, updated_at: new Date().toISOString(),
        }).eq('agency_id', agencyId).eq('source', source.key);
        // Increment counters atomically is not exposed by PostgREST; the run table remains the source of truth.
        results.push({ source: source.key, label: source.label, count: rows.length, missing: missingCount,
          complete: fetched.complete, duration_ms: durationMs, warnings: fetched.warnings });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Eroare necunoscută';
        const durationMs = Date.now() - startedAt.getTime();
        const finishedAt = new Date().toISOString();
        await serviceAdmin.from('prospect_sync_runs').update({
          status: 'failed', finished_at: finishedAt, duration_ms: durationMs, error: message,
        }).eq('id', run.id);
        await serviceAdmin.from('prospect_source_health').update({
          last_run_at: startedAt.toISOString(), last_error_at: finishedAt, last_error: message,
          last_duration_ms: durationMs, last_processed_count: 0, last_run_complete: false, updated_at: finishedAt,
          error_count: Number(sourceHealth.error_count ?? 0) + 1,
          consecutive_failures: Number(sourceHealth.consecutive_failures ?? 0) + 1,
        }).eq('agency_id', agencyId).eq('source', source.key);
        await serviceAdmin.from('prospects').update({ sync_error: message, last_checked_at: finishedAt })
          .eq('agency_id', agencyId).eq('source_normalized', source.key).is('deleted_at', null);
        results.push({ source: source.key, label: source.label, count: 0, error: message, duration_ms: durationMs });
      }
    }

    const { data: grouped, error: groupError } = await serviceAdmin.rpc('crm_refresh_prospect_duplicate_groups', {
      p_agency_id: agencyId,
    });
    return Response.json({
      ok: results.some((result) => !result.error),
      total: results.reduce((sum, result) => sum + Number(result.count ?? 0), 0),
      duplicate_members: groupError ? null : Number(grouped ?? 0),
      duplicate_error: groupError?.message,
      results,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Eroare necunoscută' }, { status: 500 });
  }
}
