export const dynamic = 'force-dynamic';

import { runAutomationBatch } from '@/lib/server/automation-engine';
import { requireApiAuth } from '@/lib/server/api-auth';

const CONFIG_FIELDS: Record<string, { field: string; min: number; max: number }> = {
  lead_unanswered: { field: 'delay_minutes', min: 5, max: 10080 },
  viewing_reminder: { field: 'advance_minutes', min: 15, max: 10080 },
  task_overdue: { field: 'grace_minutes', min: 0, max: 1440 },
  lead_missing_next_action: { field: 'grace_minutes', min: 5, max: 10080 },
};

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'settings', action: 'view' });
  if (!auth.ok) return auth.response;
  const { serviceAdmin, agencyId } = auth.context;

  const [{ data: rules, error: rulesError }, { data: jobs, error: jobsError }, { data: logs, error: logsError }] =
    await Promise.all([
      serviceAdmin.from('automation_rules').select(
        'id,rule_key,name,description,trigger_key,config,is_enabled,max_attempts,retry_delay_minutes,last_run_at,updated_at',
      ).eq('agency_id', agencyId).order('created_at'),
      serviceAdmin.from('automation_jobs').select(
        'id,rule_id,status,attempts,max_attempts,run_after,last_error,created_at,completed_at',
      ).eq('agency_id', agencyId).order('created_at', { ascending: false }).limit(50),
      serviceAdmin.from('automation_run_logs').select(
        'id,job_id,rule_id,attempt,status,error_message,duration_ms,created_at',
      ).eq('agency_id', agencyId).order('created_at', { ascending: false }).limit(50),
    ]);
  const error = rulesError || jobsError || logsError;
  if (error) {
    if (/automation_(rules|jobs|run_logs).*does not exist|relation .*automation_/i.test(error.message)) {
      return Response.json({ error: 'Migrarea pentru automatizări nu este instalată.' }, { status: 503 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  const recentJobs = jobs || [];
  const counts = recentJobs.reduce<Record<string, number>>((acc, job) => {
    acc[job.status] = (acc[job.status] || 0) + 1;
    return acc;
  }, {});
  return Response.json({ rules: rules || [], jobs: recentJobs, logs: logs || [], counts });
}

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(request, { module: 'settings', action: 'edit' });
  if (!auth.ok) return auth.response;
  const { serviceAdmin, agencyId, user } = auth.context;

  const body = await request.json().catch(() => ({}));
  const ruleKey = String(body.rule_key || '');
  if (!ruleKey) return Response.json({ error: 'Regula lipsește.' }, { status: 400 });

  const { data: current, error: currentError } = await serviceAdmin.from('automation_rules')
    .select('id,rule_key,config,is_enabled').eq('agency_id', agencyId).eq('rule_key', ruleKey).maybeSingle();
  if (currentError) return Response.json({ error: currentError.message }, { status: 500 });
  if (!current) return Response.json({ error: 'Regula nu există în această agenție.' }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.is_enabled === 'boolean') {
    patch.is_enabled = body.is_enabled;
    patch.disabled_at = body.is_enabled ? null : new Date().toISOString();
    patch.disabled_by = body.is_enabled ? null : user.id;
  }
  if (body.interval_minutes !== undefined) {
    const definition = CONFIG_FIELDS[ruleKey];
    if (!definition) return Response.json({ error: 'Această regulă nu are interval configurabil.' }, { status: 400 });
    const value = Number(body.interval_minutes);
    if (!Number.isInteger(value) || value < definition.min || value > definition.max) {
      return Response.json({
        error: `Intervalul trebuie să fie între ${definition.min} și ${definition.max} minute.`,
      }, { status: 400 });
    }
    patch.config = { ...(current.config || {}), [definition.field]: value };
  }
  if (Object.keys(patch).length === 1) {
    return Response.json({ error: 'Nu există modificări valide.' }, { status: 400 });
  }

  const { data, error } = await serviceAdmin.from('automation_rules').update(patch)
    .eq('agency_id', agencyId).eq('id', current.id)
    .select('id,rule_key,name,description,trigger_key,config,is_enabled,max_attempts,retry_delay_minutes,last_run_at,updated_at')
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ rule: data });
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'settings', action: 'edit' });
  if (!auth.ok) return auth.response;
  const { serviceAdmin, agencyId } = auth.context;
  const body = await request.json().catch(() => ({}));

  if (body.action === 'retry') {
    const jobId = String(body.job_id || '');
    if (!jobId) return Response.json({ error: 'Execuția lipsește.' }, { status: 400 });
    const { data, error } = await serviceAdmin.rpc('crm_retry_automation_job', {
      p_agency_id: agencyId,
      p_job_id: jobId,
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!data) return Response.json({ error: 'Execuția nu poate fi reluată.' }, { status: 409 });
  } else if (body.action && body.action !== 'run') {
    return Response.json({ error: 'Acțiune necunoscută.' }, { status: 400 });
  }

  try {
    const summary = await runAutomationBatch(serviceAdmin, { agencyId, limit: 30, sweep: true });
    return Response.json({ success: true, summary });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : 'Automatizările nu au putut fi executate.',
    }, { status: 500 });
  }
}
