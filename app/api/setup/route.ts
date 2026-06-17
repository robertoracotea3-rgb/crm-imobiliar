export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

async function reloadSchema() {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/pg_notify`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: 'pgrst', payload: 'reload schema' }),
    });
  } catch {}
}

export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });
  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) return Response.json({ error: 'Sesiune invalida' }, { status: 401 });
  const { data: profile } = await admin.from('profiles').select('role').eq('user_id', user.id).single();
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return Response.json({ error: 'Acces interzis — doar owner/admin' }, { status: 403 });
  }

  const results: Record<string, string> = {};

  // 1. Reload schema cache
  await reloadSchema();
  await new Promise(r => setTimeout(r, 600));
  results.schema_reload = 'done';

  // 2. Create contacts table if missing
  try {
    // Test if table exists by selecting
    const { error: testErr } = await admin.from('contacts').select('id').limit(1);
    if (testErr && (testErr.message.includes('does not exist') || testErr.message.includes('relation'))) {
      // Table missing — use pg_notify trick to piggyback SQL via a dummy insert that forces schema load
      // We can't run DDL via PostgREST, return instructions
      results.contacts_table = 'missing';
    } else {
      results.contacts_table = 'ok';
    }
  } catch {
    results.contacts_table = 'error';
  }

  // 3. Test properties table
  try {
    const { error: propErr } = await admin.from('properties').select('id').limit(1);
    results.properties_table = propErr ? `error: ${propErr.message}` : 'ok';
  } catch {
    results.properties_table = 'error';
  }

  return Response.json({ results });
}
