'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { BarChart } from '@/components/Charts';
import {
  Wallet, TrendingUp, DollarSign, Handshake, Trophy, BarChart3,
  Plus, X, Loader2, Trash2, Pencil, UserCog, Calendar, RefreshCw, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { TRANSACTION_STATUSES } from '@/lib/crm-catalogs';

interface Finance {
  currency: string;
  needs_migration?: boolean;
  total_commission: number;
  total_agent_commission: number;
  this_month_commission: number;
  transaction_value: number;
  deals_count: number;
  avg_commission: number;
  pipeline_commission: number;
  by_month: { month: string; count: number }[];
  by_agent: { agent_id: string; name: string; agency_commission: number; agent_commission: number; deals: number }[];
}

interface Tx {
  id: string;
  property_id?: string | null;
  agent_id?: string | null;
  contact_id?: string | null;
  type: string;
  status: string;
  sale_price: number;
  currency: string;
  agency_commission: number;
  agent_commission: number;
  closed_at?: string | null;
  completed_at?: string | null;
  notes?: string | null;
  legacy_import?: boolean;
  legacy_import_reason?: string | null;
  property_code_snapshot?: string | null;
  property_title_snapshot?: string | null;
  contact_name_snapshot?: string | null;
  removal_jobs?: { id: string; portal: string; status: string; attempts: number; max_attempts: number; last_error?: string | null }[];
}

interface PropOpt { id: string; title: string; internal_code: string; price?: number; currency?: string; agent_id?: string | null; attributes?: Record<string, unknown> }
interface AgentOpt { id: string; name?: string; email?: string }
interface ContactOpt { id: string; name: string }
interface Pagination { page: number; page_size: number; total: number; pages: number }

const money = (n: number, cur = 'EUR') => `${(n || 0).toLocaleString('ro-RO')} ${cur}`;
const ic = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900 text-sm';
const num = (v: unknown) => { const n = parseFloat(String(v)); return Number.isFinite(n) ? n : 0; };

function propCommission(p: PropOpt): number {
  const a = p.attributes || {};
  const price = num(p.price);
  let prop = num(a.comision_prop_val) || (num(a.comision_prop_pct) ? price * num(a.comision_prop_pct) / 100 : 0);
  const chir = num(a.comision_chir_val) || (num(a.comision_chir_pct) ? price * num(a.comision_chir_pct) / 100 : 0);
  if (!prop && !chir && num(a.comision)) prop = price * num(a.comision) / 100;
  return Math.round(prop + chir);
}

function Kpi({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}>{icon}</div>
      <p className="text-2xl font-black text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function TransactionDialog({ editing, props, agents, contacts, onClose, onSuccess }: {
  editing?: Tx | null;
  props: PropOpt[]; agents: AgentOpt[]; contacts: ContactOpt[];
  onClose: () => void; onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    property_id: editing?.property_id || '',
    agent_id: editing?.agent_id || '',
    contact_id: editing?.contact_id || '',
    type: editing?.type || 'vanzare',
    status: editing?.status || 'draft',
    status_reason: '',
    sale_price: editing ? String(editing.sale_price) : '',
    currency: editing?.currency || 'EUR',
    agency_commission: editing ? String(editing.agency_commission) : '',
    agent_commission: editing ? String(editing.agent_commission) : '',
    notes: editing?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  // Selectarea proprietății pre-completează prețul, comisionul agenției și agentul.
  const onSelectProperty = (id: string) => {
    const p = props.find(x => x.id === id);
    setForm(f => ({
      ...f,
      property_id: id,
      sale_price: p?.price ? String(p.price) : f.sale_price,
      currency: p?.currency || f.currency,
      agency_commission: p ? String(propCommission(p) || f.agency_commission) : f.agency_commission,
      agent_id: p?.agent_id || f.agent_id,
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.property_id || !form.contact_id) { setError('Proprietatea și clientul sunt obligatorii.'); return; }
    if (num(form.sale_price) <= 0) { setError('Prețul tranzacției trebuie să fie mai mare decât zero.'); return; }
    if (editing && form.status === 'anulata' && !form.status_reason.trim()) { setError('Completează motivul anulării.'); return; }
    try {
      setSaving(true); setError('');
      const t = (await supabase.auth.getSession()).data.session?.access_token;
      if (!t) throw new Error('Sesiune expirată');
      const payload: Record<string, unknown> = { ...form };
      if (editing) payload.id = editing.id;
      let res = await fetch('/api/transactions', {
        method: editing ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(editing && form.status === 'finalizata' && editing.status !== 'finalizata'
          ? { ...payload, status: editing.status }
          : payload),
      });
      let d = await res.json();
      if (!res.ok) throw new Error(d.error);
      if (editing && form.status === 'finalizata' && editing.status !== 'finalizata') {
        res = await fetch('/api/transactions', {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editing.id, status: 'finalizata' }),
        });
        d = await res.json();
        if (!res.ok) throw new Error(d.error);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-gray-900">{editing ? 'Editează tranzacție' : 'Adaugă tranzacție'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">{error}</div>}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Proprietate</label>
            <select value={form.property_id} onChange={e => onSelectProperty(e.target.value)} className={ic}>
              <option value="">— Selectează proprietatea —</option>
              {props.map(p => <option key={p.id} value={p.id}>{p.internal_code} · {p.title}</option>)}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">Pre-completează prețul, comisionul agenției și agentul.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Tip</label>
              <select value={form.type} onChange={e => set('type', e.target.value)} className={ic}>
                <option value="vanzare">Vânzare</option>
                <option value="inchiriere">Închiriere</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Monedă</label>
              <select value={form.currency} onChange={e => set('currency', e.target.value)} className={ic}>
                <option value="EUR">EUR</option>
                <option value="RON">RON</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Etapa tranzacției</label>
            <select value={form.status} onChange={e => set('status', e.target.value)} className={ic} disabled={!editing}>
              {TRANSACTION_STATUSES.map(status => <option key={status.code} value={status.code}>{status.label}</option>)}
            </select>
            {!editing && <p className="text-[11px] text-gray-400 mt-1">Tranzacția nouă se salvează ca Draft și poate fi avansată controlat.</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Preț tranzacție</label>
            <input type="number" value={form.sale_price} onChange={e => set('sale_price', e.target.value)} className={ic} placeholder="ex: 75000" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Comision agenție</label>
              <input type="number" value={form.agency_commission} onChange={e => set('agency_commission', e.target.value)} className={ic} placeholder="ex: 1500" />
            </div>
            <div>
              <label className="text-xs font-medium text-emerald-700 mb-1 block">Comision agent</label>
              <input type="number" value={form.agent_commission} onChange={e => set('agent_commission', e.target.value)} className={ic} placeholder="ex: 600" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Agent</label>
            <select value={form.agent_id} onChange={e => set('agent_id', e.target.value)} className={ic}>
              <option value="">— Eu —</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name || a.email}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Client</label>
            <select value={form.contact_id} onChange={e => set('contact_id', e.target.value)} className={ic}>
              <option value="">— Selectează clientul —</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {editing && form.status === 'anulata' && <div><label className="text-xs font-medium text-gray-600 mb-1 block">Motiv anulare</label><input value={form.status_reason} onChange={e => set('status_reason', e.target.value)} className={ic} /></div>}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Note</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} className={ic} rows={2} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: '#0E6B54' }}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {saving ? 'Se salvează...' : editing ? 'Salvează' : 'Adaugă'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Anulare</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function FinancePage() {
  const [data, setData] = useState<Finance | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [props, setProps] = useState<PropOpt[]>([]);
  const [agents, setAgents] = useState<AgentOpt[]>([]);
  const [contacts, setContacts] = useState<ContactOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editing, setEditing] = useState<Tx | null>(null);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, page_size: 25, total: 0, pages: 0 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token;

  const fetchAll = useCallback(async () => {
    try {
      const t = await token();
      if (!t) { setError('Sesiune expirată'); return; }
      const h = { Authorization: `Bearer ${t}` };
      const [ov, tx] = await Promise.all([
        fetch('/api/finance/overview', { headers: h }).then(r => r.json()),
        fetch(`/api/transactions?page=${page}&page_size=25&search=${encodeURIComponent(search)}`, { headers: h }).then(r => r.json()),
      ]);
      if (ov.error) throw new Error(ov.error);
      setData(ov);
      setTxs(tx.transactions || []);
      setPagination(tx.pagination || { page, page_size: 25, total: 0, pages: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- authenticated server data is loaded when filters change
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    token().then(t => {
      if (!t) return;
      const h = { Authorization: `Bearer ${t}` };
      fetch('/api/properties/list', { headers: h }).then(r => r.json()).then(d => setProps((d.properties || []).map((p: PropOpt) => ({ id: p.id, title: p.title, internal_code: p.internal_code, price: p.price, currency: p.currency, agent_id: p.agent_id, attributes: p.attributes })))).catch(() => {});
      fetch('/api/agents/list', { headers: h }).then(r => r.json()).then(d => setAgents(d.agents || [])).catch(() => {});
      fetch('/api/contacts', { headers: h }).then(r => r.json()).then(d => setContacts(d.contacts || [])).catch(() => {});
    });
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Ștergi această tranzacție?')) return;
    const t = await token();
    if (!t) return;
    const res = await fetch(`/api/transactions?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } });
    if (res.ok) { setTxs(prev => prev.filter(x => x.id !== id)); fetchAll(); }
  };

  const retryRemoval = async (jobId: string) => {
    const t = await token();
    if (!t) return;
    const response = await fetch('/api/transactions/removals', {
      method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId }),
    });
    const result = await response.json();
    if (!response.ok) setError(result.error || 'Retragerea nu a putut fi reluată.');
    await fetchAll();
  };

  const propLabel = (transaction: Tx) => transaction.property_code_snapshot
    || props.find(x => x.id === transaction.property_id)?.internal_code || '—';
  const agentLabel = (id?: string | null) => { const a = agents.find(x => x.id === id); return a?.name || a?.email || '—'; };
  const statusLabel = (status: string) => TRANSACTION_STATUSES.find(item => item.code === status)?.label || status;

  // Blochează randarea pentru non-owner (redirect gestionat în useEffect de mai sus)
  return (
    <ProtectedLayout module="finance">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2" style={{ color: '#0E6B54' }}>
              <Wallet size={28} /> Finanțe
            </h1>
            <p className="text-sm text-gray-500 mt-1">Tranzacții și comisioane (valori în EUR)</p>
          </div>
          <button onClick={() => setIsAddOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white hover:opacity-90"
            style={{ backgroundColor: '#0E6B54' }}>
            <Plus size={18} />Adaugă tranzacție
          </button>
        </div>

        {data?.needs_migration && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
            Tabela <code>transactions</code> nu există încă — rulează migrarea SQL în Supabase pentru a salva tranzacții.
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-gray-100 rounded-2xl animate-pulse" />)}
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-800">{error}</div>
        ) : data && (
          <>
            {/* Total încasat = comision agenție + comision agent */}
            <div className="rounded-2xl p-5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              style={{ background: 'linear-gradient(135deg, #0E6B54 0%, #1a9070 60%, #22c68a 100%)' }}>
              <div>
                <p className="text-sm text-white/80">Total comision încasat</p>
                <p className="text-3xl md:text-4xl font-black">{money(data.total_commission + data.total_agent_commission)}</p>
              </div>
              <div className="text-sm text-white/90 flex items-center gap-4">
                <span>Agenție <b className="text-base">{money(data.total_commission)}</b></span>
                <span className="text-white/50">+</span>
                <span>Agent <b className="text-base">{money(data.total_agent_commission)}</b></span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Kpi icon={<DollarSign size={20} className="text-emerald-600" />} color="bg-emerald-50"
                label="Comision agenție" value={money(data.total_commission)} sub={`${data.deals_count} tranzacții`} />
              <Kpi icon={<UserCog size={20} className="text-blue-600" />} color="bg-blue-50"
                label="Comision agenți (total)" value={money(data.total_agent_commission)} sub="cât merge la agenți" />
              <Kpi icon={<Handshake size={20} className="text-purple-600" />} color="bg-purple-50"
                label="Valoare tranzacții" value={money(data.transaction_value)} sub={`medie comision ${money(data.avg_commission)}`} />
              <Kpi icon={<TrendingUp size={20} className="text-amber-600" />} color="bg-amber-50"
                label="Comision luna aceasta" value={money(data.this_month_commission)} sub={`potențial activ ${money(data.pipeline_commission)}`} />
            </div>

            {/* Comision pe luni */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 size={18} className="text-emerald-600" />
                <h3 className="font-bold text-gray-900">Comision agenție pe luni (12 luni)</h3>
              </div>
              {data.by_month.some(m => m.count > 0)
                ? <BarChart data={data.by_month} compactValues height={140} />
                : <p className="text-sm text-gray-400 text-center py-6">Nicio tranzacție încă. Adaugă prima cu butonul de mai sus.</p>}
            </div>

            {/* Comision pe agent */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <Trophy size={18} className="text-emerald-600" />
                <h3 className="font-bold text-gray-900">Comision pe agent</h3>
              </div>
              {data.by_agent.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Niciun comision atribuit încă.</p>
              ) : (
                <div className="space-y-3">
                  {data.by_agent.map((a, i) => (
                    <div key={a.agent_id} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-gray-400 w-5">{i + 1}</span>
                      <span className="text-sm font-medium text-gray-800 flex-1 truncate">{a.name}</span>
                      <span className="text-xs text-gray-500">{a.deals} tranz.</span>
                      <span className="text-xs text-gray-600">Agenție: <b className="text-gray-800">{money(a.agency_commission)}</b></span>
                      <span className="text-xs text-emerald-700">Agent: <b>{money(a.agent_commission)}</b></span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Lista tranzacții */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900">Tranzacții ({pagination.total})</h3>
                <div className="flex gap-2">
                  <input value={search} onChange={event => { setPage(1); setSearch(event.target.value); }}
                    placeholder="Caută proprietate sau client" className="px-3 py-2 border rounded-lg text-sm w-full sm:w-64" />
                  <button onClick={() => void fetchAll()} className="p-2 border rounded-lg" title="Reîmprospătează"><RefreshCw size={16} /></button>
                </div>
              </div>
              {txs.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Nicio tranzacție înregistrată.</p>
              ) : (
                <div className="space-y-2">
                  {txs.map(t => (
                    <div key={t.id} className="flex items-center gap-3 flex-wrap border border-gray-100 rounded-xl p-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${t.type === 'vanzare' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
                        {t.type === 'vanzare' ? 'Vânzare' : 'Închiriere'}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{statusLabel(t.status)}</span>
                      <span className="text-sm font-medium text-gray-800">{propLabel(t)}</span>
                      <span className="text-xs text-gray-500">{t.contact_name_snapshot || 'Client neidentificat'}</span>
                      <span className="text-xs text-gray-400 flex items-center gap-1"><Calendar size={11} />{t.closed_at || '—'}</span>
                      <span className="text-xs text-gray-500">{agentLabel(t.agent_id)}</span>
                      {t.legacy_import && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-800" title={t.legacy_import_reason || ''}>Import istoric incomplet</span>}
                      {(t.removal_jobs || []).map(job => (
                        <span key={job.id} className={`text-[10px] px-2 py-0.5 rounded-full ${job.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700' : job.status === 'retry' || job.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                          {job.portal}: {job.status}
                          {(job.status === 'retry' || job.status === 'failed') && <button onClick={() => void retryRemoval(job.id)} className="ml-1 underline">reîncearcă</button>}
                        </span>
                      ))}
                      <div className="ml-auto flex items-center gap-3">
                        <span className="text-xs text-gray-600">Preț: <b>{money(t.sale_price, t.currency)}</b></span>
                        <span className="text-xs text-gray-600">Agenție: <b className="text-gray-800">{money(t.agency_commission, t.currency)}</b></span>
                        <span className="text-xs text-emerald-700">Agent: <b>{money(t.agent_commission, t.currency)}</b></span>
                        <button onClick={() => setEditing(t)} className="p-1 text-gray-400 hover:text-emerald-600" title="Editează"><Pencil size={14} /></button>
                        {t.status !== 'finalizata' && <button onClick={() => handleDelete(t.id)} className="p-1 text-red-400 hover:text-red-600" title="Șterge"><Trash2 size={14} /></button>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between mt-4 text-xs text-gray-500">
                <span>Pagina {pagination.page} din {Math.max(1, pagination.pages)}</span>
                <div className="flex gap-2">
                  <button disabled={page <= 1} onClick={() => setPage(current => current - 1)} className="p-2 border rounded-lg disabled:opacity-40"><ChevronLeft size={15} /></button>
                  <button disabled={page >= pagination.pages} onClick={() => setPage(current => current + 1)} className="p-2 border rounded-lg disabled:opacity-40"><ChevronRight size={15} /></button>
                </div>
              </div>
            </div>
          </>
        )}

        {(isAddOpen || editing) && (
          <TransactionDialog
            editing={editing}
            props={props} agents={agents} contacts={contacts}
            onClose={() => { setIsAddOpen(false); setEditing(null); }}
            onSuccess={() => { setIsAddOpen(false); setEditing(null); fetchAll(); }}
          />
        )}
      </div>
    </ProtectedLayout>
  );
}
