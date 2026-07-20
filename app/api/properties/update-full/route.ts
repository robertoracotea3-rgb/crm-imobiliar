export const dynamic = 'force-dynamic';

import { logActivity, diffFields, getUserName } from '@/lib/activity-log';
import { requireApiAuth } from '@/lib/server/api-auth';

function errMsg(e: unknown): string {
  if (!e) return 'Eroare';
  if (e instanceof Error) return e.message;
  if (typeof e === 'object') {
    const o = e as Record<string, unknown>;
    return String(o.message || o.details || JSON.stringify(e));
  }
  return String(e);
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiAuth(request, { module: 'properties', action: 'edit' });
    if (!auth.ok) return auth.response;
    const { admin, user, agencyId } = auth.context;

    const body = await request.json();
    const { id, title, price, currency, description, county, city, zone, street, street_number, latitude, longitude, attributes, agent_id } = body;

    if (!id || typeof title !== 'string' || !title.trim()) {
      return Response.json({ error: 'ID sau titlu lipsă' }, { status: 400 });
    }
    if (price !== '' && price != null && (!Number.isFinite(Number(price)) || Number(price) < 0)) {
      return Response.json({ error: 'Preț invalid' }, { status: 400 });
    }

    if (agent_id) {
      const { data: assignedAgent } = await admin
        .from('profiles')
        .select('user_id')
        .eq('user_id', agent_id)
        .eq('agency_id', agencyId)
        .maybeSingle();
      if (!assignedAgent) {
        return Response.json({ error: 'Agentul selectat nu aparține agenției' }, { status: 400 });
      }
    }

    if (!id || !title) return Response.json({ error: 'ID sau titlu lipsă' }, { status: 400 });

    const updateData: Record<string, unknown> = {
      title: title.trim(),
      price: num(price),
      currency: currency || 'EUR',
      description: description || null,
      county: county || null,
      city: city || null,
      zone: zone || null,
      street: street || null,
      street_number: street_number || null,
      latitude: num(latitude),
      longitude: num(longitude),
      attributes: attributes || {},
      updated_at: new Date().toISOString(),
    };
    // agent_id: doar dacă a fost trimis (string = atribuit, '' / null = neasignat)
    if (agent_id !== undefined) updateData.agent_id = agent_id || null;

    // Snapshot current values for the activity log
    const { data: old } = await admin
      .from('properties')
      .select('title, price, currency, description, county, city, zone, street, street_number')
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!old) return Response.json({ error: 'Proprietatea nu există' }, { status: 404 });

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
        {
          title, price: num(price), currency: currency || 'EUR',
          description: description || null, county: county || null, city: city || null,
          zone: zone || null, street: street || null, street_number: street_number || null,
        },
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

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}
