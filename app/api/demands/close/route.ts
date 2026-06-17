export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VALID_CLOSE_STATUSES = ['indeplinita', 'anulata'];

export async function PATCH(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });

    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return Response.json({ error: 'Sesiune invalida' }, { status: 401 });

    const { data: profile } = await admin
      .from('profiles').select('agency_id').eq('user_id', user.id).single();
    if (!profile?.agency_id) return Response.json({ error: 'Agentie negasita' }, { status: 400 });

    const body = await request.json();
    const { id, close_status, close_comment } = body;

    if (!id) return Response.json({ error: 'ID cerere lipsă' }, { status: 400 });
    if (!close_status || !VALID_CLOSE_STATUSES.includes(close_status)) {
      return Response.json({ error: 'Status de închidere invalid. Permis: indeplinita, anulata' }, { status: 400 });
    }
    if (!close_comment || close_comment.trim().length < 5) {
      return Response.json({ error: 'Comentariul de închidere este obligatoriu (minim 5 caractere)' }, { status: 400 });
    }

    // Verify ownership
    const { data: demand } = await admin.from('demands').select('id, agency_id').eq('id', id).single();
    if (!demand) return Response.json({ error: 'Cererea nu există' }, { status: 404 });
    if (demand.agency_id !== profile.agency_id) return Response.json({ error: 'Acces interzis' }, { status: 403 });

    const { data, error } = await admin.from('demands').update({
      status: close_status,
      notes: close_comment.trim(),
      updated_at: new Date().toISOString(),
    }).eq('id', id).select().single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ demand: data });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
