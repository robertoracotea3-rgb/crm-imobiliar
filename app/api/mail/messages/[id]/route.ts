export const dynamic = 'force-dynamic';

import { appendAuditEvent } from '@/lib/server/audit-log';
import {
  contextCanManageAll,
  requireApiAuth,
  type AuthenticatedContext,
} from '@/lib/server/api-auth';

async function accessibleMessage(
  context: AuthenticatedContext,
  id: string,
) {
  const { data: message, error } = await context.serviceAdmin
    .from('crm_mail_messages')
    .select('*,crm_mailboxes!inner(user_id,address,display_name)')
    .eq('id', id)
    .eq('agency_id', context.agencyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!message) return null;
  const mailbox = Array.isArray(message.crm_mailboxes)
    ? message.crm_mailboxes[0]
    : message.crm_mailboxes;
  if (mailbox?.user_id !== context.user.id && !contextCanManageAll(context, 'mail')) return null;
  return { ...message, crm_mailboxes: mailbox };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAuth(request, { module: 'mail', action: 'view' });
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const message = await accessibleMessage(auth.context, id);
    if (!message) return Response.json({ error: 'Mesajul nu există.' }, { status: 404 });
    const { data: attachments, error } = await auth.context.serviceAdmin
      .from('crm_mail_attachments')
      .select('id,filename,content_type,size_bytes,content_id,disposition,status')
      .eq('agency_id', auth.context.agencyId)
      .eq('message_id', id)
      .order('created_at');
    if (error) throw new Error(error.message);
    return Response.json({ message: { ...message, attachments: attachments || [] } }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : 'Mesajul nu a putut fi încărcat.',
    }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAuth(request, { module: 'mail', action: 'edit' });
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const message = await accessibleMessage(auth.context, id);
    if (!message) return Response.json({ error: 'Mesajul nu există.' }, { status: 404 });
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '');
    const now = new Date().toISOString();
    const patch: Record<string, string | null> = { updated_at: now };
    if (action === 'read') patch.read_at = now;
    else if (action === 'unread') patch.read_at = null;
    else if (action === 'archive') {
      patch.folder = 'archive';
      patch.archived_at = now;
    } else if (action === 'restore') {
      patch.folder = message.direction === 'outbound' ? 'sent' : 'inbox';
      patch.archived_at = null;
    } else if (action === 'trash') patch.folder = 'trash';
    else return Response.json({ error: 'Acțiune invalidă.' }, { status: 400 });

    const { data, error } = await auth.context.serviceAdmin
      .from('crm_mail_messages')
      .update(patch)
      .eq('id', id)
      .eq('agency_id', auth.context.agencyId)
      .select('id,folder,read_at,archived_at,updated_at')
      .single();
    if (error) throw new Error(error.message);
    if (['archive', 'restore', 'trash'].includes(action)) {
      await appendAuditEvent({
        client: auth.context.serviceAdmin,
        request,
        agencyId: auth.context.agencyId,
        actorUserId: auth.context.user.id,
        actorRole: auth.context.role,
        action: `mail.message_${action}`,
        entityType: 'crm_mail_message',
        entityId: id,
        before: { folder: message.folder },
        after: { folder: data.folder },
      });
    }
    return Response.json({ message: data });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : 'Mesajul nu a putut fi actualizat.',
    }, { status: 500 });
  }
}
