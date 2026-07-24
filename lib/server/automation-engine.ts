import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { getValidToken, olxFetch } from '@/lib/storia-api';
import { refreshDemandMatchesForProperty, refreshMatchesForDemand } from '@/lib/server/demand-matching';
import { persistNotifications } from '@/lib/server/notifications';

interface AutomationAction {
  type: 'notify' | 'create_followup_task' | 'match_demand' | 'match_property' | 'withdraw_property_portals';
  audience?: 'agent' | 'assigned' | 'admins';
  notification_type?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  title?: string;
  action_url?: string;
  due_minutes?: number;
}

interface ClaimedJob {
  id: string;
  agency_id: string;
  rule_id: string;
  event_id: string;
  rule_key: string;
  trigger_key: string;
  attempts: number;
  max_attempts: number;
  retry_delay_minutes: number;
  payload: {
    entity_type?: string;
    entity_id?: string;
    event?: Record<string, unknown>;
    actions?: AutomationAction[];
  };
}

export interface AutomationRunSummary {
  contactSla: Record<string, unknown> | null;
  contactLifecycle: Record<string, unknown> | null;
  swept: number;
  claimed: number;
  completed: number;
  retrying: number;
  failed: number;
  cancelled: number;
}

function safeError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 1000);
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message).slice(0, 1000);
  }
  return String(error || 'Eroare necunoscută').slice(0, 1000);
}

async function entityForJob(serviceAdmin: SupabaseClient, job: ClaimedJob) {
  const entityId = String(job.payload.entity_id || '');
  const table = job.trigger_key.startsWith('lead.') ? 'leads'
    : job.trigger_key.startsWith('viewing.') ? 'calendar_events'
      : job.trigger_key.startsWith('demand.') ? 'demands'
        : job.trigger_key.startsWith('property.') ? 'properties'
          : job.trigger_key.startsWith('listing.') ? 'portal_listings'
            : job.trigger_key.startsWith('task.') ? 'tasks'
              : null;
  if (!table || !entityId) throw new Error('Evenimentul automatizării este incomplet');
  const { data, error } = await serviceAdmin.from(table).select('*')
    .eq('agency_id', job.agency_id).eq('id', entityId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Entitatea automatizării nu mai există în agenție');
  return data as Record<string, unknown>;
}

async function adminRecipients(serviceAdmin: SupabaseClient, agencyId: string): Promise<string[]> {
  const { data, error } = await serviceAdmin.from('profiles').select('user_id')
    .eq('agency_id', agencyId).eq('status', 'active').in('role', ['owner', 'admin', 'manager']);
  if (error) throw new Error(error.message);
  return (data || []).map((profile) => String(profile.user_id)).filter(Boolean);
}

function notificationMessage(job: ClaimedJob, entity: Record<string, unknown>): string {
  switch (job.rule_key) {
    case 'lead_new':
      return `Client nou: ${String(entity.contact_name || 'fără nume')}`;
    case 'lead_unanswered':
      return `${String(entity.contact_name || 'Clientul')} nu are încă un contact confirmat.`;
    case 'viewing_reminder':
      return `${String(entity.title || 'Vizionare')} · ${new Date(String(entity.start_at)).toLocaleString('ro-RO')}`;
    case 'listing_error':
      return String(entity.error_message || 'Listarea de portal necesită verificare.');
    case 'task_overdue':
      return String(entity.title || 'Un task a depășit termenul.');
    case 'lead_missing_next_action':
      return `${String(entity.contact_name || 'Leadul')} nu are următoarea acțiune planificată.`;
    default:
      return 'Automatizarea necesită atenție.';
  }
}

async function notify(
  serviceAdmin: SupabaseClient,
  job: ClaimedJob,
  action: AutomationAction,
  entity: Record<string, unknown>,
) {
  let recipients: string[] = [];
  if (action.audience === 'admins') {
    recipients = await adminRecipients(serviceAdmin, job.agency_id);
  } else {
    const direct = action.audience === 'assigned'
      ? entity.assigned_to
      : entity.agent_id || entity.assigned_to || entity.created_by;
    if (direct) recipients = [String(direct)];
    else recipients = await adminRecipients(serviceAdmin, job.agency_id);
  }
  if (recipients.length === 0) throw new Error('Automatizarea nu are niciun destinatar activ');

  const entityId = String(job.payload.entity_id || '');
  const actionUrl = String(action.action_url || '').replace('{entity_id}', encodeURIComponent(entityId));
  const type = action.notification_type || job.rule_key;
  const count = await persistNotifications(serviceAdmin, recipients.map((userId) => ({
    agency_id: job.agency_id,
    user_id: userId,
    type,
    title: action.title || 'Automatizare CRM',
    message: notificationMessage(job, entity),
    entity_type: String(job.payload.entity_type || ''),
    entity_id: entityId,
    priority: action.priority || 'normal',
    action_url: actionUrl,
    // Reuse historical keys for the overlapping alerts, preventing two inbox rows.
    dedup_key: `${type}:${entityId}`,
    metadata: { automation_rule: job.rule_key, automation_job_id: job.id },
  })));
  return { action: action.type, recipients: count };
}

async function createFollowupTask(
  serviceAdmin: SupabaseClient,
  job: ClaimedJob,
  action: AutomationAction,
  viewing: Record<string, unknown>,
) {
  const { data: byJob, error: byJobError } = await serviceAdmin.from('tasks').select('id')
    .eq('agency_id', job.agency_id).eq('automation_job_id', job.id).maybeSingle();
  if (byJobError) throw new Error(byJobError.message);
  if (byJob) return { action: action.type, task_id: byJob.id, existing: true };

  let existingQuery = serviceAdmin.from('tasks').select('id')
    .eq('agency_id', job.agency_id).eq('status', 'open').eq('title', 'Follow-up după vizionare')
    .is('deleted_at', null);
  if (viewing.lead_id) existingQuery = existingQuery.eq('lead_id', viewing.lead_id);
  else if (viewing.property_id) existingQuery = existingQuery.eq('property_id', viewing.property_id);
  const { data: existing, error: existingError } = await existingQuery.limit(1).maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return { action: action.type, task_id: existing.id, existing: true };

  const agentId = viewing.agent_id ? String(viewing.agent_id) : null;
  if (!agentId) throw new Error('Vizionarea nu are agent responsabil');
  const dueAt = viewing.next_action_at
    ? String(viewing.next_action_at)
    : new Date(Date.now() + Math.max(1, Number(action.due_minutes || 1440)) * 60_000).toISOString();
  const { data, error } = await serviceAdmin.from('tasks').insert({
    agency_id: job.agency_id,
    created_by: agentId,
    assigned_to: agentId,
    title: 'Follow-up după vizionare',
    description: viewing.outcome ? `Rezultat: ${String(viewing.outcome)}` : 'Revino la client după vizionare.',
    priority: 'mare',
    status: 'open',
    due_at: dueAt,
    property_id: viewing.property_id || null,
    lead_id: viewing.lead_id || null,
    automation_job_id: job.id,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return { action: action.type, task_id: data.id, existing: false };
}

async function withdrawPropertyPortals(
  serviceAdmin: SupabaseClient,
  job: ClaimedJob,
  property: Record<string, unknown>,
) {
  const propertyId = String(property.id);
  const { data: listings, error } = await serviceAdmin.from('portal_listings').select('*')
    .eq('agency_id', job.agency_id).eq('property_id', propertyId)
    .not('status', 'in', '("deleted","expired")');
  if (error) throw new Error(error.message);
  if (!listings?.length) return { action: 'withdraw_property_portals', checked: 0, withdrawn: 0 };

  let token: string | null = null;
  let withdrawn = 0;
  const failures: string[] = [];
  for (const listing of listings) {
    try {
      if (listing.portal !== 'storia') throw new Error(`Portalul ${listing.portal} nu are retragere automată verificată`);
      if (!listing.external_id) throw new Error('ID-ul public Storia lipsește');
      token ||= await getValidToken(serviceAdmin, job.agency_id);
      if (!token) throw new Error('Contul Storia nu este conectat');
      const response = await olxFetch(`/advert/v1/${encodeURIComponent(listing.external_id)}`, token, { method: 'DELETE' });
      if (!response.ok && response.status !== 404) {
        throw new Error(`Storia HTTP ${response.status}: ${await response.text().catch(() => '')}`);
      }
      const now = new Date().toISOString();
      const { error: updateError } = await serviceAdmin.from('portal_listings').update({
        status: 'deleted',
        remote_status: 'deleted',
        remote_exists: false,
        removal_confirmed_at: now,
        last_sync_at: now,
        error_message: null,
        updated_at: now,
      }).eq('agency_id', job.agency_id).eq('id', listing.id);
      if (updateError) throw new Error(updateError.message);
      withdrawn += 1;
    } catch (caught) {
      const message = safeError(caught);
      failures.push(`${listing.portal}: ${message}`);
      await serviceAdmin.from('portal_listings').update({
        status: 'removal_failed',
        error_message: message,
        updated_at: new Date().toISOString(),
      }).eq('agency_id', job.agency_id).eq('id', listing.id);
    }
  }
  if (failures.length) throw new Error(failures.join(' | '));
  return { action: 'withdraw_property_portals', checked: listings.length, withdrawn };
}

async function executeJob(serviceAdmin: SupabaseClient, job: ClaimedJob) {
  const { data: rule, error: ruleError } = await serviceAdmin.from('automation_rules')
    .select('is_enabled').eq('agency_id', job.agency_id).eq('id', job.rule_id).maybeSingle();
  if (ruleError) throw new Error(ruleError.message);
  if (!rule?.is_enabled) return { cancelled: true, actions: [] };

  const entity = await entityForJob(serviceAdmin, job);
  const results: Record<string, unknown>[] = [];
  for (const action of job.payload.actions || []) {
    if (action.type === 'notify') results.push(await notify(serviceAdmin, job, action, entity));
    else if (action.type === 'create_followup_task') {
      results.push(await createFollowupTask(serviceAdmin, job, action, entity));
    } else if (action.type === 'match_demand') {
      results.push({ action: action.type, ...await refreshMatchesForDemand(
        serviceAdmin, job.agency_id, String(entity.id),
      ) });
    } else if (action.type === 'match_property') {
      results.push({ action: action.type, ...await refreshDemandMatchesForProperty(
        serviceAdmin, job.agency_id, String(entity.id),
      ) });
    } else if (action.type === 'withdraw_property_portals') {
      results.push(await withdrawPropertyPortals(serviceAdmin, job, entity));
    } else {
      throw new Error(`Acțiune de automatizare necunoscută: ${String(action.type)}`);
    }
  }
  return { actions: results };
}

export async function runAutomationBatch(
  serviceAdmin: SupabaseClient,
  options: { agencyId?: string | null; limit?: number; sweep?: boolean } = {},
): Promise<AutomationRunSummary> {
  const summary: AutomationRunSummary = {
    contactSla: null, contactLifecycle: null,
    swept: 0, claimed: 0, completed: 0, retrying: 0, failed: 0, cancelled: 0,
  };
  if (options.sweep !== false) {
    const { data: contactSla, error: contactSlaError } = await serviceAdmin.rpc(
      'crm_process_contact_sla',
      {
        p_now: new Date().toISOString(),
        p_agency_id: options.agencyId || null,
      },
    );
    if (contactSlaError) throw new Error(contactSlaError.message);
    summary.contactSla = (contactSla || {}) as Record<string, unknown>;

    const { data: contactLifecycle, error: contactLifecycleError } = await serviceAdmin.rpc(
      'crm_refresh_contact_lifecycle',
      {
        p_now: new Date().toISOString(),
        p_agency_id: options.agencyId || null,
        p_old_after_days: 60,
      },
    );
    if (contactLifecycleError) throw new Error(contactLifecycleError.message);
    summary.contactLifecycle = (contactLifecycle || {}) as Record<string, unknown>;

    const { data, error } = await serviceAdmin.rpc('crm_sweep_due_automations', {
      p_now: new Date().toISOString(),
      p_agency_id: options.agencyId || null,
    });
    if (error) throw new Error(error.message);
    summary.swept = Number(data?.created || 0);
  }

  const { data, error } = await serviceAdmin.rpc('crm_claim_automation_jobs', {
    p_limit: Math.max(1, Math.min(options.limit || 20, 100)),
    p_agency_id: options.agencyId || null,
  });
  if (error) throw new Error(error.message);
  const jobs = (data || []) as ClaimedJob[];
  summary.claimed = jobs.length;

  for (const job of jobs) {
    const startedAt = Date.now();
    try {
      const result = await executeJob(serviceAdmin, job);
      const cancelled = result.cancelled === true;
      const { data: status, error: finishError } = await serviceAdmin.rpc('crm_finish_automation_job', {
        p_job_id: job.id,
        p_success: !cancelled,
        p_result: result,
        p_error: cancelled ? 'Regula a fost dezactivată înainte de execuție.' : null,
        p_duration_ms: Date.now() - startedAt,
      });
      if (finishError) throw new Error(finishError.message);
      if (status === 'cancelled') summary.cancelled += 1;
      else summary.completed += 1;
    } catch (caught) {
      const { data: status, error: finishError } = await serviceAdmin.rpc('crm_finish_automation_job', {
        p_job_id: job.id,
        p_success: false,
        p_result: {},
        p_error: safeError(caught),
        p_duration_ms: Date.now() - startedAt,
      });
      if (finishError) throw new Error(finishError.message);
      if (status === 'failed') summary.failed += 1;
      else if (status === 'cancelled') summary.cancelled += 1;
      else summary.retrying += 1;
    }
  }
  return summary;
}
