export const dynamic = 'force-dynamic';

import { NOTIFICATION_PRIORITIES, syncTimeBasedNotifications } from '@/lib/server/notifications';
import { requireApiAuth } from '@/lib/server/api-auth';

const PAGE_SIZE_MAX = 50;
const SELECT_FIELDS = 'id,type,title,message,entity_type,entity_id,priority,action_url,metadata,read_at,dismissed_at,expires_at,created_at,updated_at';

function pageParam(value: string | null, fallback: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'notifications', action: 'view' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, serviceAdmin, agencyId, user } = auth.context;
    const params = new URL(request.url).searchParams;
    const sync = await syncTimeBasedNotifications(admin, serviceAdmin, agencyId, user.id);
    const unreadQuery = admin.from('notifications').select('id', { count: 'exact', head: true })
      .eq('agency_id', agencyId).eq('user_id', user.id).is('read_at', null).is('dismissed_at', null);
    const { count: unreadCount, error: unreadError } = await unreadQuery;
    if (unreadError) {
      if (/relation|does not exist/i.test(unreadError.message)) {
        return Response.json({ notifications: [], unread_count: 0, needsMigration: true,
          pagination: { page: 1, page_size: 0, total: 0, pages: 0 } });
      }
      return Response.json({ error: unreadError.message }, { status: 500 });
    }

    if (params.get('summary') === '1') {
      return Response.json({ unread_count: unreadCount ?? 0, sync_warnings: sync.warnings });
    }

    const page = pageParam(params.get('page'), 1, 100_000);
    const pageSize = pageParam(params.get('page_size'), 25, PAGE_SIZE_MAX);
    const from = (page - 1) * pageSize;
    let query = admin.from('notifications').select(SELECT_FIELDS, { count: 'exact' })
      .eq('agency_id', agencyId).eq('user_id', user.id);
    if (params.get('dismissed') === '1') query = query.not('dismissed_at', 'is', null);
    else query = query.is('dismissed_at', null);
    if (params.get('unread') === '1') query = query.is('read_at', null);
    const priority = params.get('priority');
    if (priority) {
      if (!(NOTIFICATION_PRIORITIES as readonly string[]).includes(priority)) {
        return Response.json({ error: 'Prioritate invalidă.' }, { status: 400 });
      }
      query = query.eq('priority', priority);
    }
    const type = params.get('type')?.trim().slice(0, 80);
    if (type) query = query.eq('type', type);
    const { data, error, count } = await query.order('created_at', { ascending: false })
      .order('id', { ascending: true }).range(from, from + pageSize - 1);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const total = count ?? 0;
    return Response.json({
      notifications: data ?? [], unread_count: unreadCount ?? 0, sync_warnings: sync.warnings,
      pagination: { page, page_size: pageSize, total, pages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Eroare necunoscută' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(request, { module: 'notifications', action: 'edit' });
  if (!auth.ok) return auth.response;
  try {
    const { admin, agencyId, user } = auth.context;
    const body = await request.json();
    const action = String(body.action || '');
    const now = new Date().toISOString();

    if (action === 'read_all') {
      const { error } = await admin.from('notifications').update({ read_at: now, updated_at: now })
        .eq('agency_id', agencyId).eq('user_id', user.id).is('read_at', null).is('dismissed_at', null);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ success: true, unread_count: 0 });
    }
    if (action === 'dismiss_all_read') {
      const { error } = await admin.from('notifications').update({ dismissed_at: now, updated_at: now })
        .eq('agency_id', agencyId).eq('user_id', user.id).not('read_at', 'is', null).is('dismissed_at', null);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ success: true });
    }

    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) return Response.json({ error: 'ID lipsă.' }, { status: 400 });
    const updates: Record<string, string | null> = { updated_at: now };
    if (action === 'read') updates.read_at = now;
    else if (action === 'unread') updates.read_at = null;
    else if (action === 'dismiss') updates.dismissed_at = now;
    else if (action === 'restore') updates.dismissed_at = null;
    else return Response.json({ error: 'Acțiune invalidă.' }, { status: 400 });

    const { data, error } = await admin.from('notifications').update(updates)
      .eq('id', id).eq('agency_id', agencyId).eq('user_id', user.id)
      .select('id,read_at,dismissed_at,updated_at').maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!data) return Response.json({ error: 'Notificarea nu există.' }, { status: 404 });
    return Response.json({ notification: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Eroare necunoscută' }, { status: 500 });
  }
}
