export const dynamic = 'force-dynamic';

import { normalizePropertyAssignmentRequest } from '@/lib/property-assignment';
import { requireApiAuth } from '@/lib/server/api-auth';
import { appendAuditEvent } from '@/lib/server/audit-log';

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'properties', action: 'view' });
  if (!auth.ok) return auth.response;
  const { admin, agencyId } = auth.context;
  const propertyId = new URL(request.url).searchParams.get('property_id');
  if (!propertyId) return Response.json({ error: 'Proprietatea lipsește.' }, { status: 400 });

  const { data, error } = await admin
    .from('property_assignment_history')
    .select('id,property_id,previous_agent_id,responsible_agent_id,assigned_by_user_id,reason,assignment_status,cascade_options,changed_at')
    .eq('agency_id', agencyId)
    .eq('property_id', propertyId)
    .order('changed_at', { ascending: false })
    .limit(100);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ history: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'properties', action: 'assign' });
  if (!auth.ok) return auth.response;
  const { admin, serviceAdmin, agencyId, user, role } = auth.context;

  const parsed = normalizePropertyAssignmentRequest(await request.json().catch(() => null));
  if (!parsed.value) {
    return Response.json({ error: parsed.errors[0], errors: parsed.errors }, { status: 400 });
  }
  const input = parsed.value;
  const { data, error } = await admin.rpc('crm_assign_properties', {
    p_agency_id: agencyId,
    p_actor_id: user.id,
    p_property_ids: input.propertyIds,
    p_responsible_agent_id: input.responsibleAgentId,
    p_reason: input.reason,
    p_reassign_active_leads: input.options.reassignActiveLeads,
    p_reassign_open_tasks: input.options.reassignOpenTasks,
    p_reassign_future_viewings: input.options.reassignFutureViewings,
    p_reassign_active_demands: input.options.reassignActiveDemands,
    p_allow_unassigned_exception: input.options.allowUnassignedException,
  });
  if (error) {
    const known = error.message.includes('forbidden') ? 403 : 400;
    return Response.json({ error: error.message }, { status: known });
  }

  await appendAuditEvent({
    client: serviceAdmin,
    request,
    agencyId,
    actorUserId: user.id,
    actorRole: role,
    action: 'property.agent_reassigned',
    entityType: 'property_batch',
    before: { property_ids: input.propertyIds },
    after: {
      responsible_agent_id: input.responsibleAgentId,
      reason: input.reason,
      options: input.options,
      result: data,
    },
    metadata: { affected_count: input.propertyIds.length },
  });

  return Response.json({ success: true, result: data });
}
