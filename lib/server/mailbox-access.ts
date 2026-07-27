import 'server-only';

import type { AuthenticatedContext } from '@/lib/server/api-auth';
import { contextCanManageAll } from '@/lib/server/api-auth';

export type MailboxRecord = {
  id: string;
  agency_id: string;
  user_id: string;
  local_part: string;
  domain: string;
  address: string;
  display_name: string;
  status: 'active' | 'disabled';
  claimed_at: string;
};

export async function ownMailbox(context: AuthenticatedContext): Promise<MailboxRecord | null> {
  const { data, error } = await context.serviceAdmin
    .from('crm_mailboxes')
    .select('id,agency_id,user_id,local_part,domain,address,display_name,status,claimed_at')
    .eq('agency_id', context.agencyId)
    .eq('user_id', context.user.id)
    .maybeSingle();
  if (error) {
    if (/relation|does not exist|schema cache/i.test(error.message)) return null;
    throw new Error(error.message);
  }
  return data as MailboxRecord | null;
}

export async function accessibleMailbox(
  context: AuthenticatedContext,
  requestedId?: string | null,
): Promise<MailboxRecord | null> {
  if (!requestedId) return ownMailbox(context);
  let query = context.serviceAdmin
    .from('crm_mailboxes')
    .select('id,agency_id,user_id,local_part,domain,address,display_name,status,claimed_at')
    .eq('agency_id', context.agencyId)
    .eq('id', requestedId);
  if (!contextCanManageAll(context, 'mail')) query = query.eq('user_id', context.user.id);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return data as MailboxRecord | null;
}

export async function agencyMailboxes(context: AuthenticatedContext): Promise<MailboxRecord[]> {
  let query = context.serviceAdmin
    .from('crm_mailboxes')
    .select('id,agency_id,user_id,local_part,domain,address,display_name,status,claimed_at')
    .eq('agency_id', context.agencyId)
    .eq('status', 'active')
    .order('display_name');
  if (!contextCanManageAll(context, 'mail')) {
    query = query.eq('user_id', context.user.id);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as MailboxRecord[];
}

export function mailboxRequiredResponse(): Response {
  return Response.json({
    error: 'Alege adresa personală de e-mail înainte de a deschide inboxul.',
    code: 'MAILBOX_REQUIRED',
    next_path: '/auth/email-setup',
  }, { status: 409 });
}
