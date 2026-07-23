'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Loader2, Play, RefreshCw } from 'lucide-react';

import { supabase } from '@/lib/supabase';

interface Rule {
  id: string;
  rule_key: string;
  name: string;
  description: string;
  trigger_key: string;
  config: Record<string, number>;
  is_enabled: boolean;
  max_attempts: number;
  retry_delay_minutes: number;
  last_run_at: string | null;
}

interface Job {
  id: string;
  rule_id: string;
  status: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  created_at: string;
}

const intervalRules: Record<string, { field: string; label: string }> = {
  lead_unanswered: { field: 'delay_minutes', label: 'Așteaptă înainte de reminder' },
  viewing_reminder: { field: 'advance_minutes', label: 'Trimite înainte de vizionare' },
  task_overdue: { field: 'grace_minutes', label: 'Perioadă de grație' },
  lead_missing_next_action: { field: 'grace_minutes', label: 'Așteaptă înainte de alertă' },
};

function humanInterval(minutes: number) {
  if (minutes === 0) return 'Imediat';
  if (minutes % 1440 === 0) return `${minutes / 1440} ${minutes === 1440 ? 'zi' : 'zile'}`;
  if (minutes % 60 === 0) return `${minutes / 60} ${minutes === 60 ? 'oră' : 'ore'}`;
  return `${minutes} minute`;
}

async function accessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sesiunea a expirat.');
  return session.access_token;
}

export function AutomationSettings({ canEdit }: { canEdit: boolean }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const token = await accessToken();
      const response = await fetch('/api/automations', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Automatizările nu au putut fi încărcate.');
      setRules(data.rules || []);
      setJobs(data.jobs || []);
      setCounts(data.counts || {});
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Automatizările nu au putut fi încărcate.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const failedJobs = useMemo(() => jobs.filter((job) => job.status === 'failed'), [jobs]);

  const patchRule = async (rule: Rule, patch: Record<string, unknown>) => {
    setBusy(rule.id); setError(''); setNotice('');
    try {
      const token = await accessToken();
      const response = await fetch('/api/automations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rule_key: rule.rule_key, ...patch }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Regula nu a putut fi salvată.');
      setRules((current) => current.map((item) => item.id === rule.id ? data.rule : item));
      setNotice('Regula a fost salvată.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Regula nu a putut fi salvată.');
    } finally {
      setBusy('');
    }
  };

  const run = async (jobId?: string) => {
    setBusy(jobId || 'run'); setError(''); setNotice('');
    try {
      const token = await accessToken();
      const response = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(jobId ? { action: 'retry', job_id: jobId } : { action: 'run' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Execuția nu a putut porni.');
      setNotice(`Verificare terminată: ${data.summary?.completed || 0} acțiuni finalizate.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Execuția nu a putut porni.');
    } finally {
      setBusy('');
    }
  };

  if (loading) {
    return <div className="flex min-h-40 items-center justify-center rounded-xl border bg-white"><Loader2 className="animate-spin text-emerald-700" /></div>;
  }
  if (error && rules.length === 0) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertTriangle className="mr-2 inline" size={17} />{error}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Motor de automatizări</h2>
            <p className="mt-1 text-sm text-gray-500">Regulile sunt executate o singură dată, cu reîncercări și istoric verificabil.</p>
          </div>
          {canEdit && (
            <button onClick={() => void run()} disabled={!!busy}
              className="mobile-touch-target inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {busy === 'run' ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              Verifică acum
            </button>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['În așteptare', (counts.pending || 0) + (counts.retry || 0)],
            ['Finalizate', counts.completed || 0],
            ['În lucru', counts.processing || 0],
            ['Cu eroare', counts.failed || 0],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="mt-1 text-xl font-bold text-gray-900">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {(error || notice) && (
        <div className={`rounded-lg border p-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error ? <AlertTriangle className="mr-2 inline" size={16} /> : <CheckCircle2 className="mr-2 inline" size={16} />}
          {error || notice}
        </div>
      )}

      <div className="space-y-3">
        {rules.map((rule) => {
          const interval = intervalRules[rule.rule_key];
          const intervalValue = interval ? Number(rule.config?.[interval.field] || 0) : null;
          return (
            <article key={rule.id} className={`rounded-xl border bg-white p-4 sm:p-5 ${rule.is_enabled ? 'border-emerald-200' : 'border-gray-200 opacity-75'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{rule.name}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${rule.is_enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {rule.is_enabled ? 'Activă' : 'Oprită'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">{rule.description}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                    <span>Maximum {rule.max_attempts} încercări</span>
                    <span>Reîncearcă după {humanInterval(rule.retry_delay_minutes)}</span>
                    {rule.last_run_at && <span>Ultima rulare: {new Date(rule.last_run_at).toLocaleString('ro-RO')}</span>}
                  </div>
                </div>
                <label className={`relative inline-flex shrink-0 items-center ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                  <input type="checkbox" className="peer sr-only" checked={rule.is_enabled}
                    disabled={!canEdit || busy === rule.id}
                    onChange={(event) => void patchRule(rule, { is_enabled: event.target.checked })} />
                  <span className="h-6 w-11 rounded-full bg-gray-300 transition peer-checked:bg-emerald-600 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
                </label>
              </div>
              {interval && intervalValue !== null && (
                <div className="mt-4 flex flex-col gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <label className="text-sm font-medium text-gray-700"><Clock3 className="mr-1.5 inline" size={15} />{interval.label}</label>
                  <select value={intervalValue} disabled={!canEdit || busy === rule.id}
                    onChange={(event) => void patchRule(rule, { interval_minutes: Number(event.target.value) })}
                    className="mobile-touch-target rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 disabled:bg-gray-100">
                    {[
                      [0, 'Imediat'], [15, '15 minute'], [30, '30 minute'], [60, '1 oră'],
                      [120, '2 ore'], [240, '4 ore'], [480, '8 ore'], [1440, '1 zi'],
                      [2880, '2 zile'], [4320, '3 zile'], [10080, '7 zile'],
                    ].filter(([value]) => rule.rule_key === 'task_overdue' || Number(value) > 0)
                      .map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {failedJobs.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-white p-4 sm:p-5">
          <h2 className="font-semibold text-red-800">Execuții care necesită atenție</h2>
          <div className="mt-3 space-y-2">
            {failedJobs.map((job) => {
              const rule = rules.find((item) => item.id === job.rule_id);
              return (
                <div key={job.id} className="flex flex-col gap-2 rounded-lg bg-red-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-red-900">{rule?.name || 'Automatizare'}</p>
                    <p className="mt-0.5 text-xs text-red-700">{job.last_error || 'A eșuat după toate încercările.'}</p>
                  </div>
                  {canEdit && (
                    <button onClick={() => void run(job.id)} disabled={!!busy}
                      className="mobile-touch-target inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">
                      {busy === job.id ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                      Reîncearcă
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
