export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'leads', action: 'edit' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId, user } = auth.context;
    const { lead_id, note } = await request.json();
    if (!lead_id || !note?.trim()) return Response.json({ error: 'Notita goala' }, { status: 400 });

    const { data: lead } = await admin
      .from('leads')
      .select('id, contact_id')
      .eq('id', lead_id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!lead) return Response.json({ error: 'Client negasit' }, { status: 404 });

    const { data, error } = await admin.from('activities').insert({
      agency_id: agencyId,
      type: 'note',
      title: 'Notita',
      description: String(note).trim().slice(0, 1000),
      lead_id,
      contact_id: lead.contact_id,
      user_id: user.id,
    }).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ activity: data }, { status: 201 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
