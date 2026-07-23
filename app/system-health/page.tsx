'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from 'lucide-react';

import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { SystemHealthService, SystemHealthStatus } from '@/lib/system-health';

interface HealthResponse {
  generated_at: string;
  overall_status: SystemHealthStatus;
  summary: Record<SystemHealthStatus, number>;
  services: SystemHealthService[];
  recent_runs: Array<{
    id: string;
    service_code: string;
    operation: string;
    status: string;
    started_at: string;
    duration_ms: number | null;
    error_code: string | null;
  }>;
}

const statusView: Record<SystemHealthStatus, {
  label: string;
  className: string;
  icon: typeof CheckCircle2;
}> = {
  healthy: { label: 'Sănătos', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  degraded: { label: 'Necesită atenție', className: 'bg-amber-50 text-amber-700 border-amber-200', icon: AlertTriangle },
  failed: { label: 'Eșuat', className: 'bg-red-50 text-red-700 border-red-200', icon: XCircle },
  stalled: { label: 'Blocat', className: 'bg-red-50 text-red-700 border-red-200', icon: ShieldAlert },
  running: { label: 'În lucru', className: 'bg-blue-50 text-blue-700 border-blue-200', icon: Loader2 },
  never: { label: 'Fără execuții', className: 'bg-gray-50 text-gray-600 border-gray-200', icon: Clock3 },
};

const formatDate = (value: string | null) => value
  ? new Date(value).toLocaleString('ro-RO')
  : '—';

const formatDuration = (value: number | null) => {
  if (value == null) return '—';
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} sec`;
};

export default function SystemHealthPage() {
  const router = useRouter();
  const { user, role, loading } = useAuth();
  const [data, setData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sesiunea a expirat.');
      const response = await fetch('/api/system/health', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Starea sistemului nu a putut fi încărcată.');
      setData(result as HealthResponse);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Starea sistemului nu a putut fi încărcată.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!['owner', 'admin'].includes(role || '')) {
      router.replace('/dashboard');
      return;
    }
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [load, loading, role, router, user]);

  if (loading || !user || !['owner', 'admin'].includes(role || '')) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-emerald-700" /></div>;
  }

  const overall = data ? statusView[data.overall_status] : statusView.never;
  const OverallIcon = overall.icon;

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 pb-28 sm:p-6 md:pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="text-emerald-700" />
            <h1 className="text-2xl font-bold text-gray-900">Sănătatea sistemului</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Starea serviciilor agenției, joburi blocate, erori și ultimele execuții.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={refreshing}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50"
        >
          <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} />
          Actualizează
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className={`flex items-center justify-between rounded-2xl border p-4 ${overall.className}`}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide">Stare generală</p>
          <p className="mt-1 text-xl font-bold">{overall.label}</p>
          <p className="mt-1 text-xs opacity-80">
            Actualizat: {data ? formatDate(data.generated_at) : '—'}
          </p>
        </div>
        <OverallIcon size={34} className={data?.overall_status === 'running' ? 'animate-spin' : ''} />
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {(Object.keys(statusView) as SystemHealthStatus[]).map(status => (
            <div key={status} className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="text-xs text-gray-500">{statusView[status].label}</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{data.summary[status] || 0}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {(data?.services || []).map((service) => {
          const view = statusView[service.status];
          const Icon = view.icon;
          return (
            <article key={service.code} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold text-gray-900">{service.label}</h2>
                  <p className="mt-0.5 text-xs text-gray-400">{service.code}</p>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${view.className}`}>
                  <Icon size={14} className={service.status === 'running' ? 'animate-spin' : ''} />
                  {view.label}
                </span>
              </div>

              {service.last_error && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                  {service.last_error}
                  {service.last_error_code && <span className="ml-1 text-amber-600">({service.last_error_code})</span>}
                </div>
              )}

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                <div><dt className="text-gray-400">Ultimul succes</dt><dd className="mt-0.5 font-medium text-gray-700">{formatDate(service.last_success_at)}</dd></div>
                <div><dt className="text-gray-400">Ultima eroare</dt><dd className="mt-0.5 font-medium text-gray-700">{formatDate(service.last_error_at)}</dd></div>
                <div><dt className="text-gray-400">Durată</dt><dd className="mt-0.5 font-medium text-gray-700">{formatDuration(service.duration_ms)}</dd></div>
                <div><dt className="text-gray-400">Următoarea rulare</dt><dd className="mt-0.5 font-medium text-gray-700">{formatDate(service.next_run_at)}</dd></div>
                <div><dt className="text-gray-400">Reîncercări</dt><dd className="mt-0.5 font-medium text-gray-700">{service.retry_count}</dd></div>
                <div><dt className="text-gray-400">Ultimul start</dt><dd className="mt-0.5 font-medium text-gray-700">{formatDate(service.last_started_at)}</dd></div>
              </dl>

              {Object.keys(service.metrics).length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                  {Object.entries(service.metrics).slice(0, 8).map(([key, value]) => (
                    <span key={key} className="rounded-full bg-gray-50 px-2.5 py-1 text-[11px] text-gray-600">
                      {key.replaceAll('_', ' ')}: <b>{String(value ?? '—')}</b>
                    </span>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {data?.recent_runs?.length ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="font-bold text-gray-900">Execuții recente monitorizate</h2>
          <div className="mt-3 space-y-2">
            {data.recent_runs.slice(0, 12).map(run => (
              <div key={run.id} className="flex flex-col gap-1 rounded-lg bg-gray-50 p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="font-semibold text-gray-800">{run.service_code}</span>
                  <span className="text-gray-500"> · {run.operation}</span>
                </div>
                <div className="flex flex-wrap gap-3 text-gray-500">
                  <span>{run.status}</span>
                  <span>{formatDuration(run.duration_ms)}</span>
                  <span>{formatDate(run.started_at)}</span>
                  {run.error_code && <span className="text-red-600">{run.error_code}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
