export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

const TABLES = [
  'lead_sources',
  'lead_statuses',
  'property_statuses',
  'viewing_statuses',
  'transaction_statuses',
  'activity_types',
] as const;

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'dashboard', action: 'view' });
  if (!auth.ok) return auth.response;

  try {
    const { admin } = auth.context;
    const entries = await Promise.all(TABLES.map(async (table) => {
      const { data, error } = await admin.from(table).select('*').order('display_order');
      if (error) throw new Error(`Catalog indisponibil: ${table}`);
      return [table, data || []] as const;
    }));
    const { data: transitions, error: transitionError } = await admin
      .from('crm_status_transitions')
      .select('entity_type, from_code, to_code')
      .eq('is_active', true);
    if (transitionError) throw new Error('Tranzițiile nu pot fi încărcate');

    return Response.json({ catalogs: Object.fromEntries(entries), transitions: transitions || [] });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Catalog indisponibil' }, { status: 500 });
  }
}
