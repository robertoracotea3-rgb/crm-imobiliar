import 'server-only';

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

import { DEFAULT_PERMISSIONS } from '@/lib/team-roles';

export type CrmRole = 'owner' | 'admin' | 'manager' | 'agent_senior' | 'agent' | 'assistant';
export type CrmAction = 'view' | 'create' | 'edit' | 'delete' | 'export';

export interface AuthenticatedContext {
  admin: SupabaseClient;
  user: User;
  agencyId: string;
  role: CrmRole;
}
export type AuthResult =
  | { ok: true; context: AuthenticatedContext }
  | { ok: false; response: Response };

let adminClient: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Configurarea Supabase server-side lipsește');
  }

  adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export async function requireApiAuth(
  request: Request,
  permission?: { module: string; action: CrmAction },
): Promise<AuthResult> {
  const token = bearerToken(request);
  if (!token) {
    return { ok: false, response: Response.json({ error: 'Neautentificat' }, { status: 401 }) };
  }

  const admin = getAdminClient();
  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) {
    return { ok: false, response: Response.json({ error: 'Sesiune invalidă' }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('agency_id, role')
    .eq('user_id', user.id)
    .single();

  if (profileError || !profile?.agency_id) {
    return { ok: false, response: Response.json({ error: 'Profil CRM incomplet' }, { status: 403 }) };
  }

  const role = (profile.role || 'agent') as CrmRole;
  if (permission && !DEFAULT_PERMISSIONS[role]?.[permission.module]?.[permission.action]) {
    return { ok: false, response: Response.json({ error: 'Acces interzis' }, { status: 403 }) };
  }

  return {
    ok: true,
    context: { admin, user, agencyId: profile.agency_id, role },
  };
}
