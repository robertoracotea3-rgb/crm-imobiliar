export const dynamic = 'force-dynamic';

import { logActivity, diffFields, getUserName } from '@/lib/activity-log';
import { normalizePropertyWrite } from '@/lib/property-form';
import { contextHasPermission, requireApiAuth } from '@/lib/server/api-auth';
import { refreshDemandMatchesForProperty } from '@/lib/server/demand-matching';

function errMsg(e: unknown): string {
  if (!e) return 'Eroare';
  if (e instanceof Error) return e.message;
  if (typeof e === 'object') {
    const o = e as Record<string, unknown>;
    return String(o.message || o.details || JSON.stringify(e));
  }
  return String(e);
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiAuth(request, { module: 'properties', action: 'edit' });
    if (!auth.ok) return auth.response;
    const { admin, serviceAdmin, user, agencyId } = auth.context;

    const body = await request.json();
    const { id } = body;
    if (typeof id !== 'string' || !id) return Response.json({ error: 'ID lipsă.' }, { status: 400 });
    const normalized = normalizePropertyWrite(body, { mode: 'update' });
    if (normalized.errors.length) {
      return Response.json({ error: normalized.errors[0], errors: normalized.errors }, { status: 400 });
    }

    if (normalized.agentId) {
      const { data: assignedAgent } = await admin
        .from('profiles')
        .select('user_id')
        .eq('user_id', normalized.agentId)
        .eq('agency_id', agencyId)
        .eq('status', 'active')
        .maybeSingle();
      if (!assignedAgent) {
        return Response.json({ error: 'Agentul selectat nu este activ în agenție.' }, { status: 400 });
      }
    }
    if (normalized.ownerContactId) {
      const { data: ownerContact } = await admin.from('contacts').select('id')
        .eq('id', normalized.ownerContactId).eq('agency_id', agencyId)
        .is('deleted_at', null).eq('merge_status', 'active').maybeSingle();
      if (!ownerContact) {
        return Response.json({ error: 'Proprietarul selectat nu este accesibil.' }, { status: 400 });
      }
    }

    const updateData: Record<string, unknown> = {
      ...normalized.columns,
      updated_at: new Date().toISOString(),
    };
    if (normalized.attributes !== undefined) {
      updateData.attributes = normalized.attributes;
      updateData.vat_included = Boolean(normalized.attributes.tva_inclus);
      updateData.negotiable = Boolean(normalized.attributes.negociabil);
      updateData.show_exact_location = !normalized.attributes.ascunde_adresa;
      updateData.exclusive = Boolean(normalized.attributes.exclusivitate);
    }
    if (normalized.ownerContactId !== undefined) updateData.owner_contact_id = normalized.ownerContactId;

    // Snapshot current values for the activity log
    const { data: old } = await admin
      .from('properties').select('*')
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!old) return Response.json({ error: 'Proprietatea nu există' }, { status: 404 });
    if (
      normalized.agentId !== undefined
      && normalized.agentId !== (old.responsible_agent_id || old.agent_id || null)
    ) {
      if (!contextHasPermission(auth.context, 'properties', 'assign')) {
        return Response.json({ error: 'Realocarea proprietății necesită dreptul de alocare.' }, { status: 403 });
      }
      return Response.json({
        error: 'Folosește dialogul de alocare pentru a păstra motivul, istoricul și efectele asupra activităților.',
        code: 'USE_ASSIGNMENT_WORKFLOW',
      }, { status: 409 });
    }
    if (normalized.attributes !== undefined) {
      const oldAttributes = old.attributes && typeof old.attributes === 'object'
        ? old.attributes as Record<string, unknown>
        : {};
      updateData.attributes = {
        ...normalized.attributes,
        // Galeria este sincronizată numai de fluxul media atomic. Salvarea
        // formularului nu are voie să o golească înainte de confirmarea lui.
        photos: Array.isArray(oldAttributes.photos) ? oldAttributes.photos : [],
      };
    }

    const { error } = await admin
      .from('properties')
      .update(updateData)
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null);

    if (error) return Response.json({ error: errMsg(error) }, { status: 500 });

    // Log field-level changes (best-effort; never blocks the response)
    if (old) {
      const changes = diffFields(
        old as Record<string, unknown>,
        updateData,
        {
          title: 'Titlu', price: 'Preț', currency: 'Monedă', description: 'Descriere',
          county: 'Județ', city: 'Localitate', zone: 'Zonă/Cartier', street: 'Stradă', street_number: 'Număr',
        }
      );
      if (changes.length > 0) {
        const userName = await getUserName(user.id);
        await logActivity(changes.map(c => ({
          agency_id: agencyId, entity_type: 'property', entity_id: id,
          user_id: user.id, user_name: userName, action: 'update',
          field: c.field, old_value: c.old_value, new_value: c.new_value,
        })));
      }
    }

    const matching = await refreshDemandMatchesForProperty(serviceAdmin, agencyId, id)
      .catch(() => ({ evaluated: 0, matched: 0 }));
    return Response.json({ success: true, matching });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}
