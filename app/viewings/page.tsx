'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import {
  VIEWING_STATUSES,
  VIEWING_STATUS_TRANSITIONS,
  canTransition,
  type ViewingStatus,
} from '@/lib/crm-catalogs';
import {
  Eye, Plus, X, Loader2, Trash2, Calendar, User, Phone, Home, Filter, Pencil,
} from 'lucide-react';

interface Viewing {
  id: string;
  title: string;
  start_at: string;
  end_at?: string | null;
  description?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_id?: string | null;
  demand_id?: string | null;
  lead_id?: string | null;
  property_id?: string | null;
  property_title?: string | null;
  property_code?: string | null;
  agent_id?: string | null;
  status?: string | null;
  outcome?: string | null;
}

// ISO → value pentru <input type="datetime-local"> (în fusul local).
function toLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STATUS_META: Record<string, { label: string; cls: string }> = Object.fromEntries(
  VIEWING_STATUSES.map((item) => [item.code, { label: item.label, cls: item.color }]),
);

const ic = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900 text-sm';
const fmt = (d: string) => new Date(d).toLocaleString('ro-RO', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

interface PropOpt { id: string; title: string; internal_code: string; owner_contact_id?: string | null }
interface ClientOpt { id: string; contact_name?: string; contact_phone?: string; category?: string }
interface ContactOpt { id: string; name: string; phone?: string }

function ViewingDialog({ editing, onClose, onSuccess }: { editing?: Viewing | null; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    lead_id: editing?.lead_id || '',
    property_id: editing?.property_id || '',
    contact_id: editing?.contact_id || '',
    start_at: toLocalInput(editing?.start_at),
    agent_id: editing?.agent_id || '',
    description: editing?.description || '',
  });
  const [props, setProps] = useState<PropOpt[]>([]);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [contacts, setContacts] = useState<ContactOpt[]>([]);
  const [agents, setAgents] = useState<{ id: string; name?: string; email?: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      const h = { Authorization: `Bearer ${session.access_token}` };
      fetch('/api/properties/list', { headers: h })
        .then(r => r.json() as Promise<{ properties?: PropOpt[] }>)
        .then(d => setProps((d.properties || []).map(p => ({ id: p.id, title: p.title, internal_code: p.internal_code, owner_contact_id: p.owner_contact_id }))))
        .catch(() => {});
      fetch('/api/leads/list', { headers: h }).then(r => r.json()).then(d => setClients(d.leads || [])).catch(() => {});
      fetch('/api/contacts', { headers: h }).then(r => r.json()).then(d => setContacts(d.contacts || [])).catch(() => {});
      fetch('/api/agents/list', { headers: h }).then(r => r.json()).then(d => setAgents(d.agents || [])).catch(() => {});
    });
  }, []);

  const contactById = (id?: string | null) => (id ? contacts.find(c => c.id === id) : undefined);
  const selectedProp = props.find(p => p.id === form.property_id);
  const ownerContact = contactById(selectedProp?.owner_contact_id);
  const clientContact = contactById(form.contact_id);
  const catLabel = (c?: string) => (c ? c.replace(/_/g, ' ') : '');

  // Selectarea clientului completează automat contactul, dacă găsim unul cu același telefon.
  const onSelectClient = (id: string) => {
    const cl = clients.find(x => x.id === id);
    const matchedContact = cl?.contact_phone ? contacts.find(c => c.phone && c.phone === cl.contact_phone) : undefined;
    setForm(f => ({ ...f, lead_id: id, contact_id: matchedContact?.id || f.contact_id }));
  };

  const canSave = !!form.property_id && !!form.contact_id && !!form.start_at;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.property_id) { setError('Selectează o proprietate'); return; }
    if (!form.contact_id) { setError('Selectează un contact (client) — direct sau prin client'); return; }
    if (!form.start_at) { setError('Data și ora sunt obligatorii'); return; }
    try {
      setSaving(true); setError('');
      const t = (await supabase.auth.getSession()).data.session?.access_token;
      if (!t) throw new Error('Sesiune expirată');
      const payload: Record<string, unknown> = {
        lead_id: form.lead_id || null,
        property_id: form.property_id,
        contact_id: form.contact_id,
        contact_name: clientContact?.name || null,
        contact_phone: clientContact?.phone || null,
        agent_id: form.agent_id || null,
        description: form.description,
        start_at: new Date(form.start_at).toISOString(),
        duration_minutes: editing?.end_at
          ? Math.max(15, Math.round((new Date(editing.end_at).getTime() - new Date(editing.start_at).getTime()) / 60_000))
          : 60,
      };
      if (editing) {
        payload.id = editing.id;
        payload.action = 'reschedule';
        payload.reason = 'Programare actualizată din CRM';
      }
      const res = await fetch('/api/viewings', {
        method: editing ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mobile-dialog-backdrop fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="mobile-dialog-panel bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-gray-900">{editing ? 'Editează vizionare' : 'Programează vizionare'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">{error}</div>}

          {/* Client — completează automat contactul, dacă găsim unul cu același telefon */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Client (opțional)</label>
            <select value={form.lead_id} onChange={e => onSelectClient(e.target.value)} className={ic}>
              <option value="">— Fără client —</option>
              {clients.map(cl => (
                <option key={cl.id} value={cl.id}>
                  {cl.contact_name || 'Client'}{catLabel(cl.category) ? ` · ${catLabel(cl.category)}` : ''}{cl.contact_phone ? ` · ${cl.contact_phone}` : ''}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">Dacă clientul are un contact cu același telefon, se completează automat mai jos.</p>
          </div>

          {/* Proprietate — obligatoriu */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Proprietate <span className="text-red-500">*</span></label>
            <select value={form.property_id} onChange={e => set('property_id', e.target.value)} className={ic}>
              <option value="">— Selectează —</option>
              {props.map(p => <option key={p.id} value={p.id}>{p.internal_code} · {p.title}</option>)}
            </select>
            {selectedProp && (
              <p className="text-[11px] mt-1 flex items-center gap-1 text-gray-500">
                <User size={11} className="text-emerald-600" />
                Proprietar: {ownerContact ? <b className="text-gray-700 ml-0.5">{ownerContact.name}</b> : <span className="text-gray-400 ml-0.5">fără contact asociat</span>}
                <span className="text-gray-400">· se salvează automat</span>
              </p>
            )}
          </div>

          {/* Contact client — obligatoriu (auto din client) */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Contact client <span className="text-red-500">*</span></label>
            <select value={form.contact_id} onChange={e => set('contact_id', e.target.value)} className={ic}>
              <option value="">— Selectează contact —</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
            </select>
            {clientContact?.phone && <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1"><Phone size={11} />{clientContact.phone}</p>}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Dată și oră <span className="text-red-500">*</span></label>
            <input type="datetime-local" value={form.start_at} onChange={e => set('start_at', e.target.value)} className={ic} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Agent</label>
            <select value={form.agent_id} onChange={e => set('agent_id', e.target.value)} className={ic}>
              <option value="">— Eu —</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name || a.email}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Observații</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} className={ic} rows={2} placeholder="Detalii..." />
          </div>

          {!canSave && (
            <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Pentru a salva, alege <b>proprietatea</b>, <b>contactul clientului</b> (direct sau prin client) și <b>data</b>.
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving || !canSave}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#0E6B54' }}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {saving ? 'Se salvează...' : editing ? 'Salvează modificările' : 'Programează'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Anulare</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ViewingsPage() {
  const [viewings, setViewings] = useState<Viewing[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editing, setEditing] = useState<Viewing | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [clockNow, setClockNow] = useState(0);

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token;

  const fetchViewings = useCallback(async () => {
    try {
      setLoading(true);
      const t = await token();
      if (!t) return;
      const res = await fetch('/api/viewings', { headers: { Authorization: `Bearer ${t}` } });
      const d = await res.json();
      if (d.needsMigration) setNeedsMigration(true);
      setViewings(d.viewings || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchViewings(); }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchViewings]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => setClockNow(Date.now()), 0);
    const interval = window.setInterval(() => setClockNow(Date.now()), 60_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, []);

  const changeStatus = async (v: Viewing, status: string) => {
    const t = await token();
    if (!t) return;
    if (status === 'programata' || status === 'amanata') {
      setEditing(v);
      return;
    }
    const payload: Record<string, unknown> = { id: v.id };
    if (status === 'confirmata') payload.action = 'confirm';
    if (status === 'anulata') {
      const reason = window.prompt('Motivul anulării:')?.trim();
      if (!reason) return;
      payload.action = 'cancel';
      payload.reason = reason;
    }
    if (status === 'efectuata') {
      const outcome = window.prompt('Rezultatul vizionării:')?.trim();
      if (!outcome) return;
      payload.action = 'complete';
      payload.outcome = outcome;
    }
    const response = await fetch('/api/viewings', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (response.ok) await fetchViewings();
  };

  const handleDelete = async (id: string) => {
    const reason = window.prompt('Motivul anulării vizionării:')?.trim();
    if (!reason) return;
    const t = await token();
    if (!t) return;
    const res = await fetch(`/api/viewings?id=${id}&reason=${encodeURIComponent(reason)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } });
    if (res.ok) await fetchViewings();
  };

  const visible = viewings.filter(v => !filterStatus || (v.status || 'programata') === filterStatus);
  const upcoming = clockNow === 0
    ? 0
    : viewings.filter(v => (v.status || 'programata') === 'programata' && new Date(v.start_at).getTime() > clockNow).length;

  return (
    <ProtectedLayout module="viewings">
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: '#0E6B54' }}>Vizionări</h1>
            <p className="text-sm text-gray-500 mt-1">{viewings.length} total · {upcoming} programate</p>
          </div>
          <button onClick={() => setIsAddOpen(true)}
            className="mobile-touch-target flex w-full items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-white hover:opacity-90 sm:w-auto"
            style={{ backgroundColor: '#0E6B54' }}>
            <Plus size={18} />Programează vizionare
          </button>
        </div>

        {needsMigration && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 mb-4">
            Coloanele <code>status/outcome</code> lipsesc din <code>calendar_events</code> — rulează migrarea SQL în Supabase.
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-3 mb-5 flex flex-wrap gap-3 items-center">
          <Filter size={15} className="text-gray-400" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
            <option value="">Toate</option>
            {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <span className="text-xs text-gray-400 ml-auto">{visible.length} vizionări</span>
        </div>

        {loading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16">
            <Eye size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">Nicio vizionare</p>
            <p className="text-sm text-gray-400 mt-1">Programează prima vizionare cu butonul de mai sus</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map(v => {
              const meta = STATUS_META[v.status || 'programata'] || STATUS_META.programata;
              return (
                <div key={v.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">{v.title}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${meta.cls}`}>{meta.label}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                        <span className="flex items-center gap-1"><Calendar size={12} />{fmt(v.start_at)}</span>
                        {v.contact_name && <span className="flex items-center gap-1"><User size={12} />{v.contact_name}</span>}
                        {v.contact_phone && <span className="flex items-center gap-1"><Phone size={12} />{v.contact_phone}</span>}
                      </div>
                      {v.property_title && <p className="text-xs text-emerald-700 mt-1 flex items-center gap-1"><Home size={12} />{v.property_code} · {v.property_title}</p>}
                      {v.description && <p className="text-xs text-gray-500 mt-1">{v.description}</p>}
                    </div>
                    <div className="flex w-full items-center gap-2 sm:w-auto sm:flex-shrink-0">
                      <select value={v.status || 'programata'} onChange={e => changeStatus(v, e.target.value)}
                        className="min-h-11 min-w-0 flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 sm:flex-none">
                        {Object.entries(STATUS_META).filter(([k]) => canTransition(
                          VIEWING_STATUS_TRANSITIONS,
                          (v.status || 'programata') as ViewingStatus,
                          k as ViewingStatus,
                        )).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                      </select>
                      <button onClick={() => setEditing(v)} className="mobile-touch-target flex h-11 w-11 items-center justify-center text-gray-400 hover:text-emerald-600" title="Editează"><Pencil size={15} /></button>
                      <button onClick={() => handleDelete(v.id)} className="mobile-touch-target flex h-11 w-11 items-center justify-center text-red-400 hover:text-red-600" title="Șterge"><Trash2 size={15} /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {(isAddOpen || editing) && (
          <ViewingDialog
            editing={editing}
            onClose={() => { setIsAddOpen(false); setEditing(null); }}
            onSuccess={() => { setIsAddOpen(false); setEditing(null); fetchViewings(); }}
          />
        )}
      </div>
    </ProtectedLayout>
  );
}
