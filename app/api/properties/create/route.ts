export const dynamic = 'force-dynamic';

import { logActivity, getUserName } from '@/lib/activity-log';
import { contextHasPermission, requireApiAuth } from '@/lib/server/api-auth';
import { refreshDemandMatchesForProperty } from '@/lib/server/demand-matching';
import { normalizePropertyWrite } from '@/lib/property-form';

function errMsg(e: unknown): string {
  if (!e) return 'Eroare';
  if (e instanceof Error) return e.message;
  if (typeof e === 'object') {
    const o = e as Record<string, unknown>;
    return String(o.message || o.details || o.hint || JSON.stringify(e));
  }
  return String(e);
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiAuth(request, { module: 'properties', action: 'create' });
    if (!auth.ok) return auth.response;
    const { admin, serviceAdmin, user, agencyId } = auth.context;

    const body = await request.json();
    const { propertyData } = body;
    if (!propertyData) return Response.json({ error: 'Date lipsa' }, { status: 400 });
    const normalized = normalizePropertyWrite(propertyData, { mode: 'create' });
    if (normalized.errors.length) {
      return Response.json({ error: normalized.errors[0], errors: normalized.errors }, { status: 400 });
    }
    const attrs = normalized.attributes || {};
    const assignedAgentId = normalized.agentId || user.id;
    const ownerContactId = normalized.ownerContactId || null;

    const [{ data: assignedAgent }, { data: ownerContact }] = await Promise.all([
      admin.from('profiles').select('user_id').eq('user_id', assignedAgentId)
        .eq('agency_id', agencyId).eq('status', 'active').maybeSingle(),
      ownerContactId
        ? admin.from('contacts').select('id').eq('id', ownerContactId).eq('agency_id', agencyId)
          .is('deleted_at', null).eq('merge_status', 'active').maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (!assignedAgent) return Response.json({ error: 'Agentul selectat nu este activ în agenție.' }, { status: 400 });
    if (assignedAgentId !== user.id && !contextHasPermission(auth.context, 'properties', 'assign')) {
      return Response.json({ error: 'Nu ai dreptul să aloci proprietatea altui agent.' }, { status: 403 });
    }
    if (ownerContactId && !ownerContact) {
      return Response.json({ error: 'Proprietarul selectat nu este accesibil.' }, { status: 400 });
    }

    const payload = {
      ...normalized.columns,
      agency_id: agencyId,
      agent_id: assignedAgentId,
      responsible_agent_id: assignedAgentId,
      assigned_by_user_id: user.id,
      assigned_at: new Date().toISOString(),
      assignment_updated_at: new Date().toISOString(),
      assignment_status: 'assigned',
      assignment_reason: 'Alocare la crearea proprietății',
      owner_contact_id: ownerContactId,
      internal_code: typeof propertyData.internal_code === 'string' && propertyData.internal_code.trim()
        ? propertyData.internal_code.trim().slice(0, 80)
        : `PR-${Date.now()}`,
      vat_included: Boolean(attrs.tva_inclus),
      negotiable: Boolean(attrs.negociabil),
      show_exact_location: !attrs.ascunde_adresa,
      exclusive: Boolean(attrs.exclusivitate),
      attributes: attrs,
    };

    const { data: property, error: insertError } = await admin
      .from('properties').insert([payload]).select('id').single();

    if (insertError) return Response.json({ error: `Insert: ${errMsg(insertError)}` }, { status: 500 });

    const userName = await getUserName(user.id);
    await logActivity({
      agency_id: agencyId, entity_type: 'property', entity_id: property!.id,
      user_id: user.id, user_name: userName, action: 'create', new_value: String(normalized.columns.title),
    });

    const matching = normalized.columns.status === 'activa'
      ? await refreshDemandMatchesForProperty(serviceAdmin, agencyId, property!.id)
        .catch(() => ({ evaluated: 0, matched: 0 }))
      : { evaluated: 0, matched: 0 };

    return Response.json({
      property_id: property!.id,
      agency_id: agencyId,
      status: normalized.columns.status,
      matching,
    });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}
