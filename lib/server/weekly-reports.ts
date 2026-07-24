import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendOperationalEmail } from '@/lib/server/email-provider';
import { persistNotifications } from '@/lib/server/notifications';
import {
  GENERAL_METRIC_LABELS,
  weeklyReportPdf,
  type WeeklyReportData,
} from '@/lib/weekly-report-format';
import {
  formatReportPeriod,
  scheduledWeeklyPeriod,
} from '@/lib/weekly-report-period';

type ReportRow = WeeklyReportData & {
  agency_id: string;
  status: string;
  generation_version: number;
  email_status: string;
  email_recipient: string | null;
  email_attempt_count: number;
  email_send_generation: number;
  email_lock_token: string | null;
};

type EmailSettingsRow = {
  documents_email: string;
  reports_email: string;
  reply_to_email: string;
  sender_name: string;
  provider_domain_status: string;
  mailbox_status: string;
  reports_verified_at: string | null;
};

function appBaseUrl(): string {
  const value = String(process.env.NEXT_PUBLIC_APP_URL || 'https://crm.kiraimobiliare.ro')
    .trim()
    .replace(/\/+$/, '');
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol)
      ? url.origin
      : 'https://crm.kiraimobiliare.ro';
  } catch {
    return 'https://crm.kiraimobiliare.ro';
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function notifyOwners(
  serviceAdmin: SupabaseClient,
  report: Pick<ReportRow, 'id' | 'agency_id'>,
  title: string,
  message: string,
  priority: 'high' | 'urgent' = 'high',
): Promise<void> {
  const { data: owners } = await serviceAdmin.from('profiles')
    .select('user_id')
    .eq('agency_id', report.agency_id)
    .eq('status', 'active')
    .in('role', ['owner', 'admin', 'manager']);
  await persistNotifications(serviceAdmin, (owners || []).map((owner) => ({
    agency_id: report.agency_id,
    user_id: owner.user_id,
    type: 'weekly_report_email',
    title,
    message,
    entity_type: 'weekly_report',
    entity_id: report.id,
    priority,
    action_url: `/reports/weekly/${report.id}`,
    dedup_key: `weekly-report:${report.id}:${title}`,
  })));
}

async function emailSettings(
  serviceAdmin: SupabaseClient,
  agencyId: string,
): Promise<EmailSettingsRow | null> {
  const { data, error } = await serviceAdmin.from('agency_email_settings')
    .select('documents_email,reports_email,reply_to_email,sender_name,provider_domain_status,mailbox_status,reports_verified_at')
    .eq('agency_id', agencyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as EmailSettingsRow | null;
}

function emailIsVerified(settings: EmailSettingsRow | null): settings is EmailSettingsRow {
  return Boolean(
    settings
    && settings.provider_domain_status === 'verified'
    && settings.mailbox_status === 'verified'
    && settings.reports_verified_at,
  );
}

export async function generateWeeklyReport(
  serviceAdmin: SupabaseClient,
  input: {
    agencyId: string;
    periodStart: string;
    periodEnd: string;
    requestedBy?: string | null;
    queueEmail?: boolean;
  },
): Promise<ReportRow> {
  const { data: reportId, error } = await serviceAdmin.rpc('crm_generate_weekly_report', {
    p_agency_id: input.agencyId,
    p_period_start: input.periodStart,
    p_period_end: input.periodEnd,
    p_requested_by: input.requestedBy || null,
  });
  if (error || typeof reportId !== 'string') {
    throw new Error(error?.message || 'Raportul nu a putut fi generat.');
  }
  const { data, error: loadError } = await serviceAdmin.from('weekly_reports')
    .select('*')
    .eq('id', reportId)
    .eq('agency_id', input.agencyId)
    .single();
  if (loadError || !data) throw new Error(loadError?.message || 'Raportul generat nu a fost găsit.');
  const report = data as ReportRow;
  if (input.queueEmail) await queueWeeklyReportEmail(serviceAdmin, report, false);
  return report;
}

export async function queueWeeklyReportEmail(
  serviceAdmin: SupabaseClient,
  report: ReportRow,
  manualResend: boolean,
): Promise<{ queued: boolean; reason?: string }> {
  const settings = await emailSettings(serviceAdmin, report.agency_id);
  if (!emailIsVerified(settings)) {
    const { error } = await serviceAdmin.from('weekly_reports').update({
      email_status: 'blocked_unverified',
      email_last_error: 'Adresa de rapoarte sau domeniul expeditor nu este verificat.',
      email_next_retry_at: null,
      email_lock_token: null,
      email_locked_at: null,
      updated_at: new Date().toISOString(),
    }).eq('id', report.id).eq('agency_id', report.agency_id);
    if (error) throw new Error(error.message);
    await notifyOwners(
      serviceAdmin,
      report,
      'Raport disponibil, e-mail neconfirmat',
      'Raportul a fost generat în CRM, dar trimiterea este blocată până la verificarea domeniului și a adresei de rapoarte.',
    );
    return { queued: false, reason: 'email_unverified' };
  }

  const patch: Record<string, unknown> = {
    email_status: 'queued',
    email_recipient: settings.reports_email,
    email_attempt_count: 0,
    email_next_retry_at: new Date().toISOString(),
    email_last_error: null,
    email_lock_token: null,
    email_locked_at: null,
    updated_at: new Date().toISOString(),
  };
  if (manualResend) {
    patch.email_send_generation = Number(report.email_send_generation || 1) + 1;
    patch.email_provider_message_id = null;
    patch.email_accepted_at = null;
  }
  const { error } = await serviceAdmin.from('weekly_reports').update(patch)
    .eq('id', report.id)
    .eq('agency_id', report.agency_id);
  if (error) throw new Error(error.message);
  return { queued: true };
}

function reportEmailContent(report: ReportRow): {
  subject: string;
  text: string;
  html: string;
} {
  const period = formatReportPeriod(report.period_start, report.period_end);
  const metrics = report.general_metrics || {};
  const problems = [
    Number(metrics.uncontacted || 0) > 0
      ? `${metrics.uncontacted} leaduri necontactate`
      : null,
    Number(metrics.demands_should_close || 0) > 0
      ? `${metrics.demands_should_close} cereri de verificat pentru închidere`
      : null,
    Number(metrics.storia_unmatched || 0) > 0
      ? `${metrics.storia_unmatched} mesaje Storia neasociate`
      : null,
    Number(metrics.active_properties_unassigned || 0) > 0
      ? `${metrics.active_properties_unassigned} proprietăți active fără agent`
      : null,
  ].filter(Boolean);
  const agentsWithUncontacted = report.agent_metrics
    .filter((agent) => Number(agent.assigned_leads || 0) > Number(agent.contacted_leads || 0))
    .map((agent) => String(agent.agent_name || 'Agent'));
  const agentsWithOldDemands = report.agent_metrics
    .filter((agent) => Number(agent.demands_over_20_days || 0) > 0)
    .map((agent) => String(agent.agent_name || 'Agent'));
  const reportUrl = `${appBaseUrl()}/reports/weekly/${report.id}`;
  const summary = Object.entries(GENERAL_METRIC_LABELS)
    .map(([code, label]) => `${label}: ${metrics[code] ?? 0}`)
    .join('\n');

  return {
    subject: `Raport săptămânal agenți Kira Imobiliare – ${period}`,
    text: [
      `Perioada: ${period}`,
      '',
      summary,
      '',
      `Abateri importante: ${problems.join(', ') || 'niciuna'}`,
      `Agenți cu cereri necontactate: ${agentsWithUncontacted.join(', ') || 'niciunul'}`,
      `Agenți cu cereri vechi: ${agentsWithOldDemands.join(', ') || 'niciunul'}`,
      '',
      `Raport complet: ${reportUrl}`,
    ].join('\n'),
    html: `
      <h1>Raport săptămânal Kira Imobiliare</h1>
      <p><strong>Perioada:</strong> ${escapeHtml(period)}</p>
      <h2>Rezumat</h2>
      <table cellpadding="6" cellspacing="0" border="1">
        ${Object.entries(GENERAL_METRIC_LABELS).map(([code, label]) =>
          `<tr><td>${escapeHtml(label)}</td><td><strong>${escapeHtml(metrics[code] ?? 0)}</strong></td></tr>`
        ).join('')}
      </table>
      <p><strong>Abateri importante:</strong> ${escapeHtml(problems.join(', ') || 'niciuna')}</p>
      <p><strong>Agenți cu cereri necontactate:</strong> ${escapeHtml(agentsWithUncontacted.join(', ') || 'niciunul')}</p>
      <p><strong>Agenți cu cereri vechi:</strong> ${escapeHtml(agentsWithOldDemands.join(', ') || 'niciunul')}</p>
      <p><a href="${escapeHtml(reportUrl)}">Deschide raportul complet în CRM</a></p>
    `.trim(),
  };
}

async function recordEmailAttempt(
  serviceAdmin: SupabaseClient,
  report: ReportRow,
  input: {
    idempotencyKey: string;
    recipient: string;
    subject: string;
    accepted: boolean;
    provider: string;
    messageId: string | null;
    errorCode: string | null;
    errorMessage: string | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const row = {
    agency_id: report.agency_id,
    message_type: 'weekly_report',
    recipient_email: input.recipient,
    subject: input.subject,
    provider: input.provider,
    provider_message_id: input.messageId,
    status: input.accepted ? 'accepted' : 'failed',
    attempt_number: report.email_attempt_count,
    idempotency_key: input.idempotencyKey,
    error_code: input.errorCode,
    error_message: input.errorMessage,
    accepted_at: input.accepted ? now : null,
    failed_at: input.accepted ? null : now,
    metadata: {
      weekly_report_id: report.id,
      generation_version: report.generation_version,
      send_generation: report.email_send_generation,
      last_attempt_number: report.email_attempt_count,
    },
  };
  const { data: existing } = await serviceAdmin.from('email_delivery_logs')
    .select('id')
    .eq('agency_id', report.agency_id)
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle();
  const operation = existing?.id
    ? serviceAdmin.from('email_delivery_logs').update(row).eq('id', existing.id)
    : serviceAdmin.from('email_delivery_logs').insert(row);
  const { error } = await operation;
  if (error) throw new Error(`Jurnalizarea e-mailului a eșuat: ${error.message}`);
}

async function processClaimedReport(
  serviceAdmin: SupabaseClient,
  report: ReportRow,
  lockToken: string,
): Promise<'accepted' | 'retrying' | 'failed' | 'blocked'> {
  const settings = await emailSettings(serviceAdmin, report.agency_id);
  if (!emailIsVerified(settings)) {
    await serviceAdmin.from('weekly_reports').update({
      email_status: 'blocked_unverified',
      email_last_error: 'Configurația de e-mail nu mai este verificată.',
      email_next_retry_at: null,
      email_lock_token: null,
      email_locked_at: null,
      updated_at: new Date().toISOString(),
    }).eq('id', report.id).eq('email_lock_token', lockToken);
    await notifyOwners(
      serviceAdmin,
      report,
      'Trimiterea raportului este blocată',
      'Verifică domeniul și adresa de rapoarte în Setări → E-mail.',
    );
    return 'blocked';
  }

  const content = reportEmailContent(report);
  const idempotencyKey = [
    'weekly-report',
    report.id,
    `v${report.generation_version}`,
    `send${report.email_send_generation}`,
  ].join(':');
  const result = await sendOperationalEmail({
    fromEmail: settings.documents_email,
    senderName: settings.sender_name,
    to: [settings.reports_email],
    replyTo: settings.reply_to_email,
    subject: content.subject,
    text: content.text,
    html: content.html,
    idempotencyKey,
    attachments: [{
      filename: `raport-saptamanal-${report.period_end.slice(0, 10)}.pdf`,
      contentBase64: weeklyReportPdf(report).toString('base64'),
      contentType: 'application/pdf',
    }],
  });

  await recordEmailAttempt(serviceAdmin, report, {
    idempotencyKey,
    recipient: settings.reports_email,
    subject: content.subject,
    accepted: result.accepted,
    provider: result.provider,
    messageId: result.messageId,
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
  });

  const now = new Date();
  if (result.accepted) {
    const { error } = await serviceAdmin.from('weekly_reports').update({
      email_status: 'accepted',
      email_recipient: settings.reports_email,
      email_provider_message_id: result.messageId,
      email_accepted_at: now.toISOString(),
      email_next_retry_at: null,
      email_last_error: null,
      email_lock_token: null,
      email_locked_at: null,
      updated_at: now.toISOString(),
    }).eq('id', report.id).eq('email_lock_token', lockToken);
    if (error) throw new Error(error.message);
    return 'accepted';
  }

  const exhausted = report.email_attempt_count >= 5;
  const delayMinutes = Math.min(360, 5 * (2 ** Math.max(0, report.email_attempt_count - 1)));
  const nextRetry = new Date(now.getTime() + delayMinutes * 60_000).toISOString();
  const { error } = await serviceAdmin.from('weekly_reports').update({
    email_status: exhausted ? 'failed' : 'retrying',
    email_recipient: settings.reports_email,
    email_next_retry_at: exhausted ? null : nextRetry,
    email_last_error: result.errorMessage || 'Furnizorul nu a acceptat mesajul.',
    email_lock_token: null,
    email_locked_at: null,
    updated_at: now.toISOString(),
  }).eq('id', report.id).eq('email_lock_token', lockToken);
  if (error) throw new Error(error.message);
  if (exhausted) {
    await notifyOwners(
      serviceAdmin,
      report,
      'Trimiterea raportului a eșuat',
      'Raportul rămâne în CRM. Cele 5 încercări automate au eșuat; verifică jurnalul e-mail.',
      'urgent',
    );
  }
  return exhausted ? 'failed' : 'retrying';
}

export async function processWeeklyReportEmails(
  serviceAdmin: SupabaseClient,
  limit = 10,
): Promise<Record<string, number>> {
  const lockToken = crypto.randomUUID();
  const { data, error } = await serviceAdmin.rpc('crm_claim_weekly_report_emails', {
    p_now: new Date().toISOString(),
    p_lock_token: lockToken,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  const summary = { claimed: 0, accepted: 0, retrying: 0, failed: 0, blocked: 0 };
  for (const row of (data || []) as ReportRow[]) {
    summary.claimed += 1;
    try {
      const status = await processClaimedReport(serviceAdmin, row, lockToken);
      summary[status] += 1;
    } catch (error) {
      summary.failed += 1;
      await serviceAdmin.from('weekly_reports').update({
        email_status: row.email_attempt_count >= 5 ? 'failed' : 'retrying',
        email_next_retry_at: row.email_attempt_count >= 5
          ? null
          : new Date(Date.now() + 15 * 60_000).toISOString(),
        email_last_error: error instanceof Error ? error.message.slice(0, 1000) : 'Eroare internă',
        email_lock_token: null,
        email_locked_at: null,
        updated_at: new Date().toISOString(),
      }).eq('id', row.id).eq('email_lock_token', lockToken);
    }
  }
  return summary;
}

export async function runWeeklyReportScheduler(
  serviceAdmin: SupabaseClient,
  now = new Date(),
): Promise<{
  agencies: number;
  generated: number;
  skipped: number;
  failed: number;
  emails: Record<string, number>;
}> {
  const { data: settingsRows, error } = await serviceAdmin
    .from('agency_weekly_report_settings')
    .select('agency_id,weekday,local_time,last_scheduled_period_end')
    .eq('enabled', true);
  if (error) throw new Error(error.message);
  const summary = {
    agencies: settingsRows?.length || 0,
    generated: 0,
    skipped: 0,
    failed: 0,
    emails: {},
  } as {
    agencies: number;
    generated: number;
    skipped: number;
    failed: number;
    emails: Record<string, number>;
  };
  for (const setting of settingsRows || []) {
    try {
      const period = scheduledWeeklyPeriod(
        now,
        Number(setting.weekday),
        String(setting.local_time || '18:00'),
      );
      if (!period.due || (
        setting.last_scheduled_period_end
        && new Date(setting.last_scheduled_period_end).getTime() >= new Date(period.end).getTime()
      )) {
        summary.skipped += 1;
        continue;
      }
      const previousPeriodEnd = setting.last_scheduled_period_end || null;
      const { data: claimed, error: claimError } = await serviceAdmin
        .from('agency_weekly_report_settings')
        .update({ last_scheduled_period_end: period.end, updated_at: now.toISOString() })
        .eq('agency_id', setting.agency_id)
        .or(`last_scheduled_period_end.is.null,last_scheduled_period_end.lt.${period.end}`)
        .select('agency_id');
      if (claimError) throw new Error(claimError.message);
      if (!claimed?.length) {
        summary.skipped += 1;
        continue;
      }
      try {
        await generateWeeklyReport(serviceAdmin, {
          agencyId: setting.agency_id,
          periodStart: period.start,
          periodEnd: period.end,
          requestedBy: null,
          queueEmail: true,
        });
      } catch (error) {
        await serviceAdmin.from('agency_weekly_report_settings')
          .update({
            last_scheduled_period_end: previousPeriodEnd,
            updated_at: now.toISOString(),
          })
          .eq('agency_id', setting.agency_id)
          .eq('last_scheduled_period_end', period.end);
        throw error;
      }
      summary.generated += 1;
    } catch {
      summary.failed += 1;
    }
  }
  summary.emails = await processWeeklyReportEmails(serviceAdmin, 10);
  return summary;
}
