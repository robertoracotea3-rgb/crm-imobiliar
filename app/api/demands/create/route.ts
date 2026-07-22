export const dynamic = 'force-dynamic';

import { requireApiAuth, type AuthenticatedContext } from '@/lib/server/api-auth';
import { normalizeLeadSource } from '@/lib/crm-catalogs';

async function generateCode(admin: AuthenticatedContext['admin'], agencyId: string): Promise<string> {
  const { data } = await admin
    .from('demands')
    .select('internal_code')
    .eq('agency_id', agencyId)
    .like('internal_code', 'CE-%')
    .order('internal_code', { ascending: false })
    .limit(1);

  if (!data || data.length === 0) return 'CE-0001';
  const last = data[0].internal_code as string;
  const lastNumber = parseInt(last.replace('CE-', ''), 10) || 0;
  return `CE-${String(lastNumber + 1).padStart(4, '0')}`;
}

async function profileExists(admin: AuthenticatedContext['admin'], agencyId: string, userId: string): Promise<boolean> {
  const { data } = await admin
    .from('profiles')
    .select('user_id')
    .eq('user_id', userId)
    .eq('agency_id', agencyId)
    .maybeSingle();

  return Boolean(data);
}

async function contactExists(admin: AuthenticatedContext['admin'], agencyId: string, contactId: string): Promise<boolean> {
  const { data } = await admin
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .eq('agency_id', agencyId)
    .is('deleted_at', null)
    .maybeSingle();

  return Boolean(data);
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'demands', action: 'create' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId, user } = auth.context;
    const body = await request.json();
    const c = body.criteria ?? {};

    if (c.agent_id && !(await profileExists(admin, agencyId, c.agent_id))) {
      return Response.json({ error: 'Agent invalid pentru aceasta agentie' }, { status: 400 });
    }

    if (c.contact_id && !(await contactExists(admin, agencyId, c.contact_id))) {
      return Response.json({ error: 'Contact invalid pentru aceasta agentie' }, { status: 400 });
    }

    const internal_code = await generateCode(admin, agencyId);
    const normalizedSource = normalizeLeadSource(c.source) || 'manual';

    const { error: insertError, data } = await admin.from('demands').insert([{
      internal_code,
      agency_id: agencyId,
      agent_id: c.agent_id || null,
      contact_id: c.contact_id || null,
      category: body.category || null,
      transaction: c.tip_tranzactie || null,
      source: normalizedSource,
      source_normalized: normalizedSource,
      budget_min: body.min_price ?? null,
      budget_max: body.max_price ?? null,
      currency: c.currency || 'EUR',
      cities: c.city ? [c.city] : null,
      counties: c.county ? [c.county] : null,
      notes: c.notes || null,
      criteria: c,
    }]).select().single();

    if (insertError) return Response.json({ error: insertError.message }, { status: 500 });

    if (data && c.agent_id) {
      try {
        let contactName = '';
        if (c.contact_id) {
          const { data: ct } = await admin
            .from('contacts')
            .select('full_name')
            .eq('id', c.contact_id)
            .eq('agency_id', agencyId)
            .is('deleted_at', null)
            .maybeSingle();

          if (ct?.full_name) contactName = ct.full_name;
        }

        await admin.from('calendar_events').insert({
          agency_id: agencyId,
          created_by: user.id,
          agent_id: c.agent_id,
          title: `Cerere noua ${internal_code}${contactName ? ` - ${contactName}` : ''}`,
          type: 'cerere',
          start_at: new Date().toISOString(),
          all_day: false,
          completed: false,
          description: c.notes || null,
        });
      } catch {
        // Evenimentul in calendar nu trebuie sa blocheze crearea cererii.
      }
    }

    return Response.json({ demand: data });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
