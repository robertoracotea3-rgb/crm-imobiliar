export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';
import {
  accessibleMailbox,
  agencyMailboxes,
  mailboxRequiredResponse,
} from '@/lib/server/mailbox-access';

const FOLDERS = new Set(['inbox', 'sent', 'drafts', 'archive', 'spam', 'trash']);

function positiveInteger(value: string | null, fallback: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'mail', action: 'view' });
  if (!auth.ok) return auth.response;
  try {
    const params = new URL(request.url).searchParams;
    const mailbox = await accessibleMailbox(auth.context, params.get('mailbox_id'));
    if (!mailbox) return mailboxRequiredResponse();

    const unreadQuery = auth.context.serviceAdmin
      .from('crm_mail_messages')
      .select('id', { count: 'exact', head: true })
      .eq('agency_id', auth.context.agencyId)
      .eq('mailbox_id', mailbox.id)
      .eq('direction', 'inbound')
      .eq('folder', 'inbox')
      .is('read_at', null);
    const { count: unreadCount, error: unreadError } = await unreadQuery;
    if (unreadError) throw new Error(unreadError.message);
    if (params.get('summary') === '1') {
      return Response.json({ mailbox, unread_count: unreadCount || 0 });
    }

    const folder = params.get('folder') || 'inbox';
    if (!FOLDERS.has(folder)) return Response.json({ error: 'Dosar de e-mail invalid.' }, { status: 400 });
    const page = positiveInteger(params.get('page'), 1, 100_000);
    const pageSize = positiveInteger(params.get('page_size'), 30, 50);
    const from = (page - 1) * pageSize;
    let query = auth.context.serviceAdmin
      .from('crm_mail_messages')
      .select(
        'id,direction,folder,from_email,from_name,to_emails,reply_to_email,subject,snippet,status,read_at,archived_at,sent_at,received_at,contact_id,lead_id,property_id,created_at',
        { count: 'exact' },
      )
      .eq('agency_id', auth.context.agencyId)
      .eq('mailbox_id', mailbox.id)
      .eq('folder', folder);
    const search = params.get('q')?.trim().slice(0, 120);
    if (search) {
      const escaped = search.replace(/[%_,()]/g, '');
      if (escaped) query = query.or(`subject.ilike.%${escaped}%,from_email.ilike.%${escaped}%,snippet.ilike.%${escaped}%`);
    }
    const { data, error, count } = await query
      .order('received_at', { ascending: false, nullsFirst: false })
      .order('sent_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);

    const mailboxes = await agencyMailboxes(auth.context);
    const total = count || 0;
    return Response.json({
      mailbox,
      mailboxes,
      messages: data || [],
      unread_count: unreadCount || 0,
      pagination: { page, page_size: pageSize, total, pages: Math.ceil(total / pageSize) },
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : 'Inboxul nu a putut fi încărcat.',
    }, { status: 500 });
  }
}
