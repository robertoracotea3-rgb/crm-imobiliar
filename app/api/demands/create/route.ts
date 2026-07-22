export const dynamic = 'force-dynamic';

import { normalizeLeadSource } from '@/lib/crm-catalogs';
import { normalizeDemandRecord, type DemandRecordInput } from '@/lib/demand-record';
import { contextHasPermission, requireApiAuth, type AuthenticatedContext } from '@/lib/server/api-auth';

async function generateCode(admin: AuthenticatedContext['admin'], agencyId: string): Promise<string> {
  const { data } = await admin.from('demands')
    .select('internal_code')
    .eq('agency_id', agencyId)
    .like('internal_code', 'CE-%')
    .order('internal_code', { ascending: false })
    .limit(1);
  const lastNumber = Number.parseInt(String(data?.[0]?.internal_code || '').replace('CE-', ''), 10) || 0;
  return `CE-${String(lastNumber + 1).padStart(4, '0')}`;
}

async function profileExists(admin: AuthenticatedContext['admin'], agencyId: string, userId: string): Promise<boolean> {
  const { data } = await admin.from('profiles').select('user_id')
    .eq('user_id', userId).eq('agency_id', agencyId).eq('status', 'active').maybeSingle();
  return Boolean(data);
}

async function contactExists(admin: AuthenticatedContext['admin'], agencyId: string, contactId: string): Promise<boolean> {
  const { data } = await admin.from('contacts').select('id')
    .eq('id', contactId).eq('agency_id', agencyId).is('deleted_at', null).maybeSingle();
  return Boolean(data);
}

function inputFromBody(body: Record<string, unknown>): DemandRecordInput {
  const criteria = body.criteria && typeof body.criteria === 'object'
    ? body.criteria as Record<string, unknown>
    : {};
  return {
    ...criteria,
    ...body,
    contact_id: body.contact_id ?? criteria.contact_id,
    agent_id: body.agent_id ?? criteria.agent_id,
    intent: body.intent ?? criteria.intent ?? criteria.tip_cerere,
    transaction: body.transaction ?? criteria.tip_tranzactie,
    property_types: (body.property_types ?? criteria.property_types) as string[] | undefined,
    category: body.category as string | undefined,
    budget_min: body.budget_min ?? body.min_price ?? criteria.budget_min ?? (criteria.price_range as Record<string, unknown> | undefined)?.min,
    budget_max: body.budget_max ?? body.max_price ?? criteria.budget_max ?? (criteria.price_range as Record<string, unknown> | undefined)?.max,
    budget_unknown: body.budget_unknown ?? criteria.budget_unknown,
    counties: body.counties ?? (criteria.county ? [criteria.county] : []),
    cities: body.cities ?? (criteria.city ? [criteria.city] : []),
    zones: body.zones ?? criteria.zones ?? (criteria.zona ? [criteria.zona] : []),
    criteria,
  } as DemandRecordInput;
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'demands', action: 'create' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId, user } = auth.context;
    const body = await request.json() as Record<string, unknown>;
    const normalized = normalizeDemandRecord(inputFromBody(body));
    if (!normalized.contact_id) {
      return Response.json({ error: 'Selectează clientul pentru această cerere' }, { status: 400 });
    }
    if (!(await contactExists(admin, agencyId, normalized.contact_id))) {
      return Response.json({ error: 'Clientul nu este accesibil în această agenție' }, { status: 400 });
    }

    const agentId = normalized.agent_id || user.id;
    if (agentId !== user.id && !contextHasPermission(auth.context, 'demands', 'assign')) {
      return Response.json({ error: 'Nu ai dreptul să atribui cererea altui agent' }, { status: 403 });
    }
    if (!(await profileExists(admin, agencyId, agentId))) {
      return Response.json({ error: 'Agent invalid pentru această agenție' }, { status: 400 });
    }

    const internalCode = await generateCode(admin, agencyId);
    const source = normalizeLeadSource(normalized.source) || 'manual';
    const payload = {
      ...normalized,
      agency_id: agencyId,
      internal_code: internalCode,
      agent_id: agentId,
      source,
      source_normalized: source,
    };
    const { data, error } = await admin.from('demands').insert(payload).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    await admin.from('calendar_events').insert({
      agency_id: agencyId,
      created_by: user.id,
      agent_id: agentId,
      contact_id: normalized.contact_id,
      demand_id: data.id,
      title: `Cerere nouă ${internalCode}`,
      type: 'cerere',
      start_at: new Date().toISOString(),
      all_day: false,
      completed: false,
      description: normalized.notes,
    }).then(() => undefined, () => undefined);

    return Response.json({ demand: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Eroare la crearea cererii';
    return Response.json({ error: message }, { status: 400 });
  }
}
