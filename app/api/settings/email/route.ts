export const dynamic = 'force-dynamic';

import { appendAuditEvent } from '@/lib/server/audit-log';
import { requireApiAuth } from '@/lib/server/api-auth';
import {
  sendOperationalEmail,
  verifyEmailProviderDomain,
} from '@/lib/server/email-provider';
import type { SupabaseClient } from '@supabase/supabase-js';

const DOMAIN = 'kiraimobiliare.ro';
const EMAIL_PATTERN = /^[^\s@]+@kiraimobiliare[.]ro$/i;
const DEFAULTS = {
  documents_email: 'documente@kiraimobiliare.ro',
  reports_email: 'rapoarte@kiraimobiliare.ro',
  reply_to_email: 'contact@kiraimobiliare.ro',
  sender_name: 'Kira Imobiliare',
  provider: 'resend',
  provider_domain_status: 'unconfirmed',
  provider_domain_verified_at: null,
  mailbox_status: 'unconfirmed',
  mailbox_verified_at: null,
  documents_verified_at: null,
  reports_verified_at: null,
  reply_to_verified_at: null,
  last_test_recipient: null,
  last_test_status: null,
  last_test_provider_id: null,
  last_test_accepted_at: null,
  last_success_at: null,
  last_error_at: null,
  last_error: null,
};

const cleanEmail = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase().slice(0, 320) : '';
const cleanText = (value: unknown, maximum: number): string =>
  typeof value === 'string' ? value.trim().slice(0, maximum) : '';

async function getSettings(
  serviceAdmin: SupabaseClient,
  agencyId: string,
) {
  const { data, error } = await serviceAdmin.from('agency_email_settings')
    .select('*').eq('agency_id', agencyId).maybeSingle();
  if (error) throw new Error(error.message);
  return { ...DEFAULTS, ...(data || {}), agency_id: agencyId };
}

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'settings', action: 'view' });
  if (!auth.ok) return auth.response;
  try {
    const settings = await getSettings(auth.context.serviceAdmin, auth.context.agencyId);
    const { data: logs, error } = await auth.context.serviceAdmin
      .from('email_delivery_logs')
      .select('id, message_type, recipient_email, subject, provider_message_id, status, attempt_number, error_code, error_message, accepted_at, failed_at, created_at')
      .eq('agency_id', auth.context.agencyId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return Response.json({ settings, recent_logs: logs || [] }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : 'Configurația de e-mail nu a putut fi încărcată.',
    }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(request, { module: 'settings', action: 'edit' });
  if (!auth.ok) return auth.response;
  const { serviceAdmin, agencyId, user } = auth.context;
  try {
    const body = await request.json().catch(() => ({}));
    const documentsEmail = cleanEmail(body.documents_email);
    const reportsEmail = cleanEmail(body.reports_email);
    const replyToEmail = cleanEmail(body.reply_to_email);
    const senderName = cleanText(body.sender_name, 120);
    if (![documentsEmail, reportsEmail, replyToEmail].every((email) => EMAIL_PATTERN.test(email))) {
      return Response.json({
        error: `Toate adresele trebuie să fie valide și să aparțină domeniului ${DOMAIN}.`,
      }, { status: 400 });
    }
    if (senderName.length < 2) {
      return Response.json({ error: 'Numele expeditorului este obligatoriu.' }, { status: 400 });
    }

    const existing = await getSettings(serviceAdmin, agencyId);
    const changedDocuments = existing.documents_email !== documentsEmail;
    const changedReports = existing.reports_email !== reportsEmail;
    const changedReplyTo = existing.reply_to_email !== replyToEmail;
    const patch = {
      agency_id: agencyId,
      documents_email: documentsEmail,
      reports_email: reportsEmail,
      reply_to_email: replyToEmail,
      sender_name: senderName,
      provider: 'resend',
      ...(changedDocuments ? { documents_verified_at: null } : {}),
      ...(changedReports ? { reports_verified_at: null } : {}),
      ...(changedReplyTo ? { reply_to_verified_at: null } : {}),
      ...((changedDocuments || changedReports) ? {
        mailbox_status: 'unconfirmed',
        mailbox_verified_at: null,
        mailbox_verified_by: null,
      } : {}),
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    };
    const { data, error } = await serviceAdmin.from('agency_email_settings')
      .upsert(patch, { onConflict: 'agency_id' }).select('*').single();
    if (error) throw new Error(error.message);

    await appendAuditEvent({
      client: serviceAdmin,
      request,
      agencyId,
      actorUserId: user.id,
      actorRole: auth.context.role,
      action: 'settings.email_updated',
      entityType: 'agency_email_settings',
      entityId: agencyId,
      before: {
        documents_email: existing.documents_email,
        reports_email: existing.reports_email,
        reply_to_email: existing.reply_to_email,
        sender_name: existing.sender_name,
      },
      after: {
        documents_email: data.documents_email,
        reports_email: data.reports_email,
        reply_to_email: data.reply_to_email,
        sender_name: data.sender_name,
      },
    });
    return Response.json({ settings: data });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : 'Configurația nu a putut fi salvată.',
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'settings', action: 'edit' });
  if (!auth.ok) return auth.response;
  const { serviceAdmin, agencyId, user } = auth.context;
  try {
    const body = await request.json().catch(() => ({}));
    const action = cleanText(body.action, 40);
    const settings = await getSettings(serviceAdmin, agencyId);

    if (action === 'verify_domain') {
      const result = await verifyEmailProviderDomain(DOMAIN);
      const now = new Date().toISOString();
      const { error } = await serviceAdmin.from('agency_email_settings').upsert({
        agency_id: agencyId,
        provider_domain_status: result.status,
        provider_domain_verified_at: result.verified ? now : null,
        last_error: result.error,
        last_error_at: result.error ? now : null,
        updated_at: now,
        updated_by: user.id,
      }, { onConflict: 'agency_id' });
      if (error) throw new Error(error.message);
      return Response.json(result, { status: result.error ? 422 : 200 });
    }

    if (action === 'send_test') {
      const recipient = cleanEmail(body.recipient || settings.documents_email);
      const allowed = [
        settings.documents_email,
        settings.reports_email,
        settings.reply_to_email,
      ];
      if (!allowed.includes(recipient)) {
        return Response.json({
          error: 'Testul poate fi trimis numai către una dintre adresele oficiale configurate.',
        }, { status: 400 });
      }
      const subject = `Test e-mail CRM Kira Imobiliare – ${new Intl.DateTimeFormat('ro-RO', {
        timeZone: 'Europe/Bucharest',
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date())}`;
      const result = await sendOperationalEmail({
        fromEmail: settings.documents_email,
        senderName: settings.sender_name,
        to: [recipient],
        replyTo: settings.reply_to_email,
        subject,
        text: 'Acesta este un test de livrare din CRM Kira Imobiliare. După primire, confirmă explicit în Setări.',
        html: '<p>Acesta este un test de livrare din <strong>CRM Kira Imobiliare</strong>.</p><p>După primire, confirmă explicit în Setări.</p>',
      });
      const now = new Date().toISOString();
      const { error: logError } = await serviceAdmin.from('email_delivery_logs').insert({
        agency_id: agencyId,
        message_type: 'configuration_test',
        recipient_email: recipient,
        subject,
        provider: result.provider,
        provider_message_id: result.messageId,
        status: result.accepted ? 'accepted' : 'failed',
        error_code: result.errorCode,
        error_message: result.errorMessage,
        accepted_at: result.accepted ? now : null,
        failed_at: result.accepted ? null : now,
        created_by: user.id,
        metadata: { mailbox_confirmation_required: true },
      });
      if (logError) {
        return Response.json({
          error: 'Testul a fost procesat de furnizor, dar dovada livrării nu a putut fi jurnalizată.',
          provider_accepted: result.accepted,
          provider_message_id: result.messageId,
        }, { status: 500 });
      }
      const { error } = await serviceAdmin.from('agency_email_settings').upsert({
        agency_id: agencyId,
        last_test_recipient: recipient,
        last_test_status: result.accepted ? 'accepted' : 'failed',
        last_test_provider_id: result.messageId,
        last_test_accepted_at: result.accepted ? now : null,
        mailbox_status: result.accepted ? 'accepted' : settings.mailbox_status,
        last_success_at: result.accepted ? now : settings.last_success_at,
        last_error_at: result.accepted ? null : now,
        last_error: result.errorMessage,
        updated_at: now,
        updated_by: user.id,
      }, { onConflict: 'agency_id' });
      if (error) throw new Error(error.message);
      return Response.json(result, { status: result.accepted ? 200 : 502 });
    }

    if (action === 'confirm_received') {
      const recipient = cleanEmail(body.recipient);
      const acceptedAt = settings.last_test_accepted_at
        ? new Date(settings.last_test_accepted_at).getTime()
        : 0;
      if (
        settings.last_test_status !== 'accepted'
        || settings.last_test_recipient !== recipient
        || Date.now() - acceptedAt > 24 * 60 * 60 * 1000
      ) {
        return Response.json({
          error: 'Confirmarea necesită un test acceptat în ultimele 24 de ore pentru aceeași adresă.',
        }, { status: 409 });
      }
      const now = new Date().toISOString();
      const verifiedPatch: Record<string, unknown> = {};
      if (recipient === settings.documents_email) verifiedPatch.documents_verified_at = now;
      if (recipient === settings.reports_email) verifiedPatch.reports_verified_at = now;
      if (recipient === settings.reply_to_email) verifiedPatch.reply_to_verified_at = now;
      const documentsVerified = Boolean(
        verifiedPatch.documents_verified_at || settings.documents_verified_at,
      );
      const reportsVerified = Boolean(
        verifiedPatch.reports_verified_at || settings.reports_verified_at,
      );
      const allRequiredVerified = documentsVerified && reportsVerified;
      Object.assign(verifiedPatch, {
        mailbox_status: allRequiredVerified ? 'verified' : 'accepted',
        mailbox_verified_at: allRequiredVerified ? now : null,
        mailbox_verified_by: allRequiredVerified ? user.id : null,
        updated_at: now,
        updated_by: user.id,
      });
      const { error } = await serviceAdmin.from('agency_email_settings').upsert({
        agency_id: agencyId,
        ...verifiedPatch,
      }, { onConflict: 'agency_id' });
      if (error) throw new Error(error.message);
      await appendAuditEvent({
        client: serviceAdmin,
        request,
        agencyId,
        actorUserId: user.id,
        actorRole: auth.context.role,
        action: 'settings.email_receipt_confirmed',
        entityType: 'agency_email_settings',
        entityId: agencyId,
        after: { recipient, all_required_verified: allRequiredVerified },
      });
      return Response.json({ verified: true, all_required_verified: allRequiredVerified });
    }

    return Response.json({ error: 'Acțiune de e-mail necunoscută.' }, { status: 400 });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : 'Operațiunea de e-mail a eșuat.',
    }, { status: 500 });
  }
}
