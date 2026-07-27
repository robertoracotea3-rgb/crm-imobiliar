export const dynamic = 'force-dynamic';

import { contextCanManageAll, requireApiAuth } from '@/lib/server/api-auth';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const auth = await requireApiAuth(request, { module: 'mail', action: 'view' });
  if (!auth.ok) return auth.response;
  try {
    const { id, attachmentId } = await params;
    const { data: attachment, error } = await auth.context.serviceAdmin
      .from('crm_mail_attachments')
      .select(
        'id,message_id,storage_path,status,crm_mailboxes!crm_mail_attachments_mailbox_agency_fk!inner(user_id)',
      )
      .eq('id', attachmentId)
      .eq('message_id', id)
      .eq('agency_id', auth.context.agencyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!attachment) return Response.json({ error: 'Atașamentul nu există.' }, { status: 404 });
    const mailbox = Array.isArray(attachment.crm_mailboxes)
      ? attachment.crm_mailboxes[0]
      : attachment.crm_mailboxes;
    if (mailbox?.user_id !== auth.context.user.id && !contextCanManageAll(auth.context, 'mail')) {
      return Response.json({ error: 'Acces interzis.' }, { status: 403 });
    }
    if (attachment.status !== 'available' || !attachment.storage_path) {
      return Response.json({ error: 'Atașamentul este blocat sau indisponibil.' }, { status: 423 });
    }
    const { data, error: signedError } = await auth.context.serviceAdmin.storage
      .from('crm-mail-attachments')
      .createSignedUrl(attachment.storage_path, 60);
    if (signedError || !data?.signedUrl) throw new Error(signedError?.message || 'signed_url_failed');
    return Response.redirect(data.signedUrl, 302);
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : 'Atașamentul nu poate fi descărcat.',
    }, { status: 500 });
  }
}
