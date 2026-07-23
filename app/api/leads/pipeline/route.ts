export const dynamic = 'force-dynamic';

import { isLeadPipelineCode } from '@/lib/crm-pipeline';
import { requireApiAuth } from '@/lib/server/api-auth';

function pipelineError(message: string): { error: string; blockers?: string[] } {
  if (message.includes('pipeline_transition_invalid')) {
    return { error: 'Tranziția nu este permisă din etapa curentă.' };
  }
  if (message.includes('pipeline_actor_not_in_agency')) {
    return { error: 'Utilizatorul nu este activ în această agenție.' };
  }
  if (message.includes('pipeline_lead_not_found')) {
    return { error: 'Leadul nu a fost găsit.' };
  }
  const marker = 'pipeline_blocked:';
  const start = message.indexOf(marker);
  if (start >= 0) {
    const raw = message.slice(start + marker.length);
    try {
      const blockers = JSON.parse(raw);
      if (Array.isArray(blockers)) {
        return {
          error: 'Etapa nu poate fi activată până nu sunt rezolvate condițiile obligatorii.',
          blockers: blockers.filter((item): item is string => typeof item === 'string'),
        };
      }
    } catch {
      return { error: 'Etapa nu poate fi activată deoarece lipsesc date obligatorii.' };
    }
  }
  return { error: 'Etapa pipeline nu a putut fi schimbată.' };
}

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'leads', action: 'view' });
  if (!auth.ok) return auth.response;

  const { admin, agencyId } = auth.context;
  const leadId = new URL(request.url).searchParams.get('id');
  if (!leadId) return Response.json({ error: 'ID lead lipsă.' }, { status: 400 });

  const [{ data: lead }, { data: events }] = await Promise.all([
    admin.from('leads')
      .select('id,pipeline_stage,pipeline_stage_changed_at,status,next_action_at,next_action_type,status_reason,status_note')
      .eq('id', leadId).eq('agency_id', agencyId).is('deleted_at', null).maybeSingle(),
    admin.from('lead_pipeline_events')
      .select('id,from_stage,to_stage,reason,note,source,actor_id,evidence,created_at')
      .eq('lead_id', leadId).eq('agency_id', agencyId)
      .order('created_at', { ascending: false }).limit(100),
  ]);
  if (!lead) return Response.json({ error: 'Leadul nu a fost găsit.' }, { status: 404 });
  return Response.json({ lead, events: events || [] });
}

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(request, { module: 'leads', action: 'edit' });
  if (!auth.ok) return auth.response;

  const { admin, serviceAdmin, agencyId, user } = auth.context;
  const body = await request.json().catch(() => ({}));
  const leadId = typeof body.id === 'string' ? body.id : '';
  const toStage = typeof body.stage === 'string' ? body.stage : '';
  if (!leadId || !isLeadPipelineCode(toStage)) {
    return Response.json({ error: 'Leadul sau etapa pipeline este invalidă.' }, { status: 400 });
  }

  const { data: accessible } = await admin.from('leads').select('id')
    .eq('id', leadId).eq('agency_id', agencyId).is('deleted_at', null).maybeSingle();
  if (!accessible) return Response.json({ error: 'Leadul nu a fost găsit.' }, { status: 404 });

  const nextActionAt = body.next_action_at ? new Date(body.next_action_at) : null;
  if (body.next_action_at && (!nextActionAt || Number.isNaN(nextActionAt.getTime()))) {
    return Response.json({ error: 'Data următoarei acțiuni este invalidă.' }, { status: 400 });
  }

  const { data: transition, error } = await serviceAdmin.rpc('crm_transition_lead_pipeline', {
    p_agency_id: agencyId,
    p_actor_id: user.id,
    p_lead_id: leadId,
    p_to_stage: toStage,
    p_next_action_at: nextActionAt?.toISOString() || null,
    p_next_action_type: typeof body.next_action_type === 'string' ? body.next_action_type : null,
    p_reason: typeof body.reason === 'string' ? body.reason.trim() : null,
    p_note: typeof body.note === 'string' ? body.note.trim() : null,
  });
  if (error) {
    const detail = pipelineError(error.message);
    return Response.json(detail, { status: error.message.includes('pipeline_transition_invalid') ? 409 : 400 });
  }

  const { data: lead } = await admin.from('leads')
    .select('id,pipeline_stage,pipeline_stage_changed_at,next_action_at,next_action_type,status_reason,status_note')
    .eq('id', leadId).eq('agency_id', agencyId).single();
  return Response.json({ transition, lead });
}
