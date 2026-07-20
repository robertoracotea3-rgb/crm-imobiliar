export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

function errMsg(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Eroare internă';
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiAuth(request, { module: 'properties', action: 'edit' });
    if (!auth.ok) return auth.response;
    const { admin, agencyId } = auth.context;

    const body = await request.json();
    const { id, title, price, description } = body;
    if (!id || typeof title !== 'string' || !title.trim()) {
      return Response.json({ error: 'ID sau titlu lipsă' }, { status: 400 });
    }

    const parsedPrice = price === '' || price == null ? null : Number(price);
    if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
      return Response.json({ error: 'Preț invalid' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('properties')
      .update({
        title: title.trim(),
        price: parsedPrice,
        description: typeof description === 'string' ? description.trim() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!data) return Response.json({ error: 'Proprietatea nu există' }, { status: 404 });
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: errMsg(error) }, { status: 500 });
  }
}
