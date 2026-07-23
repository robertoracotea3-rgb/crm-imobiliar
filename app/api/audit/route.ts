export const dynamic = 'force-dynamic';

import { createPageWindow, paginationMetadata } from '@/lib/pagination';
import { appendAuditEvent } from '@/lib/server/audit-log';
import { requireApiAuth } from '@/lib/server/api-auth';

const RESULTS = new Set(['success', 'denied', 'failure']);
const SAFE_FILTER = /^[a-z0-9_.-]{1,80}$/;

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'team', action: 'manage_permissions' });
  if (!auth.ok) return auth.response;
  const { serviceAdmin, agencyId, user, role } = auth.context;
  const params = new URL(request.url).searchParams;
  const pageWindow = createPageWindow(params.get('page'), params.get('page_size'), {
    defaultPageSize: 30,
    maxPageSize: 100,
  });
  const action = params.get('action')?.trim().toLowerCase() || '';
  const result = params.get('result')?.trim().toLowerCase() || '';
  const entityType = params.get('entity_type')?.trim().toLowerCase() || '';
  if ((action && !SAFE_FILTER.test(action))
    || (entityType && !SAFE_FILTER.test(entityType))
    || (result && !RESULTS.has(result))) {
    return Response.json({ error: 'Filtru de audit invalid.' }, { status: 400 });
  }

  await appendAuditEvent({
    client: serviceAdmin,
    request,
    agencyId,
    actorUserId: user.id,
    actorRole: role,
    action: 'audit.viewed',
    entityType: 'audit_log',
    metadata: { action_filter: action || null, result_filter: result || null, entity_filter: entityType || null },
  });

  let query = serviceAdmin.from('crm_audit_log').select(
    'id,actor_user_id,actor_role,action,entity_type,entity_id,before_values,after_values,result,reason,route,ip_hash,user_agent,request_id,metadata,previous_hash,event_hash,occurred_at',
    { count: 'exact' },
  ).eq('agency_id', agencyId);
  if (action) query = query.eq('action', action);
  if (result) query = query.eq('result', result);
  if (entityType) query = query.eq('entity_type', entityType);
  const { data, error, count } = await query
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .range(pageWindow.from, pageWindow.to);
  if (error) {
    if (/relation|does not exist|schema cache/i.test(error.message)) {
      return Response.json({
        events: [],
        needsMigration: true,
        integrity: { valid: false, checked: 0 },
        pagination: paginationMetadata(0, pageWindow),
      });
    }
    return Response.json({ error: 'Jurnalul de audit nu a putut fi încărcat.' }, { status: 500 });
  }

  const actorIds = [...new Set((data || []).map(event => event.actor_user_id).filter(Boolean))];
  const { data: profiles } = actorIds.length
    ? await serviceAdmin.from('profiles').select('user_id,full_name').eq('agency_id', agencyId).in('user_id', actorIds)
    : { data: [] };
  const names = new Map((profiles || []).map(profile => [profile.user_id, profile.full_name || 'Utilizator']));
  const { data: integrity, error: integrityError } = await serviceAdmin.rpc('crm_verify_audit_chain', {
    p_agency_id: agencyId,
  });

  return Response.json({
    events: (data || []).map(event => ({
      ...event,
      actor_name: event.actor_user_id ? names.get(event.actor_user_id) || 'Utilizator inactiv' : 'Sistem',
      ip_recorded: Boolean(event.ip_hash),
      ip_hash: undefined,
    })),
    integrity: integrityError ? { valid: false, checked: 0, error: 'verification_failed' } : integrity,
    pagination: paginationMetadata(count, pageWindow),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
