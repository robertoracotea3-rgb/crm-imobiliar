'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { getCities } from '@/lib/romania-locations';
import { supabase } from '@/lib/supabase';
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Copy,
  ExternalLink, Filter, Layers3, Loader2, MapPin, RefreshCw, StickyNote, Target, Trash2,
} from 'lucide-react';

interface Prospect {
  id: string; source: string; url: string; title?: string | null; price?: number | null;
  currency?: string | null; category?: string | null; transaction?: string | null;
  county?: string | null; city?: string | null; zone?: string | null; phone?: string | null;
  seller_name?: string | null; posted_at?: string | null; status: string; notes?: string | null;
  first_seen_at: string; last_seen_at: string; last_checked_at?: string | null; sync_error?: string | null;
  duplicate_group_key?: string | null; duplicate_confidence?: number | null; duplicate_reasons?: string[];
  agency_suspected?: boolean; agency_confidence?: number; agency_reasons?: string[]; missing_count?: number;
}

interface SourceHealth {
  source: string; label: string; active: boolean; terms_url?: string | null;
  compliance_status: 'review_required' | 'approved' | 'paused'; compliance_note?: string | null;
  last_run_at?: string | null; last_success_at?: string | null; last_error_at?: string | null;
  last_error?: string | null; last_duration_ms?: number | null; last_processed_count: number;
  consecutive_failures: number; last_run_complete?: boolean | null; success_rate?: number | null;
}

interface Pagination { page: number; page_size: number; total: number; pages: number }

const STATUS_META: Record<string, { label: string; cls: string }> = {
  actionable: { label: 'Noi și active', cls: '' },
  new: { label: 'Nou', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  active: { label: 'Activ', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  contacted: { label: 'Contactat', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  interested: { label: 'Interesat', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
  rejected: { label: 'Respins', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  stale: { label: 'Vechi', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  removed: { label: 'Dispărut', cls: 'bg-red-50 text-red-700 border-red-200' },
  duplicate: { label: 'Duplicat', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  agency_suspected: { label: 'Agenție suspectată', cls: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200' },
  imported_to_portfolio: { label: 'Importat în portofoliu', cls: 'bg-green-50 text-green-800 border-green-200' },
};

const EDITABLE_STATUSES = Object.entries(STATUS_META).filter(([status]) => status !== 'actionable');
const CATEGORIES = [
  ['', 'Toate tipurile'], ['apartament', 'Apartamente'], ['casa', 'Case / vile'],
  ['teren', 'Terenuri'], ['comercial', 'Comercial'],
];
const LOCALITIES = Array.from(new Set([
  ...getCities('Brașov'), 'Brașov', 'Făgăraș', 'Săcele', 'Codlea', 'Zărnești', 'Râșnov', 'Ghimbav',
  'Victoria', 'Predeal', 'Rupea', 'Cristian', 'Sânpetru', 'Hărman', 'Prejmer', 'Tărlungeni',
  'Bod', 'Bran', 'Moieciu', 'Fundata', 'Vulcan',
])).sort((a, b) => a.localeCompare(b, 'ro'));

const fmtDate = (value?: string | null) => value
  ? new Date(value).toLocaleString('ro-RO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '—';

export default function ProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [sources, setSources] = useState<SourceHealth[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, page_size: 25, total: 0, pages: 0 });
  const [filters, setFilters] = useState({
    status: 'actionable', source: '', category: '', transaction: '', city: '', q: '',
    duplicate: false, agency_suspected: false, has_error: false, sort: 'last_seen_desc',
  });
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token;
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(filters.q.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [filters.q]);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const accessToken = await token();
      if (!accessToken) return;
      const query = new URLSearchParams({ page: String(page), page_size: '25', sort: filters.sort });
      if (filters.status) query.set('status', filters.status);
      if (filters.source) query.set('source', filters.source);
      if (filters.category) query.set('category', filters.category);
      if (filters.transaction) query.set('transaction', filters.transaction);
      if (filters.city) query.set('city', filters.city);
      if (debouncedSearch) query.set('q', debouncedSearch);
      if (filters.duplicate) query.set('duplicate', '1');
      if (filters.agency_suspected) query.set('agency_suspected', '1');
      if (filters.has_error) query.set('has_error', '1');
      const response = await fetch(`/api/prospects?${query}`, {
        headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Lista nu a putut fi încărcată.');
      setNeedsMigration(Boolean(data.needsMigration));
      setProspects(data.prospects || []);
      setSources(data.sources || []);
      setPagination(data.pagination || { page, page_size: 25, total: 0, pages: 0 });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Eroare la încărcare.' });
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filters.status, filters.source, filters.category, filters.transaction,
    filters.city, filters.duplicate, filters.agency_suspected, filters.has_error, filters.sort]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- server data must refresh when a filter changes
  useEffect(() => { void load(1); }, [load]);

  const setFilter = <K extends keyof typeof filters>(key: K, value: (typeof filters)[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const refresh = async () => {
    setRefreshing(true); setMessage(null);
    try {
      const accessToken = await token();
      if (!accessToken) return;
      const response = await fetch('/api/prospects/refresh', {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: sources.filter((source) => source.active).map((source) => source.source) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Actualizarea a eșuat.');
      const details = (data.results || []).map((result: Record<string, unknown>) =>
        `${String(result.label)}: ${result.error ? String(result.error) : `${Number(result.count || 0)} procesate`}`
      ).join(' · ');
      const hasError = (data.results || []).some((result: Record<string, unknown>) => result.error);
      setMessage({ kind: hasError ? 'error' : 'ok', text: details || 'Actualizare finalizată.' });
      await load(1);
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Actualizarea a eșuat.' });
    } finally {
      setRefreshing(false);
    }
  };

  const patchProspect = async (prospect: Prospect, patch: Record<string, unknown>) => {
    const accessToken = await token();
    if (!accessToken) return false;
    const response = await fetch('/api/prospects', {
      method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: prospect.id, ...patch }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage({ kind: 'error', text: data.error || 'Modificarea nu a fost salvată.' });
      return false;
    }
    setProspects((current) => current.map((item) => item.id === prospect.id ? { ...item, ...data.prospect } : item));
    return true;
  };

  const editNote = async (prospect: Prospect) => {
    const notes = window.prompt('Notiță pentru acest anunț:', prospect.notes || '');
    if (notes !== null) await patchProspect(prospect, { notes });
  };

  const remove = async (prospect: Prospect) => {
    if (!window.confirm('Ascunzi acest anunț din CRM? Sursa nu este afectată.')) return;
    const accessToken = await token();
    if (!accessToken) return;
    const response = await fetch(`/api/prospects?id=${prospect.id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await response.json();
    if (!response.ok) setMessage({ kind: 'error', text: data.error || 'Anunțul nu a putut fi ascuns.' });
    else await load(pagination.page);
  };

  const activeSources = sources.filter((source) => source.active);
  const compliancePending = activeSources.filter((source) => source.compliance_status !== 'approved');
  const groupedCount = useMemo(() => prospects.filter((prospect) => prospect.duplicate_group_key).length, [prospects]);

  return (
    <ProtectedLayout module="prospects">
      <main className="p-4 md:p-6 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2 text-[#0E6B54]"><Target size={28} /> Anunțuri particulari</h1>
            <p className="text-sm text-gray-500 mt-1">{pagination.total.toLocaleString('ro-RO')} rezultate în toate paginile · maximum 25 afișate odată</p>
          </div>
          <button onClick={refresh} disabled={refreshing || activeSources.length === 0}
            className="mobile-touch-target flex w-full items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-white bg-[#0E6B54] disabled:opacity-50 sm:w-auto">
            {refreshing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
            {refreshing ? 'Se actualizează…' : 'Actualizează sursele'}
          </button>
        </div>

        {message && <div className={`rounded-xl border p-3 mb-4 text-sm ${message.kind === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>{message.text}</div>}
        {needsMigration && <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-900 mb-4">Modulul nou necesită migrația Fazei 9.</div>}
        {compliancePending.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-900 mb-4 flex gap-2">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <span>Colectarea automată este oprită pentru {compliancePending.map((source) => source.label).join(', ')} până la confirmarea condițiilor portalului. Linkurile oficiale apar mai jos.</span>
          </div>
        )}

        {sources.length > 0 && (
          <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4" aria-label="Starea surselor">
            {sources.map((source) => (
              <div key={source.source} className="bg-white border border-gray-200 rounded-xl p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <strong>{source.label}</strong>
                  <span className={`text-xs flex items-center gap-1 ${source.last_error ? 'text-red-600' : 'text-emerald-700'}`}>
                    {source.last_error ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
                    {source.active ? 'Activă' : 'Inactivă'}
                  </span>
                </div>
                <div className="mt-2 text-xs text-gray-500 space-y-1">
                  <p>Ultima reușită: {fmtDate(source.last_success_at)}</p>
                  <p>{source.last_processed_count || 0} procesate · {source.last_duration_ms ? `${(source.last_duration_ms / 1000).toFixed(1)} sec` : 'durată —'} · succes {source.success_rate ?? '—'}%</p>
                  {source.last_error && <p className="text-red-600 break-words">Eroare: {source.last_error}</p>}
                  {source.terms_url && <a className="text-[#0E6B54] underline" href={source.terms_url} target="_blank" rel="noreferrer">Condițiile oficiale</a>}
                </div>
              </div>
            ))}
          </section>
        )}

        <section className="bg-white rounded-xl border border-gray-200 p-3 mb-5">
          <div className="flex flex-wrap gap-2 items-center">
            <Filter size={16} className="text-gray-400" />
            <input value={filters.q} onChange={(event) => setFilter('q', event.target.value)} placeholder="Caută titlu, vânzător, localitate…"
              className="min-w-0 flex-[1_1_14rem] rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <select value={filters.status} onChange={(event) => setFilter('status', event.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="">Toate stările</option>
              {Object.entries(STATUS_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
            </select>
            <select value={filters.source} onChange={(event) => setFilter('source', event.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="">Toate sursele active</option>
              {activeSources.map((source) => <option key={source.source} value={source.source}>{source.label}</option>)}
            </select>
            <select value={filters.category} onChange={(event) => setFilter('category', event.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
              {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select value={filters.transaction} onChange={(event) => setFilter('transaction', event.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="">Vânzare și închiriere</option><option value="vanzare">Vânzare</option><option value="inchiriere">Închiriere</option>
            </select>
            <select value={filters.city} onChange={(event) => setFilter('city', event.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-40">
              <option value="">Toate localitățile</option>
              {LOCALITIES.map((city) => <option key={city} value={city}>{city}</option>)}
            </select>
            <select value={filters.sort} onChange={(event) => setFilter('sort', event.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="last_seen_desc">Văzute recent</option><option value="first_seen_desc">Adăugate recent</option>
              <option value="price_asc">Preț crescător</option><option value="price_desc">Preț descrescător</option>
              <option value="last_checked_desc">Verificate recent</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-600">
            <label className="flex items-center gap-2"><input type="checkbox" checked={filters.duplicate} onChange={(event) => setFilter('duplicate', event.target.checked)} /> Duplicate grupate {groupedCount ? `(${groupedCount} în pagină)` : ''}</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={filters.agency_suspected} onChange={(event) => setFilter('agency_suspected', event.target.checked)} /> Agenții suspectate</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={filters.has_error} onChange={(event) => setFilter('has_error', event.target.checked)} /> Cu eroare de sincronizare</label>
          </div>
        </section>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-28 bg-gray-100 rounded-xl animate-pulse" />)}</div>
        ) : prospects.length === 0 ? (
          <div className="text-center py-16 bg-white border border-gray-200 rounded-xl"><Target size={40} className="mx-auto text-gray-300 mb-3" /><p className="text-gray-600 font-medium">Niciun rezultat pentru filtrele alese.</p></div>
        ) : (
          <div className="space-y-3">
            {prospects.map((prospect) => {
              const meta = STATUS_META[prospect.status] || STATUS_META.active;
              return (
                <article key={prospect.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex flex-col lg:flex-row lg:items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a href={prospect.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-gray-900 hover:text-[#0E6B54] break-words">{prospect.title || 'Anunț fără titlu'}</a>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-violet-50 text-violet-700 border-violet-200">{sources.find((source) => source.source === prospect.source)?.label || prospect.source}</span>
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${meta.cls}`}>{meta.label}</span>
                        {prospect.duplicate_group_key && <span title={(prospect.duplicate_reasons || []).join(', ')} className="text-[11px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 flex items-center gap-1"><Layers3 size={11} /> Grup duplicat {Math.round((prospect.duplicate_confidence || 0) * 100)}%</span>}
                        {prospect.agency_suspected && <span title={(prospect.agency_reasons || []).join(', ')} className="text-[11px] px-2 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-700">Agenție suspectată {prospect.agency_confidence || 0}%</span>}
                      </div>
                      <div className="flex items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-500 flex-wrap">
                        {typeof prospect.price === 'number' && <strong className="text-gray-800">{prospect.price.toLocaleString('ro-RO')} {prospect.currency || 'EUR'}</strong>}
                        <span className="flex items-center gap-1"><MapPin size={12} />{[prospect.city, prospect.zone].filter(Boolean).join(' · ') || 'Localitate necunoscută'}</span>
                        {prospect.category && <span>{prospect.category}</span>}{prospect.transaction && <span>{prospect.transaction}</span>}
                        {prospect.seller_name && <span>Vânzător: {prospect.seller_name}</span>}
                      </div>
                      <div className="grid sm:grid-cols-3 gap-1 mt-2 text-[11px] text-gray-500">
                        <span>Prima apariție: {fmtDate(prospect.first_seen_at)}</span>
                        <span>Ultima apariție: {fmtDate(prospect.last_seen_at)}</span>
                        <span>Ultima verificare: {fmtDate(prospect.last_checked_at)}</span>
                      </div>
                      {prospect.sync_error && <p className="mt-2 text-xs text-red-600 flex items-start gap-1"><AlertTriangle size={13} className="shrink-0" /> {prospect.sync_error}</p>}
                      {prospect.notes && <p className="mt-2 text-xs text-gray-600 italic">Notiță: {prospect.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap lg:justify-end">
                      <a href={prospect.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs px-2 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"><ExternalLink size={14} /> Vezi anunțul</a>
                      <button onClick={() => navigator.clipboard.writeText(prospect.url)} className="p-2 text-gray-500 hover:text-[#0E6B54]" title="Copiază linkul"><Copy size={16} /></button>
                      <select value={prospect.status} onChange={(event) => void patchProspect(prospect, { status: event.target.value })} className="text-xs border border-gray-300 rounded-lg px-2 py-2 bg-white">
                        {EDITABLE_STATUSES.map(([status, statusMeta]) => <option key={status} value={status}>{statusMeta.label}</option>)}
                      </select>
                      <button onClick={() => void editNote(prospect)} className="p-2 text-gray-500 hover:text-amber-600" title="Notiță"><StickyNote size={16} /></button>
                      <button onClick={() => void remove(prospect)} className="p-2 text-red-500 hover:text-red-700" title="Ascunde"><Trash2 size={16} /></button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-5 text-sm text-gray-600">
          <span>Pagina {pagination.page} din {Math.max(pagination.pages, 1)} · {pagination.total.toLocaleString('ro-RO')} rezultate</span>
          <div className="flex gap-2">
            <button disabled={loading || pagination.page <= 1} onClick={() => void load(pagination.page - 1)} className="flex items-center gap-1 px-3 py-2 border rounded-lg disabled:opacity-40"><ChevronLeft size={15} /> Înapoi</button>
            <button disabled={loading || pagination.page >= pagination.pages} onClick={() => void load(pagination.page + 1)} className="flex items-center gap-1 px-3 py-2 border rounded-lg disabled:opacity-40">Înainte <ChevronRight size={15} /></button>
          </div>
        </div>
        <p className="mt-4 text-xs text-gray-400 flex items-center gap-1"><Clock3 size={12} /> Clasificarea „agenție suspectată” este orientativă și trebuie confirmată de un agent.</p>
      </main>
    </ProtectedLayout>
  );
}
