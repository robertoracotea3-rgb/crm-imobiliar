export const dynamic = 'force-dynamic';

import { contextHasPermission, requireApiAuth } from '@/lib/server/api-auth';
import { appendAuditEvent } from '@/lib/server/audit-log';
import {
  MAIL_DOMAIN,
  normalizeMailLocalPart,
  personalMailAddress,
  PRIVILEGED_AGENCY_MAIL_LOCAL_PARTS,
  validateMailLocalPart,
} from '@/lib/mail';
import { ownMailbox } from '@/lib/server/mailbox-access';

function allowedAgencyAliases(role: string): string[] {
  return ['owner', 'admin'].includes(role)
    ? [...PRIVILEGED_AGENCY_MAIL_LOCAL_PARTS]
    : [];
}

function suggestions(fullName: string, allowedAliases: readonly string[]): string[] {
  const words = fullName
    .split(/\s+/)
    .map(normalizeMailLocalPart)
    .filter(Boolean);
  const first = words[0] || '';
  const last = words.at(-1) || '';
  return [...new Set([
    ...allowedAliases,
    first,
    first && last && first !== last ? `${first}.${last}` : '',
    first && last && first !== last ? `${last}.${first}` : '',
  ].filter(value => !validateMailLocalPart(value)))].slice(0, 3);
}

export async function GET(request: Request) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;
  if (!contextHasPermission(auth.context, 'mail', 'view')) {
    return Response.json({ error: 'Rolul tău nu are acces la e-mail.' }, { status: 403 });
  }
  try {
    const mailbox = await ownMailbox(auth.context);
    const { data: profile } = await auth.context.serviceAdmin
      .from('profiles')
      .select('full_name')
      .eq('agency_id', auth.context.agencyId)
      .eq('user_id', auth.context.user.id)
      .maybeSingle();
    const allowedAliases = allowedAgencyAliases(auth.context.role);
    return Response.json({
      mailbox,
      domain: MAIL_DOMAIN,
      can_claim: !mailbox && contextHasPermission(auth.context, 'mail', 'create'),
      allowed_aliases: allowedAliases,
      suggestions: suggestions(profile?.full_name || '', allowedAliases),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : 'Configurarea e-mailului nu poate fi verificată.',
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'mail', action: 'create' });
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({}));
  const localPart = normalizeMailLocalPart(body.local_part);
  const validationError = validateMailLocalPart(
    localPart,
    allowedAgencyAliases(auth.context.role),
  );
  if (validationError) return Response.json({ error: validationError }, { status: 400 });
  if (body.confirm_permanent !== true) {
    return Response.json({
      error: 'Confirmă că înțelegi că adresa aleasă rămâne legată permanent de cont.',
    }, { status: 400 });
  }

  try {
    const existing = await ownMailbox(auth.context);
    if (existing) return Response.json({ mailbox: existing, already_claimed: true });
    const { data, error } = await auth.context.db.rpc('crm_claim_personal_mailbox', {
      p_local_part: localPart,
    });
    if (error) {
      const message = /already_claimed|duplicate|unique/i.test(error.message)
        ? `Adresa ${personalMailAddress(localPart)} este deja folosită.`
        : /reserved/i.test(error.message)
          ? 'Această adresă este rezervată pentru funcțiile agenției.'
          : /invalid/i.test(error.message)
            ? 'Numele adresei nu este valid.'
            : 'Adresa nu a putut fi creată.';
      return Response.json({ error: message }, { status: 409 });
    }
    const mailbox = Array.isArray(data) ? data[0] : data;
    if (!mailbox?.id) throw new Error('mailbox_claim_missing_result');
    await appendAuditEvent({
      client: auth.context.serviceAdmin,
      request,
      agencyId: auth.context.agencyId,
      actorUserId: auth.context.user.id,
      actorRole: auth.context.role,
      action: 'mail.mailbox_claimed',
      entityType: 'crm_mailbox',
      entityId: mailbox.id,
      after: { address: mailbox.address, claimed_once: true },
    });
    return Response.json({ mailbox }, { status: 201 });
  } catch {
    return Response.json({ error: 'Adresa nu a putut fi creată.' }, { status: 500 });
  }
}
