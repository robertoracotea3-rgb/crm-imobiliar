import 'server-only';

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

import {
  effectivePermissions,
  hasPermission,
  normalizeCrmRole,
  type CrmAction,
  type CrmModule,
  type CrmRole,
  type PermissionMap,
} from '@/lib/team-roles';
import { appendAuditEvent } from '@/lib/server/audit-log';

export type { CrmAction, CrmModule, CrmRole } from '@/lib/team-roles';

export interface AuthenticatedContext {
  /** User-scoped database client. RLS is always enforced. */
  db: SupabaseClient;
  /** Backwards-compatible alias for db; it is intentionally not service-role. */
  admin: SupabaseClient;
  /** Privileged server client. Use only after explicit permission and row checks. */
  serviceAdmin: SupabaseClient;
  user: User;
  agencyId: string;
  role: CrmRole;
  permissions: PermissionMap;
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

function getUserScopedClient(token: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Configurarea Supabase pentru sesiunea utilizatorului lipsește');
  }

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

async function logDeniedPermission(
  serviceAdmin: SupabaseClient,
  request: Request,
  userId: string,
  agencyId: string,
  role: CrmRole,
  permission: { module: CrmModule; action: CrmAction },
): Promise<void> {
  const path = (() => {
    try { return new URL(request.url).pathname; } catch { return null; }
  })();

  await serviceAdmin.from('security_events').insert({
    agency_id: agencyId,
    user_id: userId,
    event_type: 'permission_denied',
    module: permission.module,
    action: permission.action,
    route: path,
    role,
    result: 'denied',
  }).then(() => undefined, () => undefined);
  await appendAuditEvent({
    client: serviceAdmin,
    request,
    agencyId,
    actorUserId: userId,
    actorRole: role,
    action: 'authorization.permission_denied',
    entityType: 'api_route',
    entityId: path,
    result: 'denied',
    reason: `${permission.module}.${permission.action}`,
    metadata: { module: permission.module, requested_action: permission.action },
  }).catch(() => undefined);
}

export function contextHasPermission(
  context: Pick<AuthenticatedContext, 'role' | 'permissions'>,
  module: CrmModule,
  action: CrmAction,
): boolean {
  return context.permissions[module]?.[action] === true;
}

export function contextCanManageAll(
  context: Pick<AuthenticatedContext, 'role' | 'permissions'>,
  module: CrmModule,
): boolean {
  return contextHasPermission(context, module, 'manage_all');
}

export async function requireApiAuth(
  request: Request,
  permission?: { module: CrmModule; action: CrmAction },
): Promise<AuthResult> {
  const token = bearerToken(request);
  if (!token) {
    return { ok: false, response: Response.json({ error: 'Neautentificat' }, { status: 401 }) };
  }

  const serviceAdmin = getAdminClient();
  const { data: { user }, error: userError } = await serviceAdmin.auth.getUser(token);
  if (userError || !user) {
    return { ok: false, response: Response.json({ error: 'Sesiune invalidă' }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await serviceAdmin
    .from('profiles')
    .select('agency_id, role, permissions, status')
    .eq('user_id', user.id)
    .single();

  if (profileError || !profile?.agency_id) {
    return { ok: false, response: Response.json({ error: 'Profil CRM incomplet' }, { status: 403 }) };
  }
  if (profile.status && profile.status !== 'active') {
    return { ok: false, response: Response.json({ error: 'Cont CRM dezactivat' }, { status: 403 }) };
  }

  const role = normalizeCrmRole(profile.role);
  const permissions = effectivePermissions(role, profile.permissions);
  if (permission && !hasPermission(role, permission.module, permission.action, profile.permissions)) {
    await logDeniedPermission(serviceAdmin, request, user.id, profile.agency_id, role, permission);
    return { ok: false, response: Response.json({ error: 'Acces interzis' }, { status: 403 }) };
  }

  const db = getUserScopedClient(token);
  return {
    ok: true,
    context: {
      db,
      admin: db,
      serviceAdmin,
      user,
      agencyId: profile.agency_id,
      role,
      permissions,
    },
  };
}
