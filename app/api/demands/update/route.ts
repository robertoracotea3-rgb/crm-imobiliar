export const dynamic = 'force-dynamic';

import { normalizeLeadSource } from '@/lib/crm-catalogs';
import { normalizeDemandRecord, type DemandRecordInput } from '@/lib/demand-record';
import { contextHasPermission, requireApiAuth } from '@/lib/server/api-auth';

const VALID_STATUS = ['activa', 'inactiva'];

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(request, { module: 'demands', action: 'edit' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, serviceAdmin, agencyId, user } = auth.context;
    const body = await request.json() as Record<string, unknown>;
    const id = String(body.id || '');
    if (!id) return Response.json({ error: 'ID lipsă' }, { status: 400 });
    if (body.status !== undefined && !VALID_STATUS.includes(String(body.status))) {
      return Response.json({
        error: 'Închiderea și reactivarea se fac numai din fluxul de revizuire.',
      }, { status: 400 });
    }

    const { data: current, error: currentError } = await admin.from('demands')
      .select('*').eq('id', id).eq('agency_id', agencyId).is('deleted_at', null).maybeSingle();
    if (currentError) return Response.json({ error: currentError.message }, { status: 500 });
    if (!current) return Response.json({ error: 'Cererea nu există sau nu este accesibilă' }, { status: 404 });

    const merged = {
      ...current,
      ...body,
      criteria: { ...(current.criteria || {}), ...((body.criteria as Record<string, unknown> | undefined) || {}) },
    } as DemandRecordInput;
    const normalized = normalizeDemandRecord(merged);
    if (!normalized.contact_id) return Response.json({ error: 'Cererea trebuie legată de un client' }, { status: 400 });

    const agentId = normalized.agent_id || user.id;
    if (agentId !== current.agent_id && agentId !== user.id && !contextHasPermission(auth.context, 'demands', 'assign')) {
      return Response.json({ error: 'Nu ai dreptul să atribui cererea altui agent' }, { status: 403 });
    }
    if (agentId !== current.agent_id) {
      const { data: profile } = await admin.from('profiles').select('user_id')
        .eq('user_id', agentId).eq('agency_id', agencyId).eq('status', 'active').maybeSingle();
      if (!profile) return Response.json({ error: 'Agent invalid pentru această agenție' }, { status: 400 });
    }
    if (normalized.contact_id !== current.contact_id) {
      const { data: contact } = await admin.from('contacts').select('id')
        .eq('id', normalized.contact_id).eq('agency_id', agencyId).is('deleted_at', null).maybeSingle();
      if (!contact) return Response.json({ error: 'Client invalid pentru această agenție' }, { status: 400 });
    }

    const source = normalizeLeadSource(normalized.source) || current.source_normalized || 'manual';
    const { data, error } = await admin.from('demands').update({
      ...normalized,
      agent_id: agentId,
      source,
      source_normalized: source,
      status: body.status !== undefined ? String(body.status) : current.status,
    }).eq('id', id).eq('agency_id', agencyId).is('deleted_at', null).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    // Previously calculated recommendations remain in history but are no longer
    // presented as current after the criteria change.
    await serviceAdmin.from('matches').update({ status: 'expirata', evaluated_at: new Date().toISOString() })
      .eq('agency_id', agencyId).eq('demand_id', id).in('status', ['noua', 'revizuita', 'aprobata'])
      .then(() => undefined, () => undefined);

    return Response.json({ demand: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Eroare la actualizarea cererii';
    return Response.json({ error: message }, { status: 400 });
  }
}
