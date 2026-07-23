'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Filter, Loader2,
  RefreshCw, ShieldCheck, XCircle,
} from 'lucide-react';

import { ProtectedLayout } from '@/components/ProtectedLayout';
import { supabase } from '@/lib/supabase';

interface AuditEvent {
  id: string;
  actor_name: string;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_values: unknown;
  after_values: unknown;
  result: 'success' | 'denied' | 'failure';
  reason: string | null;
  route: string | null;
  user_agent: string | null;
  ip_recorded: boolean;
  occurred_at: string;
}

interface AuditResponse {
  events: AuditEvent[];
  integrity: { valid: boolean; checked: number; first_invalid_id?: string };
  pagination: { page: number; page_size: number; total: number; pages: number };
  needsMigration?: boolean;
  error?: string;
}

const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Autentificare',
  'auth.logout': 'Deconectare',
  'auth.login_failed': 'Autentificare eșuată',
  'auth.credentials_changed': 'Date de acces schimbate',
  'team.member_created': 'Membru creat',
  'team.member_disabled': 'Membru dezactivat',
  'team.role_changed': 'Rol schimbat',
  'team.permissions_changed': 'Permisiuni schimbate',
  'team.agent_reassigned': 'Date realocate',
  'contact.sensitive_list_accessed': 'Listă clienți consultată',
  'contact.sensitive_profile_accessed': 'Profil sensibil consultat',
  'contact.duplicate_review_viewed': 'Duplicate consultate',
  'contact.merged': 'Clienți uniți',
  'contact.merge_reverted': 'Unire anulată',
  'contact.merge_rejected': 'Propunere de unire respinsă',
  'contact.agent_reassigned': 'Client realocat',
  'contact.archived': 'Client arhivat',
  'property.agent_reassigned': 'Proprietăți realocate',
  'property.publication_changed': 'Publicare proprietăți schimbată',
  'property.archived': 'Proprietate arhivată',
  'transaction.created': 'Tranzacție creată',
  'transaction.updated': 'Tranzacție modificată',
  'transaction.finalized': 'Tranzacție finalizată',
  'transaction.archived': 'Tranzacție arhivată',
  'transaction.agent_reassigned': 'Tranzacție realocată',
  'transaction.commission_changed': 'Comision schimbat',
  'portal.removal_processed': 'Retragere portal procesată',
  'portal.removal_retried': 'Retragere portal reîncercată',
  'feed.exported': 'Feed exportat',
  'feed.token_created': 'Token feed creat',
  'feed.token_rotated': 'Token feed rotit',
  'feed.token_revoked': 'Token feed revocat',
  'audit.viewed': 'Jurnal consultat',
};

const RESULT_STYLE = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  denied: 'bg-amber-50 text-amber-800 border-amber-200',
  failure: 'bg-red-50 text-red-700 border-red-200',
};

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('ro-RO', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value));
}

function JsonDetails({ label, value }: { label: string; value: unknown }) {
  if (value == null || (typeof value === 'object' && Object.keys(value as object).length === 0)) return null;
  return (
    <details className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <summary className="cursor-pointer text-xs font-semibold text-gray-700">{label}</summary>
      <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all text-[11px] text-gray-600">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [integrity, setIntegrity] = useState({ valid: true, checked: 0 });
  const [pagination, setPagination] = useState({ page: 1, page_size: 30, total: 0, pages: 0 });
  const [action, setAction] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [needsMigration, setNeedsMigration] = useState(false);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error('Sesiunea a expirat.');
      const params = new URLSearchParams({ page: String(page), page_size: '30' });
      if (action) params.set('action', action);
      if (result) params.set('result', result);
      const response = await fetch(`/api/audit?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = await response.json() as AuditResponse;
      if (!response.ok) throw new Error(data.error || 'Jurnalul nu a putut fi încărcat.');
      setEvents(data.events || []);
      setIntegrity(data.integrity || { valid: false, checked: 0 });
      setPagination(data.pagination || { page, page_size: 30, total: 0, pages: 0 });
      setNeedsMigration(Boolean(data.needsMigration));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Eroare la încărcarea jurnalului.');
    } finally {
      setLoading(false);
    }
  }, [action, result]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- audit data is server-backed and filter dependent
  useEffect(() => { void load(1); }, [load]);

  return (
    <ProtectedLayout module="team" action="manage_permissions">
      <main className="mx-auto max-w-6xl p-4 md:p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100">
              <ShieldCheck className="text-emerald-700" size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#0E6B54]">Jurnal de audit</h1>
              <p className="text-sm text-gray-500">{pagination.total} acțiuni înregistrate</p>
            </div>
          </div>
          <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
            integrity.valid ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'
          }`}>
            {integrity.valid ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
            {integrity.valid
              ? `Lanț verificat: ${integrity.checked} evenimente`
              : 'Integritatea jurnalului necesită verificare'}
          </div>
        </div>

        {needsMigration && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Este necesară migrația Fazei 23 înainte de folosirea jurnalului.
          </div>
        )}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <AlertTriangle size={17} />{error}
          </div>
        )}

        <section className="mb-4 flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3 sm:flex-row">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-600"><Filter size={16} />Filtre</div>
          <input
            value={action}
            onChange={event => setAction(event.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 80))}
            placeholder="Acțiune, ex. auth.login"
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <select
            value={result}
            onChange={event => setResult(event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Toate rezultatele</option>
            <option value="success">Reușite</option>
            <option value="denied">Refuzate</option>
            <option value="failure">Eșuate</option>
          </select>
          <button
            onClick={() => void load(1)}
            disabled={loading}
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
            Reîncarcă
          </button>
        </section>

        {loading ? (
          <div className="space-y-3">{Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-xl bg-gray-100" />
          ))}</div>
        ) : events.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white py-20 text-center text-gray-500">
            Nu există evenimente pentru filtrele selectate.
          </div>
        ) : (
          <div className="space-y-3">
            {events.map(event => (
              <article key={event.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm text-gray-900">{ACTION_LABELS[event.action] || event.action}</strong>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${RESULT_STYLE[event.result]}`}>
                        {event.result === 'success' ? 'Reușit' : event.result === 'denied' ? 'Refuzat' : 'Eșuat'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                      {event.actor_name}{event.actor_role ? ` · ${event.actor_role}` : ''}
                      {' · '}{event.entity_type}{event.entity_id ? ` #${event.entity_id}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      {formatTimestamp(event.occurred_at)}
                      {event.route ? ` · ${event.route}` : ''}
                      {event.ip_recorded ? ' · IP pseudonimizat' : ''}
                    </p>
                    {event.reason && <p className="mt-2 text-sm text-gray-700">Motiv: {event.reason}</p>}
                  </div>
                  <code className="shrink-0 text-[10px] text-gray-400">{event.id}</code>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <JsonDetails label="Valori anterioare" value={event.before_values} />
                  <JsonDetails label="Valori noi" value={event.after_values} />
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between text-sm text-gray-600">
          <span>Pagina {pagination.page} din {Math.max(1, pagination.pages)}</span>
          <div className="flex gap-2">
            <button
              disabled={loading || pagination.page <= 1}
              onClick={() => void load(pagination.page - 1)}
              className="rounded-lg border p-2 disabled:opacity-40"
              aria-label="Pagina anterioară"
            ><ChevronLeft size={17} /></button>
            <button
              disabled={loading || pagination.page >= pagination.pages}
              onClick={() => void load(pagination.page + 1)}
              className="rounded-lg border p-2 disabled:opacity-40"
              aria-label="Pagina următoare"
            ><ChevronRight size={17} /></button>
          </div>
        </div>
      </main>
    </ProtectedLayout>
  );
}
