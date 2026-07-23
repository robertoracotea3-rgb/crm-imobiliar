'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, Banknote, Bell, Building2, CalendarDays, CheckCircle2,
  CircleDollarSign, Clock3, FileWarning, Info, ListTodo, Loader2,
  MessageSquareText, Percent, RefreshCw, Send, Target, UserRoundCheck, Users,
} from 'lucide-react';

import { ProtectedLayout } from '@/components/ProtectedLayout';
import { supabase } from '@/lib/supabase';

type Period = '7d' | '30d' | '90d' | 'month' | 'year';

interface MoneyValue { currency: string; amount: number }
interface SourceValue { source: string; count: number }
interface PortalValue {
  portal: string; total: number; active: number; errors: number;
  pending: number; removed: number; success_rate: number;
}
interface AgentValue {
  user_id: string; name: string; role: string; leads: number; viewings: number;
  transactions: number; average_response_minutes: number; conversion_rate: number;
}
interface NotificationValue {
  id: string; title: string; message: string; priority: string;
  action_url: string | null; read_at: string | null; created_at: string;
}
interface DashboardData {
  user: { name: string; role: string };
  scope: 'agency' | 'mine';
  period: Period;
  generated_at: string;
  kpis: {
    new_leads: number;
    uncontacted_leads: number;
    average_response_minutes: number;
    viewings: number;
    offers: number;
    reservations: number;
    transactions: number;
    active_properties: number;
    expired_properties: number;
    listing_errors: number;
    open_tasks: number;
    overdue_tasks: number;
    followups: number;
    leads_without_next_action: number;
    conversion_rate: number;
  };
  revenue_by_currency: MoneyValue[];
  estimated_commission_by_currency: MoneyValue[];
  lead_sources: SourceValue[];
  portal_performance: PortalValue[];
  agent_performance: AgentValue[];
  definitions: Record<string, string>;
  notifications: NotificationValue[];
}

const PERIOD_LABELS: Record<Period, string> = {
  '7d': 'Ultimele 7 zile',
  '30d': 'Ultimele 30 zile',
  '90d': 'Ultimele 90 zile',
  month: 'Luna curentă',
  year: 'Anul curent',
};

const SOURCE_LABELS: Record<string, string> = {
  storia: 'Storia', olx: 'OLX', site: 'Site propriu', whatsapp: 'WhatsApp',
  recomandare: 'Recomandare', manual: 'Manual', necunoscuta: 'Necunoscută',
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 1 }).format(Number(value || 0));
}

function formatMoney(values: MoneyValue[]) {
  if (!values?.length) return '0';
  return values.map(({ amount, currency }) =>
    `${new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(Number(amount || 0))} ${currency}`,
  ).join(' · ');
}

function formatMinutes(value: number) {
  const minutes = Math.max(0, Number(value || 0));
  if (!minutes) return '0 min';
  if (minutes < 60) return `${formatNumber(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ore`;
  return `${Math.floor(hours / 24)} zile`;
}

function KpiCard({
  label, value, icon, definition, href, danger = false,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  definition: string;
  href?: string;
  danger?: boolean;
}) {
  const body = (
    <div className={`h-full rounded-2xl border bg-white p-4 shadow-sm transition sm:p-5 ${
      danger ? 'border-red-200' : 'border-gray-100'
    } ${href ? 'hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
          danger ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'
        }`}>{icon}</div>
        <span title={definition} aria-label={`Definiție: ${definition}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-300 hover:bg-gray-50 hover:text-gray-500">
          <Info size={15} />
        </span>
      </div>
      <p className={`mt-4 break-words text-2xl font-black sm:text-3xl ${danger ? 'text-red-700' : 'text-gray-950'}`}>{value}</p>
      <p className="mt-1 text-sm font-medium text-gray-500">{label}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>('30d');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sesiunea a expirat.');
      const response = await fetch(`/api/dashboard/overview?period=${period}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Dashboardul nu a putut fi încărcat.');
      setData(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Dashboardul nu a putut fi încărcat.');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const maxSource = useMemo(
    () => Math.max(1, ...(data?.lead_sources || []).map((source) => Number(source.count))),
    [data?.lead_sources],
  );

  return (
    <ProtectedLayout module="dashboard">
      <main className="mx-auto max-w-[1500px] space-y-5 p-4 pb-24 sm:p-6 lg:p-8">
        <header className="flex flex-col gap-4 rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-950 to-emerald-700 p-5 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div>
            <p className="text-sm text-emerald-100">Bun venit, {data?.user.name || '...'}</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">
              {data?.scope === 'mine' ? 'Activitatea mea' : 'Performanța agenției'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-emerald-100">
              Cifre agregate direct din baza de date, fără limite de 200/500 de rezultate.
            </p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <select value={period} onChange={(event) => setPeriod(event.target.value as Period)}
              className="mobile-touch-target min-w-0 flex-1 rounded-xl border border-white/20 bg-white px-3 py-2.5 text-sm font-semibold text-emerald-950 sm:w-48">
              {(Object.keys(PERIOD_LABELS) as Period[]).map((key) => (
                <option key={key} value={key}>{PERIOD_LABELS[key]}</option>
              ))}
            </select>
            <button onClick={() => void load()} disabled={loading}
              className="mobile-touch-target inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-3 text-white hover:bg-white/20 disabled:opacity-50"
              aria-label="Reîmprospătează dashboardul">
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </header>

        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertTriangle size={18} />{error}
          </div>
        )}

        {loading && !data ? (
          <div className="flex min-h-80 items-center justify-center rounded-2xl border border-gray-100 bg-white">
            <Loader2 className="animate-spin text-emerald-700" size={28} />
          </div>
        ) : data ? (
          <>
            <section>
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-950">Indicatori operaționali</h2>
                  <p className="text-sm text-gray-500">{PERIOD_LABELS[period]} · stocurile curente sunt marcate în definiție</p>
                </div>
                <span className="hidden text-xs text-gray-400 sm:block">
                  Calculat la {new Date(data.generated_at).toLocaleString('ro-RO')}
                </span>
              </div>

              {data.scope === 'agency' ? (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">
                  <KpiCard label="Leaduri noi" value={data.kpis.new_leads} icon={<Users size={20} />}
                    definition={data.definitions.new_leads} href="/clients" />
                  <KpiCard label="Leaduri necontactate" value={data.kpis.uncontacted_leads} icon={<MessageSquareText size={20} />}
                    definition={data.definitions.uncontacted_leads} href="/clients" danger={data.kpis.uncontacted_leads > 0} />
                  <KpiCard label="Timp mediu de răspuns" value={formatMinutes(data.kpis.average_response_minutes)} icon={<Clock3 size={20} />}
                    definition={data.definitions.average_response_minutes} />
                  <KpiCard label="Vizionări" value={data.kpis.viewings} icon={<CalendarDays size={20} />}
                    definition={data.definitions.viewings} href="/viewings" />
                  <KpiCard label="Oferte" value={data.kpis.offers} icon={<Send size={20} />}
                    definition={data.definitions.offers} href="/pipeline" />
                  <KpiCard label="Rezervări" value={data.kpis.reservations} icon={<UserRoundCheck size={20} />}
                    definition={data.definitions.reservations} href="/pipeline" />
                  <KpiCard label="Tranzacții" value={data.kpis.transactions} icon={<CheckCircle2 size={20} />}
                    definition={data.definitions.transactions} href="/finance" />
                  <KpiCard label="Venit înregistrat" value={formatMoney(data.revenue_by_currency)} icon={<Banknote size={20} />}
                    definition={data.definitions.revenue} href="/finance" />
                  <KpiCard label="Comisioane estimate" value={formatMoney(data.estimated_commission_by_currency)} icon={<CircleDollarSign size={20} />}
                    definition={data.definitions.estimated_commission} href="/finance" />
                  <KpiCard label="Rată de conversie" value={`${formatNumber(data.kpis.conversion_rate)}%`} icon={<Percent size={20} />}
                    definition={data.definitions.conversion_rate} />
                  <KpiCard label="Proprietăți active" value={data.kpis.active_properties} icon={<Building2 size={20} />}
                    definition={data.definitions.active_properties} href="/properties" />
                  <KpiCard label="Proprietăți expirate" value={data.kpis.expired_properties} icon={<AlertTriangle size={20} />}
                    definition={data.definitions.expired_properties} href="/properties" danger={data.kpis.expired_properties > 0} />
                  <KpiCard label="Listări cu erori" value={data.kpis.listing_errors} icon={<FileWarning size={20} />}
                    definition={data.definitions.listing_errors} href="/portals" danger={data.kpis.listing_errors > 0} />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <KpiCard label="Leadurile mele" value={data.kpis.new_leads} icon={<Users size={20} />}
                    definition={data.definitions.new_leads} href="/clients" />
                  <KpiCard label="Taskurile mele" value={data.kpis.open_tasks} icon={<ListTodo size={20} />}
                    definition={data.definitions.open_tasks} href="/tasks" danger={data.kpis.overdue_tasks > 0} />
                  <KpiCard label="Vizionările mele" value={data.kpis.viewings} icon={<CalendarDays size={20} />}
                    definition={data.definitions.viewings} href="/viewings" />
                  <KpiCard label="Follow-up-uri" value={data.kpis.followups} icon={<MessageSquareText size={20} />}
                    definition={data.definitions.followups} href="/tasks" />
                  <KpiCard label="Proprietățile mele" value={data.kpis.active_properties} icon={<Building2 size={20} />}
                    definition={data.definitions.active_properties} href="/properties" />
                  <KpiCard label="Tranzacțiile mele" value={data.kpis.transactions} icon={<CheckCircle2 size={20} />}
                    definition={data.definitions.transactions} href="/finance" />
                  <KpiCard label="Comision estimat" value={formatMoney(data.estimated_commission_by_currency)} icon={<CircleDollarSign size={20} />}
                    definition={data.definitions.estimated_commission} href="/finance" />
                  <KpiCard label="Fără următoarea acțiune" value={data.kpis.leads_without_next_action} icon={<Target size={20} />}
                    definition={data.definitions.leads_without_next_action} href="/clients" danger={data.kpis.leads_without_next_action > 0} />
                </div>
              )}
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <h2 className="font-bold text-gray-950">Sursa leadurilor</h2>
                <p className="mt-1 text-sm text-gray-500">Leaduri primite în perioada selectată</p>
                <div className="mt-5 space-y-4">
                  {data.lead_sources.length ? data.lead_sources.map((source) => (
                    <div key={source.source}>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span className="font-medium text-gray-700">{SOURCE_LABELS[source.source] || source.source}</span>
                        <span className="font-bold text-gray-950">{source.count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full bg-emerald-600"
                          style={{ width: `${Math.max(3, (source.count / maxSource) * 100)}%` }} />
                      </div>
                    </div>
                  )) : <p className="py-8 text-center text-sm text-gray-400">Nu există leaduri în perioadă.</p>}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-bold text-gray-950">Notificări operaționale</h2>
                    <p className="mt-1 text-sm text-gray-500">Aceeași sursă persistentă ca inboxul CRM</p>
                  </div>
                  <Link href="/notifications" className="text-sm font-semibold text-emerald-700 hover:underline">Vezi toate</Link>
                </div>
                <div className="mt-4 space-y-2">
                  {data.notifications.length ? data.notifications.map((notification) => (
                    <Link key={notification.id} href={notification.action_url || '/notifications'}
                      className={`flex items-start gap-3 rounded-xl border p-3 transition hover:bg-gray-50 ${
                        notification.priority === 'urgent' ? 'border-red-200 bg-red-50/50' : 'border-gray-100'
                      } ${notification.read_at ? 'opacity-65' : ''}`}>
                      <Bell size={16} className="mt-0.5 shrink-0 text-emerald-700" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900">{notification.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{notification.message}</p>
                      </div>
                      <span className="shrink-0 text-[11px] text-gray-400">{relativeTime(notification.created_at)}</span>
                    </Link>
                  )) : <p className="py-8 text-center text-sm text-gray-400">Nu există notificări.</p>}
                </div>
              </div>
            </section>

            {data.scope === 'agency' && (
              <>
                <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-bold text-gray-950">Performanță portaluri</h2>
                      <p className="mt-1 text-sm text-gray-500">Starea curentă a tuturor listărilor din portofoliu</p>
                    </div>
                    <Link href="/portals" className="text-sm font-semibold text-emerald-700 hover:underline">Portaluri</Link>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {data.portal_performance.length ? data.portal_performance.map((portal) => (
                      <article key={portal.portal} className="rounded-xl border border-gray-100 p-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-bold capitalize text-gray-950">{portal.portal}</h3>
                          <span className={`rounded-full px-2 py-1 text-xs font-bold ${
                            portal.errors ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
                          }`}>{formatNumber(portal.success_rate)}% active</span>
                        </div>
                        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                          {[['Total', portal.total], ['Active', portal.active], ['Erori', portal.errors], ['În lucru', portal.pending]].map(([label, value]) => (
                            <div key={String(label)} className="rounded-lg bg-gray-50 p-2">
                              <p className="font-black text-gray-900">{value}</p>
                              <p className="text-[10px] text-gray-500">{label}</p>
                            </div>
                          ))}
                        </div>
                      </article>
                    )) : <p className="py-8 text-sm text-gray-400">Nu există listări pe portaluri.</p>}
                  </div>
                </section>

                <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-bold text-gray-950">Performanță agenți</h2>
                      <p className="mt-1 text-sm text-gray-500">Aceeași perioadă și aceleași definiții pentru fiecare agent</p>
                    </div>
                    <Link href="/team" className="text-sm font-semibold text-emerald-700 hover:underline">Echipă</Link>
                  </div>
                  <div className="mt-4 overflow-x-auto rounded-xl border border-gray-100">
                    <table className="min-w-[760px] w-full text-sm">
                      <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                          <th className="px-4 py-3">Agent</th><th className="px-4 py-3 text-right">Leaduri</th>
                          <th className="px-4 py-3 text-right">Răspuns mediu</th><th className="px-4 py-3 text-right">Vizionări</th>
                          <th className="px-4 py-3 text-right">Tranzacții</th><th className="px-4 py-3 text-right">Conversie</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.agent_performance.map((agent) => (
                          <tr key={agent.user_id} className="border-t border-gray-100">
                            <td className="px-4 py-3"><p className="font-semibold text-gray-900">{agent.name}</p><p className="text-xs text-gray-400">{agent.role}</p></td>
                            <td className="px-4 py-3 text-right font-semibold">{agent.leads}</td>
                            <td className="px-4 py-3 text-right">{formatMinutes(agent.average_response_minutes)}</td>
                            <td className="px-4 py-3 text-right">{agent.viewings}</td>
                            <td className="px-4 py-3 text-right">{agent.transactions}</td>
                            <td className="px-4 py-3 text-right font-bold text-emerald-700">{formatNumber(agent.conversion_rate)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}

            <details className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <summary className="cursor-pointer font-bold text-gray-950">Cum sunt calculați indicatorii</summary>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {Object.entries(data.definitions).map(([key, definition]) => (
                  <div key={key} className="rounded-xl bg-gray-50 p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">{key.replaceAll('_', ' ')}</p>
                    <p className="mt-1 text-sm text-gray-600">{definition}</p>
                  </div>
                ))}
              </div>
            </details>
          </>
        ) : null}
      </main>
    </ProtectedLayout>
  );
}
