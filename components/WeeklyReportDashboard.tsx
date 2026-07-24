'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  Download,
  ExternalLink,
  FileBarChart2,
  Loader2,
  MailWarning,
  RefreshCw,
  Send,
  Settings2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  AGENT_METRIC_LABELS,
  GENERAL_METRIC_LABELS,
} from '@/lib/weekly-report-format';
import { formatReportPeriod } from '@/lib/weekly-report-period';

type Report = {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  generation_version: number;
  general_metrics: Record<string, number>;
  agent_metrics: Array<Record<string, string | number>>;
  metric_definitions?: Record<string, string>;
  generated_at: string | null;
  email_status: string;
  email_recipient: string | null;
  email_attempt_count: number;
  email_accepted_at: string | null;
  email_last_error: string | null;
};

type Settings = {
  enabled: boolean;
  weekday: number;
  local_time: string;
  timezone: string;
  include_pdf: boolean;
  last_scheduled_period_end: string | null;
};

type DrillRecord = {
  id: number;
  entity_type: string;
  entity_id: string;
  occurred_at: string | null;
  label: string | null;
  details: Record<string, unknown>;
};

const AGENT_DRILLDOWN: Record<string, string> = {
  assigned_leads: 'assigned_leads',
  contacted_leads: 'contacted_leads',
  sla_percent: 'assigned_leads',
  average_response_minutes: 'average_response_samples',
  active_demands: 'active_demands',
  demands_over_20_days: 'demands_over_20_days',
  demands_closed: 'demands_closed',
  demands_not_closed: 'demands_should_close',
  activities_missing_description: 'activities_missing_description',
  viewings: 'viewings_scheduled',
  offers: 'offers',
  transactions: 'transactions',
  overdue_tasks: 'overdue_tasks',
};

const GENERAL_DRILLDOWN: Record<string, string> = {
  average_first_contact_minutes: 'average_response_samples',
};

const EMAIL_LABELS: Record<string, string> = {
  not_requested: 'Netrimis',
  blocked_unverified: 'Blocat: e-mail neconfirmat',
  queued: 'În așteptare',
  retrying: 'Se reîncearcă',
  sending: 'Se trimite',
  accepted: 'Acceptat de furnizor',
  failed: 'Eșuat',
};

function dateTime(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ro-RO', {
    timeZone: 'Europe/Bucharest',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function recordHref(record: DrillRecord): string | null {
  if (record.entity_type === 'property') return `/properties/${record.entity_id}`;
  if (record.entity_type === 'demand') return `/matches?demand_id=${record.entity_id}`;
  if (record.entity_type === 'viewing') return `/viewings?viewing_id=${record.entity_id}`;
  if (record.entity_type === 'task') return `/tasks?task_id=${record.entity_id}`;
  if (record.entity_type === 'transaction') return `/transactions?transaction_id=${record.entity_id}`;
  if (record.entity_type === 'lead') return `/clients?lead_id=${record.entity_id}`;
  if (record.entity_type === 'portal_unmatched_message') return '/portals?tab=unmatched';
  return null;
}

export function WeeklyReportDashboard({
  reportId,
  canCreate,
  canExport,
  canEditSettings,
}: {
  reportId?: string;
  canCreate: boolean;
  canExport: boolean;
  canEditSettings: boolean;
}) {
  const [reports, setReports] = useState<Report[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [drilldown, setDrilldown] = useState<{
    title: string;
    records: DrillRecord[];
    total: number;
    page: number;
    totalPages: number;
    metric: string;
    agentId?: string;
  } | null>(null);

  const authFetch = useCallback(async (url: string, init: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error('Sesiunea a expirat.');
    return fetch(url, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
        Authorization: `Bearer ${data.session.access_token}`,
      },
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (reportId) {
        const response = await authFetch(`/api/reports/weekly/${reportId}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Raportul nu a putut fi încărcat.');
        setReport(payload.report);
      } else {
        const response = await authFetch('/api/reports/weekly');
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Arhiva nu a putut fi încărcată.');
        setReports(payload.reports || []);
        setSettings(payload.settings);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Datele nu au putut fi încărcate.');
    } finally {
      setLoading(false);
    }
  }, [authFetch, reportId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const run = async (key: string, action: () => Promise<string>) => {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      setNotice(await action());
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Operațiunea a eșuat.');
    } finally {
      setBusy('');
    }
  };

  const post = (action: string, id?: string) => run(action, async () => {
    const response = await authFetch('/api/reports/weekly', {
      method: 'POST',
      body: JSON.stringify({ action, report_id: id }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Raportul nu a putut fi procesat.');
    if (action === 'resend' && payload.queued?.reason === 'email_unverified') {
      return 'Raportul rămâne în CRM. Trimiterea este blocată până la verificarea e-mailului.';
    }
    return action === 'resend'
      ? 'Retrimiterea a fost procesată și este vizibilă în jurnal.'
      : action === 'regenerate'
        ? 'Raportul a fost regenerat din toate înregistrările.'
        : 'Raportul a fost generat.';
  });

  const saveSettings = () => run('settings', async () => {
    const response = await authFetch('/api/reports/weekly/settings', {
      method: 'PATCH',
      body: JSON.stringify({
        ...settings,
        local_time: String(settings?.local_time || '18:00').slice(0, 5),
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Programarea nu a putut fi salvată.');
    return 'Programarea raportului a fost salvată.';
  });

  const openDrilldown = async (
    currentReport: Report,
    metric: string,
    title: string,
    agentId?: string,
    page = 1,
  ) => {
    setBusy(`drill:${metric}:${agentId || ''}`);
    setError('');
    try {
      const params = new URLSearchParams({ metric, page: String(page) });
      if (agentId) params.set('agent_id', agentId);
      const response = await authFetch(
        `/api/reports/weekly/${currentReport.id}/records?${params}`,
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Lista exactă nu a putut fi încărcată.');
      setDrilldown({
        title,
        records: payload.records || [],
        total: payload.pagination?.total || 0,
        page: payload.pagination?.page || page,
        totalPages: payload.pagination?.total_pages || 0,
        metric,
        agentId,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Lista exactă nu a putut fi încărcată.');
    } finally {
      setBusy('');
    }
  };

  const download = async (currentReport: Report, format: 'pdf' | 'csv') => {
    setBusy(`export:${format}`);
    setError('');
    try {
      const response = await authFetch(
        `/api/reports/weekly/${currentReport.id}/export?format=${format}`,
      );
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || 'Exportul a eșuat.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `raport-saptamanal-${currentReport.period_end.slice(0, 10)}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Exportul a eșuat.');
    } finally {
      setBusy('');
    }
  };

  const displayReport = reportId ? report : null;
  const weekdays = useMemo(() => [
    'Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă',
  ], []);

  if (loading) {
    return <div className="flex min-h-64 items-center justify-center"><Loader2 className="animate-spin text-emerald-700" /></div>;
  }

  if (displayReport) {
    return (
      <div className="space-y-5">
        <Link href="/reports/weekly" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
          <ChevronLeft size={16} /> Arhiva rapoartelor
        </Link>
        {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Raport săptămânal agenți</h1>
              <p className="mt-1 text-sm text-gray-500">{formatReportPeriod(displayReport.period_start, displayReport.period_end)}</p>
              <p className="mt-2 text-xs text-gray-500">
                Generat: {dateTime(displayReport.generated_at)} · versiunea {displayReport.generation_version}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canExport && (
                <>
                  <button onClick={() => void download(displayReport, 'pdf')} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm"><Download size={15} /> PDF</button>
                  <button onClick={() => void download(displayReport, 'csv')} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm"><Download size={15} /> CSV</button>
                </>
              )}
              {canCreate && (
                <>
                  <button onClick={() => void post('regenerate', displayReport.id)} disabled={Boolean(busy)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm disabled:opacity-50"><RefreshCw size={15} /> Regenerează</button>
                  <button onClick={() => void post('resend', displayReport.id)} disabled={Boolean(busy)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-50"><Send size={15} /> Retrimite</button>
                </>
              )}
            </div>
          </div>
          <div className={`mt-4 rounded-lg p-3 text-sm ${
            displayReport.email_status === 'accepted'
              ? 'bg-emerald-50 text-emerald-800'
              : displayReport.email_status === 'failed'
                ? 'bg-red-50 text-red-700'
                : 'bg-amber-50 text-amber-800'
          }`}>
            E-mail: {EMAIL_LABELS[displayReport.email_status] || displayReport.email_status}
            {displayReport.email_recipient ? ` · ${displayReport.email_recipient}` : ''}
            {displayReport.email_accepted_at ? ` · ${dateTime(displayReport.email_accepted_at)}` : ''}
            {displayReport.email_last_error ? ` · ${displayReport.email_last_error}` : ''}
          </div>
        </div>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Raport general</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(GENERAL_METRIC_LABELS).map(([code, label]) => (
              <button
                key={code}
                type="button"
                onClick={() => void openDrilldown(
                  displayReport,
                  GENERAL_DRILLDOWN[code] || code,
                  label,
                )}
                className="rounded-xl border border-gray-200 bg-white p-4 text-left transition hover:border-emerald-300 hover:shadow-sm"
              >
                <span className="text-xs text-gray-500">{label}</span>
                <strong className="mt-2 block text-2xl text-gray-900">{displayReport.general_metrics?.[code] ?? 0}</strong>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700">Vezi lista exactă <ExternalLink size={12} /></span>
              </button>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b p-4"><h2 className="font-semibold text-gray-900">Raport per agent</h2></div>
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="p-3">Agent</th>
                  {Object.values(AGENT_METRIC_LABELS).map((label) => <th className="p-3" key={label}>{label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayReport.agent_metrics.map((agent) => (
                  <tr key={String(agent.agent_id)}>
                    <td className="p-3 font-medium text-gray-900">{agent.agent_name}</td>
                    {Object.entries(AGENT_METRIC_LABELS).map(([code]) => (
                      <td className="p-3" key={code}>
                        <button
                          type="button"
                          className="font-semibold text-emerald-700 underline decoration-emerald-200 underline-offset-2"
                          onClick={() => void openDrilldown(
                            displayReport,
                            AGENT_DRILLDOWN[code] || code,
                            `${AGENT_METRIC_LABELS[code]} · ${agent.agent_name}`,
                            String(agent.agent_id),
                          )}
                        >
                          {agent[code] ?? 0}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {drilldown && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => setDrilldown(null)}>
            <div className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between border-b p-4">
                <div><h3 className="font-semibold text-gray-900">{drilldown.title}</h3><p className="text-xs text-gray-500">{drilldown.total} înregistrări exacte</p></div>
                <button onClick={() => setDrilldown(null)} className="rounded-lg border px-3 py-1.5 text-sm">Închide</button>
              </div>
              <div className="max-h-[70vh] divide-y overflow-y-auto">
                {drilldown.records.length === 0 ? (
                  <p className="p-5 text-sm text-gray-500">Nicio înregistrare a contribuit la acest indicator.</p>
                ) : drilldown.records.map((record) => {
                  const href = recordHref(record);
                  const content = (
                    <div className="p-4">
                      <div className="flex justify-between gap-3">
                        <p className="font-medium text-gray-900">{record.label || record.entity_type}</p>
                        <span className="text-xs text-gray-500">{dateTime(record.occurred_at)}</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">{record.entity_type} · {record.entity_id}</p>
                    </div>
                  );
                  return href ? <Link key={record.id} href={href} className="block hover:bg-gray-50">{content}</Link> : <div key={record.id}>{content}</div>;
                })}
              </div>
              {drilldown.totalPages > 1 && (
                <div className="flex items-center justify-between border-t bg-gray-50 p-3 text-sm">
                  <button
                    type="button"
                    disabled={drilldown.page <= 1 || Boolean(busy)}
                    onClick={() => void openDrilldown(
                      displayReport,
                      drilldown.metric,
                      drilldown.title,
                      drilldown.agentId,
                      drilldown.page - 1,
                    )}
                    className="rounded-lg border bg-white px-3 py-1.5 disabled:opacity-40"
                  >
                    Înapoi
                  </button>
                  <span>Pagina {drilldown.page} din {drilldown.totalPages}</span>
                  <button
                    type="button"
                    disabled={drilldown.page >= drilldown.totalPages || Boolean(busy)}
                    onClick={() => void openDrilldown(
                      displayReport,
                      drilldown.metric,
                      drilldown.title,
                      drilldown.agentId,
                      drilldown.page + 1,
                    )}
                    className="rounded-lg border bg-white px-3 py-1.5 disabled:opacity-40"
                  >
                    Înainte
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900"><FileBarChart2 className="text-emerald-700" /> Rapoarte săptămânale</h1>
          <p className="mt-1 text-sm text-gray-500">Calcule exacte în baza de date, arhivă și dovada trimiterii.</p>
        </div>
        {canCreate && (
          <button onClick={() => void post('generate')} disabled={Boolean(busy)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy === 'generate' ? <Loader2 size={16} className="animate-spin" /> : <FileBarChart2 size={16} />}
            Generează acum
          </button>
        )}
      </div>
      {notice && <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 size={17} /> {notice}</div>}
      {error && <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle size={17} /> {error}</div>}

      {settings && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2"><Settings2 size={18} className="text-emerald-700" /><h2 className="font-semibold text-gray-900">Programare automată</h2></div>
          <p className="mt-1 text-sm text-gray-500">Fus orar fix: Europe/Bucharest. Implicit: vineri, 18:00.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <label className="text-sm text-gray-700">Activ
              <select disabled={!canEditSettings} value={settings.enabled ? 'yes' : 'no'} onChange={(event) => setSettings({ ...settings, enabled: event.target.value === 'yes' })} className="mt-1 w-full rounded-lg border px-3 py-2">
                <option value="yes">Da</option><option value="no">Nu</option>
              </select>
            </label>
            <label className="text-sm text-gray-700">Zi
              <select disabled={!canEditSettings} value={settings.weekday} onChange={(event) => setSettings({ ...settings, weekday: Number(event.target.value) })} className="mt-1 w-full rounded-lg border px-3 py-2">
                {weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}
              </select>
            </label>
            <label className="text-sm text-gray-700">Ora
              <input disabled={!canEditSettings} type="time" value={String(settings.local_time).slice(0, 5)} onChange={(event) => setSettings({ ...settings, local_time: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
            </label>
            <div className="flex items-end">
              {canEditSettings && <button onClick={() => void saveSettings()} disabled={Boolean(busy)} className="w-full rounded-lg border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-800 disabled:opacity-50">Salvează programarea</button>}
            </div>
          </div>
          <p className="mt-3 flex items-center gap-1 text-xs text-gray-500"><CalendarClock size={13} /> Ultima perioadă programată: {dateTime(settings.last_scheduled_period_end)}</p>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b p-4"><h2 className="font-semibold text-gray-900">Arhivă</h2></div>
        {reports.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">Nu există încă rapoarte generate.</p>
        ) : (
          <div className="divide-y">
            {reports.map((item) => (
              <Link key={item.id} href={`/reports/weekly/${item.id}`} className="flex flex-col justify-between gap-3 p-4 hover:bg-gray-50 sm:flex-row sm:items-center">
                <div>
                  <p className="font-medium text-gray-900">{formatReportPeriod(item.period_start, item.period_end)}</p>
                  <p className="mt-1 text-xs text-gray-500">Generat {dateTime(item.generated_at)} · versiunea {item.generation_version}</p>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {item.email_status === 'accepted' ? <CheckCircle2 size={16} className="text-emerald-600" /> : <MailWarning size={16} className="text-amber-600" />}
                  {EMAIL_LABELS[item.email_status] || item.email_status}
                  <ExternalLink size={14} className="text-gray-400" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
