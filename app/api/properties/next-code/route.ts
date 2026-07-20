export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'properties', action: 'create' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId } = auth.context;
    const { searchParams } = new URL(request.url);
    const rawPrefix = searchParams.get('prefix') || 'PR';
    const prefix = /^[A-Z]{1,4}$/.test(rawPrefix.toUpperCase()) ? rawPrefix.toUpperCase() : 'PR';

    const { data } = await admin
      .from('properties')
      .select('internal_code')
      .eq('agency_id', agencyId)
      .like('internal_code', `${prefix}-%`);

    let maxNum = 0;
    for (const row of data || []) {
      const parts = row.internal_code?.split('-');
      if (parts?.length === 2) {
        const codeNum = parseInt(parts[1], 10);
        if (!isNaN(codeNum) && codeNum > maxNum) maxNum = codeNum;
      }
    }

    const nextNum = String(maxNum + 1).padStart(4, '0');
    return Response.json({ code: `${prefix}-${nextNum}` });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
