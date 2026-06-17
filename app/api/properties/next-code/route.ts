export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });

    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return Response.json({ error: 'Sesiune invalida' }, { status: 401 });

    const { data: profile } = await admin.from('profiles').select('agency_id').eq('user_id', user.id).single();
    if (!profile?.agency_id) return Response.json({ error: 'Agentie negasita' }, { status: 400 });

    const { searchParams } = new URL(request.url);
    const rawPrefix = searchParams.get('prefix') || 'PR';

    // Whitelist: 1-4 uppercase letters only — prevents LIKE injection
    const prefix = /^[A-Z]{1,4}$/.test(rawPrefix.toUpperCase())
      ? rawPrefix.toUpperCase()
      : 'PR';

    const { data } = await admin
      .from('properties')
      .select('internal_code')
      .eq('agency_id', profile.agency_id)
      .like('internal_code', `${prefix}-%`);

    let maxNum = 0;
    if (data && data.length > 0) {
      for (const row of data) {
        const parts = row.internal_code?.split('-');
        if (parts && parts.length === 2) {
          const num = parseInt(parts[1], 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      }
    }

    const nextNum = String(maxNum + 1).padStart(4, '0');
    return Response.json({ code: `${prefix}-${nextNum}` });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
