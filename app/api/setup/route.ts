export const dynamic = 'force-dynamic';

import { getAdminClient, requireApiAuth } from '@/lib/server/api-auth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = getAdminClient();

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
  } catch {
    // Best-effort only.
  }
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'settings', action: 'edit' });
  if (!auth.ok) return auth.response;

  const results: Record<string, string> = {};

  await reloadSchema();
  await new Promise((r) => setTimeout(r, 600));
  results.schema_reload = 'done';

  try {
    const { error: testErr } = await admin.from('contacts').select('id').limit(1);
    if (testErr && (testErr.message.includes('does not exist') || testErr.message.includes('relation'))) {
      results.contacts_table = 'missing';
    } else {
      results.contacts_table = 'ok';
    }
  } catch {
    results.contacts_table = 'error';
  }

  try {
    const { error: propErr } = await admin.from('properties').select('id').limit(1);
    results.properties_table = propErr ? `error: ${propErr.message}` : 'ok';
  } catch {
    results.properties_table = 'error';
  }

  return Response.json({ results });
}
