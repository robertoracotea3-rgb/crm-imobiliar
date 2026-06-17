export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';
import { logActivity, getUserName } from '@/lib/activity-log';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VALID_STATUSES = ['activa', 'rezervata', 'tranzactionata', 'vanduta_noi', 'vanduta_altii', 'inchiriata', 'retrasa', 'expirata', 'draft', 'arhivata'];
const STATUS_LABELS: Record<string, string> = {
  activa: 'Activă', rezervata: 'Rezervată', tranzactionata: 'Tranzacționată',
  vanduta_noi: 'Vândută de noi', vanduta_altii: 'Vândută de alții', inchiriata: 'Închiriată',
  retrasa: 'Retrasă', expirata: 'Expirată', draft: 'Draft', arhivata: 'Arhivată',
};

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
    const { id, status } = body;

    if (!id) return Response.json({ error: 'ID lipsă' }, { status: 400 });
    if (!status || !VALID_STATUSES.includes(status)) {
      return Response.json({ error: `Status invalid. Permis: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
    }

    // Verify ownership
    const { data: prop } = await admin
      .from('properties').select('id, agency_id, status').eq('id', id).single();
    if (!prop) return Response.json({ error: 'Proprietatea nu există' }, { status: 404 });
    if (prop.agency_id !== profile.agency_id) {
      return Response.json({ error: 'Acces interzis' }, { status: 403 });
    }

    const { error } = await admin
      .from('properties')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    if (prop.status !== status) {
      const userName = await getUserName(user.id);
      await logActivity({
        agency_id: profile.agency_id, entity_type: 'property', entity_id: id,
        user_id: user.id, user_name: userName, action: 'status', field: 'Status',
        old_value: STATUS_LABELS[prop.status] || prop.status, new_value: STATUS_LABELS[status] || status,
      });
    }

    return Response.json({ success: true, status });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
