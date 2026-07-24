'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { ReplyLeadDialog } from '@/components/ReplyLeadDialog';
import { RecordContactDialog } from '@/components/RecordContactDialog';
import { UnmatchedStoriaMessages } from '@/components/UnmatchedStoriaMessages';
import { ScheduleViewingDialog } from '@/components/ScheduleViewingDialog';
import { PipelineStageControl } from '@/components/PipelineStageControl';
import { JUDETE, ORASE_BY_JUDET } from '@/lib/romania-locations';
import {
  LEAD_PIPELINE_STAGES,
  LEAD_PIPELINE_TAB_GROUPS,
  pipelineMeta,
  pipelineStage,
} from '@/lib/crm-pipeline';
import {
  STATUS_ORDER, CLIENT_TABS, statusLabel, statusColor,
  initials, avatarColor, parseLeadMessage,
} from '@/lib/clients';
import {
  LEAD_SOURCES,
  LEAD_STATUS_TRANSITIONS,
  canTransition,
  isLeadStatus,
  leadSourceLabel,
  normalizeLeadSource,
} from '@/lib/crm-catalogs';
import {
  Plus, Search, Filter, Phone, Mail, MessageCircle, Pencil, Trash2,
  MoreVertical, Clock, User, MapPin, Tag, History, Target, X, Loader2,
  StickyNote, CalendarPlus, Globe, ChevronDown, Send,
  MessageSquareText,
} from 'lucide-react';

interface Client {
  id: string;
  contact_id?: string;
  contact_name: string;
  contact_phone: string;
  contact_email?: string;
  message?: string;
  property_id?: string;
  property_title?: string;
  property_public_code?: string;
  property_code?: string;
  property_public_url?: string;
  property_main_photo_url?: string;
  property_price?: number;
  property_currency?: string;
  status: string;
  pipeline_stage?: string;
  pipeline_stage_changed_at?: string;
  received_at: string;
  first_response_at?: string;
  source?: string;
  source_normalized?: string;
  city?: string;
  county?: string;
  category?: string;
  transaction?: string;
  budget_min?: number;
  budget_max?: number;
  currency?: string;
  criteria?: Record<string, unknown>;
  agent_id?: string;
  responsible_agent_id?: string;
  assigned_at?: string;
  first_contact_due_at?: string;
  lead_assignment_status?: 'assigned' | 'pending_owner';
  first_contact_attempt_at?: string;
  first_successful_contact_at?: string;
  contact_attempt_count?: number;
  contact_outcome?: string;
  last_contact_description?: string;
  contact_sla_status?: 'unassigned' | 'pending' | 'met' | 'late' | 'overdue';
  next_action_at?: string;
  next_action_type?: string;
  status_reason?: string;
  status_note?: string;
  lost_to_competitor?: string;
  lead_count?: number;
  demand_count?: number;
  profile_available?: boolean;
}

interface PropertyOption {
  id: string;
  internal_code?: string | null;
  title?: string | null;
  city?: string | null;
  category?: string | null;
  price?: number | null;
  currency?: string | null;
}

interface PropertyMatch {
  id: string;
  score: number;
  title?: string | null;
  city?: string | null;
  county?: string | null;
  price?: number | null;
  currency?: string | null;
  attributes?: { photos?: string[] } | null;
}

const CATEGORIES = ['apartament', 'casa_vila', 'teren', 'spatiu_comercial', 'spatiu_industrial', 'birou', 'pensiune_hotel', 'garaj'];
const CAT_LABEL = (c?: string) => (c ? c.replace(/_/g, ' ') : '');
const SOURCES = LEAD_SOURCES.filter((source) => source.active);
const ic = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900 text-sm';
const localDateTimeInput = (value: string | number | Date) => {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const contactSlaMeta = (client: Client) => {
  if (client.contact_sla_status === 'met') {
    return { label: 'Contactat în termen', color: 'bg-emerald-100 text-emerald-800' };
  }
  if (client.contact_sla_status === 'late') {
    return { label: 'Contactat cu întârziere', color: 'bg-amber-100 text-amber-800' };
  }
  if (client.contact_sla_status === 'overdue') {
    return { label: 'Contact întârziat', color: 'bg-red-100 text-red-800' };
  }
  if (client.contact_sla_status === 'unassigned') {
    return { label: 'Fără agent', color: 'bg-gray-100 text-gray-700' };
  }
  if (!client.first_contact_due_at) {
    return { label: 'Termen necalculat', color: 'bg-gray-100 text-gray-600' };
  }
  const remainingMinutes = Math.ceil((new Date(client.first_contact_due_at).getTime() - Date.now()) / 60_000);
  const label = remainingMinutes <= 60
    ? `${Math.max(0, remainingMinutes)} min rămase`
    : `${Math.ceil(remainingMinutes / 60)} ore rămase`;
  return { label, color: remainingMinutes <= 4 * 60 ? 'bg-orange-100 text-orange-800' : 'bg-cyan-100 text-cyan-800' };
};
const futureLocalInput = (minutes: number) => localDateTimeInput(Date.now() + minutes * 60_000);

function relativeTime(date?: string): string {
  if (!date) return '';
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'acum';
  if (m < 60) return `${m} min în urmă`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${h === 1 ? 'oră' : 'ore'} în urmă`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? 'zi' : 'zile'} în urmă`;
}

// ─────────────────────────────────────────────────────────── Avatar
function Avatar({ name }: { name?: string }) {
  return (
    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${avatarColor(name)}`}>
      {initials(name)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────── Add / Edit dialog
function ClientDialog({ client, agents, onClose, onSaved }: {
  client: Client | null; agents: { id: string; email: string }[]; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!client;
  const c = (client?.criteria || {}) as Record<string, unknown>;
  const [form, setForm] = useState({
    contact_name: client?.contact_name || '',
    contact_phone: client?.contact_phone || '',
    contact_email: client?.contact_email || '',
    message: isEdit ? parseLeadMessage(client?.message, client?.source).text : '',
    status: client?.status || 'new',
    source: client?.source_normalized || normalizeLeadSource(client?.source) || 'manual',
    county: client?.county || '',
    city: client?.city || '',
    category: client?.category || '',
    transaction: client?.transaction || 'vanzare',
    budget_min: client?.budget_min?.toString() || '',
    budget_max: client?.budget_max?.toString() || '',
    currency: client?.currency || 'EUR',
    nr_camere_min: (c.nr_camere_min as number)?.toString() || '',
    nr_camere_max: (c.nr_camere_max as number)?.toString() || '',
    suprafata_min: (c.suprafata_min as number)?.toString() || '',
    suprafata_max: (c.suprafata_max as number)?.toString() || '',
    agent_id: client?.agent_id || '',
    next_action_at: client?.next_action_at ? localDateTimeInput(client.next_action_at) : futureLocalInput(60),
    next_action_type: client?.next_action_type || (client ? 'follow_up' : 'first_contact'),
    status_reason: client?.status_reason || '',
    status_note: client?.status_note || '',
    lost_to_competitor: client?.lost_to_competitor || '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const cities = form.county ? (ORASE_BY_JUDET[form.county] || []) : [];

  const save = async () => {
    if (!form.contact_name.trim()) { setErr('Numele este obligatoriu'); return; }
    if (!form.contact_phone.trim()) { setErr('Telefonul este obligatoriu'); return; }
    setSaving(true); setErr('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Neautentificat');
      const payload = {
        contact_name: form.contact_name, contact_phone: form.contact_phone, contact_email: form.contact_email,
        message: form.message, status: form.status, source: form.source,
        county: form.county, city: form.city, category: form.category, transaction: form.transaction,
        budget_min: form.budget_min || null, budget_max: form.budget_max || null, currency: form.currency,
        agent_id: form.agent_id || null,
        next_action_at: form.next_action_at ? new Date(form.next_action_at).toISOString() : null,
        next_action_type: form.next_action_type || null,
        status_reason: form.status_reason,
        status_note: form.status_note,
        lost_to_competitor: form.lost_to_competitor,
        criteria: {
          ...(client?.criteria || {}),
          nr_camere_min: form.nr_camere_min ? +form.nr_camere_min : null,
          nr_camere_max: form.nr_camere_max ? +form.nr_camere_max : null,
          suprafata_min: form.suprafata_min ? +form.suprafata_min : null,
          suprafata_max: form.suprafata_max ? +form.suprafata_max : null,
        },
      };
      const res = await fetch(isEdit ? '/api/leads/update' : '/api/leads/create', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(isEdit ? { id: client!.id, ...payload } : payload),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Eroare la salvare');
      onSaved(); onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Eroare'); } finally { setSaving(false); }
  };

  return (
    <div className="mobile-dialog-backdrop fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="mobile-dialog-panel bg-white rounded-xl w-full max-w-lg shadow-2xl max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <h3 className="font-bold text-gray-900">{isEdit ? 'Editează client' : 'Client nou'}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-gray-600 block mb-1">Nume *</label>
              <input value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} className={ic} /></div>
            <div><label className="text-xs font-medium text-gray-600 block mb-1">Telefon *</label>
              <input value={form.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} className={ic} type="tel" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-gray-600 block mb-1">Email</label>
              <input value={form.contact_email} onChange={(e) => set('contact_email', e.target.value)} className={ic} type="email" /></div>
            <div><label className="text-xs font-medium text-gray-600 block mb-1">Sursă</label>
              <select value={form.source} onChange={(e) => set('source', e.target.value)} className={ic}>
                {SOURCES.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              </select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-gray-600 block mb-1">Status</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value)} className={ic}>
                {STATUS_ORDER.filter((s) => !client ? s === 'new' : (isLeadStatus(client.status) && canTransition(LEAD_STATUS_TRANSITIONS, client.status, s))).map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
              </select></div>
            <div><label className="text-xs font-medium text-gray-600 block mb-1">Agent responsabil</label>
              <select value={form.agent_id} onChange={(e) => set('agent_id', e.target.value)} className={ic}>
                <option value="">— Neasignat —</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
              </select></div>
          </div>
          {form.status === 'lost' && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
              <p className="text-xs font-semibold text-red-800">Detalii obligatorii pentru lead pierdut</p>
              <input value={form.status_reason} onChange={(e) => set('status_reason', e.target.value)} className={ic} placeholder="Motiv *" />
              <textarea value={form.status_note} onChange={(e) => set('status_note', e.target.value)} className={ic} rows={2} placeholder="Observație *" />
              <input value={form.lost_to_competitor} onChange={(e) => set('lost_to_competitor', e.target.value)} className={ic} placeholder="Concurent / altă agenție (dacă este cazul)" />
            </div>
          )}
          {!['won', 'lost', 'withdrawn'].includes(form.status) && (
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium text-gray-600 block mb-1">Următoarea acțiune *</label>
                <select value={form.next_action_type} onChange={(e) => set('next_action_type', e.target.value)} className={ic}>
                  <option value="first_contact">Prim contact</option><option value="follow_up">Revenire</option><option value="send_offers">Trimite oferte</option><option value="viewing">Vizionare</option>
                </select></div>
              <div><label className="text-xs font-medium text-gray-600 block mb-1">Data acțiunii *</label>
                <input type="datetime-local" value={form.next_action_at} onChange={(e) => set('next_action_at', e.target.value)} className={ic} /></div>
            </div>
          )}

          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 mb-2">CE CAUTĂ (pentru potriviri)</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium text-gray-600 block mb-1">Categorie</label>
                <select value={form.category} onChange={(e) => set('category', e.target.value)} className={ic}>
                  <option value="">— Oricare —</option>
                  {CATEGORIES.map((cat) => <option key={cat} value={cat}>{CAT_LABEL(cat)}</option>)}
                </select></div>
              <div><label className="text-xs font-medium text-gray-600 block mb-1">Tranzacție</label>
                <select value={form.transaction} onChange={(e) => set('transaction', e.target.value)} className={ic}>
                  <option value="vanzare">Cumpărare</option><option value="inchiriere">Închiriere</option>
                </select></div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div><label className="text-xs font-medium text-gray-600 block mb-1">Județ</label>
                <select value={form.county} onChange={(e) => { set('county', e.target.value); set('city', ''); }} className={ic}>
                  <option value="">— Oriunde —</option>
                  {JUDETE.map((j) => <option key={j} value={j}>{j}</option>)}
                </select></div>
              <div><label className="text-xs font-medium text-gray-600 block mb-1">Localitate</label>
                <select value={form.city} onChange={(e) => set('city', e.target.value)} disabled={!form.county} className={ic + ' disabled:bg-gray-50 disabled:text-gray-400'}>
                  <option value="">— Oriunde —</option>
                  {cities.map((ct) => <option key={ct} value={ct}>{ct}</option>)}
                </select></div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div><label className="text-xs font-medium text-gray-600 block mb-1">Buget min</label>
                <input type="number" value={form.budget_min} onChange={(e) => set('budget_min', e.target.value)} className={ic} placeholder="0" /></div>
              <div><label className="text-xs font-medium text-gray-600 block mb-1">Buget max</label>
                <input type="number" value={form.budget_max} onChange={(e) => set('budget_max', e.target.value)} className={ic} placeholder="∞" /></div>
              <div><label className="text-xs font-medium text-gray-600 block mb-1">Monedă</label>
                <select value={form.currency} onChange={(e) => set('currency', e.target.value)} className={ic}><option>EUR</option><option>RON</option></select></div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div><label className="text-xs font-medium text-gray-600 block mb-1">Camere (min–max)</label>
                <div className="flex gap-2">
                  <input type="number" value={form.nr_camere_min} onChange={(e) => set('nr_camere_min', e.target.value)} className={ic} placeholder="min" />
                  <input type="number" value={form.nr_camere_max} onChange={(e) => set('nr_camere_max', e.target.value)} className={ic} placeholder="max" />
                </div></div>
              <div><label className="text-xs font-medium text-gray-600 block mb-1">Suprafață (min–max)</label>
                <div className="flex gap-2">
                  <input type="number" value={form.suprafata_min} onChange={(e) => set('suprafata_min', e.target.value)} className={ic} placeholder="min" />
                  <input type="number" value={form.suprafata_max} onChange={(e) => set('suprafata_max', e.target.value)} className={ic} placeholder="max" />
                </div></div>
            </div>
          </div>

          <div><label className="text-xs font-medium text-gray-600 block mb-1">Mesaj / observații</label>
            <textarea value={form.message} onChange={(e) => set('message', e.target.value)} rows={2} className={ic} /></div>

          {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        </div>
        <div className="px-5 pb-5 pt-2 flex gap-2 justify-end border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Anulare</button>
          <button onClick={save} disabled={saving} className="px-5 py-2 text-sm text-white rounded-lg disabled:opacity-50" style={{ backgroundColor: '#0E6B54' }}>
            {saving ? 'Se salvează...' : isEdit ? 'Salvează' : 'Adaugă client'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── History modal
function HistoryModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const [events, setEvents] = useState<{ type: string; title?: string; description: string; created_at: string }[] | null>(null);
  const [receivedAt, setReceivedAt] = useState<string>('');
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/leads/history?id=${client.id}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const d = await res.json();
      setEvents(d.events || []); setReceivedAt(d.received_at || client.received_at);
    })();
  }, [client.id, client.received_at]);

  const fmt = (s: string) => new Date(s).toLocaleString('ro-RO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="mobile-dialog-backdrop fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="mobile-dialog-panel bg-white rounded-xl w-full max-w-md shadow-2xl max-h-[85vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div><h3 className="font-bold text-gray-900">Istoric client</h3><p className="text-xs text-gray-500">{client.contact_name}</p></div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
        </div>
        <div className="p-5 overflow-y-auto">
          {events === null ? (
            <div className="text-center py-8 text-gray-400"><Loader2 className="animate-spin mx-auto mb-2" size={24} />Se încarcă...</div>
          ) : (
            <ol className="relative border-l-2 border-gray-100 ml-2 space-y-4">
              {events.map((e, i) => (
                <li key={i} className="ml-4">
                  <span className="absolute -left-[7px] w-3 h-3 rounded-full bg-emerald-500" />
                  <p className="text-sm font-medium text-gray-800">{e.title || e.type}</p>
                  {e.description && <p className="text-sm text-gray-600">{e.description}</p>}
                  <p className="text-xs text-gray-400">{fmt(e.created_at)}</p>
                </li>
              ))}
              <li className="ml-4">
                <span className="absolute -left-[7px] w-3 h-3 rounded-full bg-gray-300" />
                <p className="text-sm text-gray-800">Lead primit</p>
                <p className="text-xs text-gray-400">{receivedAt ? fmt(receivedAt) : ''}</p>
              </li>
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── Match modal
function MatchModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const [matches, setMatches] = useState<PropertyMatch[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch(`/api/leads/match?client_id=${client.id}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        setMatches(d.matches || []);
      } catch (e) { setError(e instanceof Error ? e.message : 'Eroare'); }
    })();
  }, [client.id]);
  const scoreColor = (s: number) => s >= 80 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : s >= 55 ? 'text-yellow-700 bg-yellow-50 border-yellow-200' : 'text-gray-600 bg-gray-50 border-gray-200';

  return (
    <div className="mobile-dialog-backdrop fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="mobile-dialog-panel bg-white rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div><h3 className="font-bold text-gray-900">Proprietăți potrivite</h3><p className="text-xs text-gray-500">{client.contact_name}</p></div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-sm">{error}</div>}
          {matches === null && !error && <div className="text-center py-8 text-gray-400"><Target size={28} className="mx-auto mb-2 animate-pulse" />Caut proprietăți...</div>}
          {matches !== null && matches.length === 0 && <div className="text-center py-8 text-gray-400"><Target size={28} className="mx-auto mb-2" />Nicio proprietate cu scor ≥ 30%. Completează criteriile clientului.</div>}
          {matches?.map((m) => (
            <a key={m.id} href={`/properties/${m.id}`} target="_blank" rel="noreferrer" className={`block rounded-xl border p-4 ${scoreColor(m.score)}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1"><span className="text-2xl font-black">{m.score}%</span><span className="text-xs opacity-75">compatibilitate</span></div>
                  <p className="font-semibold text-gray-900 text-sm truncate">{m.title}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{[m.city, m.county].filter(Boolean).join(', ')} — {(m.price ?? 0).toLocaleString('ro-RO')} {m.currency || 'EUR'}</p>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {m.attributes?.photos?.[0] && <img src={m.attributes.photos[0]} alt="" className="w-20 h-16 object-cover rounded-lg flex-shrink-0" />}
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── Note modal
function NoteModal({ client, onClose, onSaved }: { client: Client; onClose: () => void; onSaved: () => void }) {
  const [note, setNote] = useState(''); const [saving, setSaving] = useState(false); const [err, setErr] = useState('');
  const save = async () => {
    if (!note.trim()) return;
    setSaving(true); setErr('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Neautentificat');
      const res = await fetch('/api/leads/note', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ lead_id: client.id, note }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      onSaved(); onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Eroare'); } finally { setSaving(false); }
  };
  return (
    <div className="mobile-dialog-backdrop fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="mobile-dialog-panel bg-white rounded-xl w-full max-w-md shadow-2xl">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Adaugă notiță</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-3">
          <textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} rows={4} className={ic} placeholder="ex: Sunat, revine cu răspuns luni..." />
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="px-5 pb-5 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Anulare</button>
          <button onClick={save} disabled={saving || !note.trim()} className="px-5 py-2 text-sm text-white rounded-lg disabled:opacity-50" style={{ backgroundColor: '#0E6B54' }}>{saving ? 'Se salvează...' : 'Salvează'}</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── Page
export default function ClientsPage() {
  const { user, role } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [agents, setAgents] = useState<{ id: string; email: string }[]>([]);
  const agentNames = useMemo(() => Object.fromEntries(agents.map((a) => [a.id, a.email])), [agents]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [tab, setTab] = useState('noi');
  const [search, setSearch] = useState('');
  const [fCity, setFCity] = useState('');
  const [fCategory, setFCategory] = useState('');
  const [fSource, setFSource] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fContactSla, setFContactSla] = useState('');
  const [onlyMine, setOnlyMine] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAgent, setBulkAgent] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  // modals
  const [addOpen, setAddOpen] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [historyClient, setHistoryClient] = useState<Client | null>(null);
  const [matchClient, setMatchClient] = useState<Client | null>(null);
  const [noteClient, setNoteClient] = useState<Client | null>(null);
  const [replyClient, setReplyClient] = useState<Client | null>(null);
  const [contactClient, setContactClient] = useState<Client | null>(null);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [linkClient, setLinkClient] = useState<Client | null>(null);
  const [propertyOptions, setPropertyOptions] = useState<PropertyOption[]>([]);
  const [propertySearch, setPropertySearch] = useState('');
  const [propertyLinkLoading, setPropertyLinkLoading] = useState(false);
  const [propertyLinkError, setPropertyLinkError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (role === 'owner' || role === 'admin') setOnlyMine(false);
      if (role === 'agent') setOnlyMine(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [role]);

  const fetchClients = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Sesiune expirată'); return; }
      const res = await fetch('/api/leads/list', { headers: { Authorization: `Bearer ${session.access_token}` } });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setClients(d.leads || []);
    } catch { setError('Nu am putut încărca clienții'); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchClients(); }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchClients]);
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      fetch('/api/agents/list', { headers: { Authorization: `Bearer ${session.access_token}` } })
        .then((r) => r.json()).then((d) => setAgents(d.agents || [])).catch(() => {});
    });
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const requestedSla = new URLSearchParams(window.location.search).get('contact_sla');
      if (requestedSla) setFContactSla(requestedSla);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => setSelected(new Set()), 0);
    return () => window.clearTimeout(timer);
  }, [tab, search, fCity, fCategory, fSource, fStatus, fContactSla, onlyMine, selectedAgent]);

  // distinct cities for filter
  const cities = useMemo(() => [...new Set(clients.map((c) => c.city).filter(Boolean))].sort() as string[], [clients]);

  // agent scope + text/field filters (before tab)
  const scoped = useMemo(() => clients.filter((c) => {
    if (onlyMine && user?.id) { if (c.agent_id !== user.id) return false; }
    else if (!onlyMine && selectedAgent === '__none__') {
      if (c.responsible_agent_id || c.agent_id) return false;
    } else if (!onlyMine && selectedAgent) { if (c.agent_id !== selectedAgent) return false; }
    if (fCity && c.city !== fCity) return false;
    if (fCategory && c.category !== fCategory) return false;
    if (fSource && (c.source_normalized || normalizeLeadSource(c.source) || '') !== fSource) return false;
    if (fContactSla === 'overdue' && c.contact_sla_status !== 'overdue') return false;
    if (fContactSla === 'pending' && c.contact_sla_status !== 'pending') return false;
    if (fContactSla === 'due_today') {
      if (!c.first_contact_due_at || c.first_successful_contact_at) return false;
      const dueDay = new Date(c.first_contact_due_at).toLocaleDateString('en-CA', { timeZone: 'Europe/Bucharest' });
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Bucharest' });
      if (dueDay !== today) return false;
    }
    if (fContactSla === 'missing_description' && c.last_contact_description) return false;
    if (fContactSla === 'missing_next_action' && c.next_action_at) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const hay = `${c.contact_name || ''} ${c.contact_phone || ''} ${c.contact_email || ''} ${c.message || ''} ${c.property_code || ''} ${c.property_title || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [clients, onlyMine, selectedAgent, user, fCity, fCategory, fSource, fContactSla, search]);

  const inTab = (c: Client, key: string) => {
    const stages = LEAD_PIPELINE_TAB_GROUPS[key as keyof typeof LEAD_PIPELINE_TAB_GROUPS];
    if (!stages) return true;
    return stages.includes(pipelineStage(c.pipeline_stage, c.status));
  };
  const tabCount = (key: string) => scoped.filter((c) => inTab(c, key)).length;

  const visible = useMemo(() => scoped.filter((c) => (
    inTab(c, tab) && (!fStatus || pipelineStage(c.pipeline_stage, c.status) === fStatus)
  )), [scoped, tab, fStatus]);

  const scheduleViewing = (c: Client) => { setViewingClient(c); setMenuOpen(null); };
  const remove = async (id: string) => {
    if (!confirm('Ștergi acest client din CRM?')) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch(`/api/leads/delete?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` } });
    if (res.ok) setClients((prev) => prev.filter((c) => c.id !== id));
  };

  const allSelected = visible.length > 0 && visible.every((c) => selected.has(c.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(visible.map((c) => c.id)));
  const toggleOne = (id: string) => setSelected((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const applyBulkAgent = async () => {
    if (selected.size === 0 || !bulkAgent) return;
    setBulkLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const agentId = bulkAgent === '__none__' ? null : bulkAgent;
      await Promise.all(Array.from(selected).map((id) =>
        fetch('/api/leads/update', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ id, agent_id: agentId }) })));
      setSelected(new Set()); setBulkAgent('');
      await fetchClients();
    } finally { setBulkLoading(false); }
  };

  const loadPropertyOptions = useCallback(async () => {
    if (propertyOptions.length) return;
    setPropertyLinkLoading(true);
    setPropertyLinkError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/properties/list', { headers: { Authorization: `Bearer ${session.access_token}` } });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Nu am putut incarca proprietatile');
      setPropertyOptions(d.properties || []);
    } catch (e) {
      setPropertyLinkError(e instanceof Error ? e.message : 'Nu am putut incarca proprietatile');
    } finally {
      setPropertyLinkLoading(false);
    }
  }, [propertyOptions.length]);

  const openLinkProperty = (client: Client) => {
    setLinkClient(client);
    setPropertySearch('');
    setPropertyLinkError('');
    void loadPropertyOptions();
  };

  const linkPropertyToClient = async (property: PropertyOption) => {
    if (!linkClient) return;
    setPropertyLinkLoading(true);
    setPropertyLinkError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/leads/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ id: linkClient.id, property_id: property.id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Nu am putut lega proprietatea');
      setLinkClient(null);
      await fetchClients();
    } catch (e) {
      setPropertyLinkError(e instanceof Error ? e.message : 'Nu am putut lega proprietatea');
    } finally {
      setPropertyLinkLoading(false);
    }
  };

  const filteredPropertyOptions = useMemo(() => {
    const q = propertySearch.trim().toLowerCase();
    const rows = q
      ? propertyOptions.filter((p) => `${p.internal_code || ''} ${p.title || ''} ${p.city || ''} ${p.category || ''}`.toLowerCase().includes(q))
      : propertyOptions;
    return rows.slice(0, 30);
  }, [propertyOptions, propertySearch]);

  return (
    <ProtectedLayout module="leads">
      <div className="p-4 sm:p-6 max-w-7xl mx-auto" onClick={() => menuOpen && setMenuOpen(null)}>
        {/* Header */}
        <div className="flex flex-col justify-between items-start gap-4 mb-5 sm:flex-row sm:items-center">
          <div><h1 className="text-3xl font-bold" style={{ color: '#0E6B54' }}>Clienți</h1>
            <p className="text-sm text-gray-500 mt-1">{clients.length} clienți</p></div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Link href="/pipeline" className="mobile-touch-target flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 sm:flex-none sm:px-4"><Target size={17} />Pipeline operațional</Link>
            <Link href="/matches" className="mobile-touch-target flex flex-1 items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 sm:flex-none sm:px-4"><Target size={17} />Cereri și potriviri</Link>
            {(role === 'owner' || role === 'admin' || role === 'manager') && <Link href="/clients/duplicates" className="mobile-touch-target flex flex-1 items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-100 sm:flex-none sm:px-4"><History size={17} />Verifică duplicate</Link>}
            <button onClick={() => setAddOpen(true)} className="mobile-touch-target flex flex-1 items-center justify-center gap-2 px-3 py-2.5 rounded-lg font-medium text-white hover:opacity-90 sm:flex-none sm:px-4" style={{ backgroundColor: '#0E6B54' }}>
              <Plus size={18} /> Adaugă client
            </button>
          </div>
        </div>

        <UnmatchedStoriaMessages onResolved={fetchClients} />

        {/* Tabs */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {CLIENT_TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium border transition-colors ${tab === t.key ? 'border-emerald-600 text-emerald-700 bg-emerald-50' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {t.label} <span className={`ml-1 text-xs ${tab === t.key ? 'text-emerald-600' : 'text-gray-400'}`}>{tabCount(t.key)}</span>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative min-w-0 flex-[1_1_220px]">
              <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Caută după nume, telefon, email, mesaj..." className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <select value={fCity} onChange={(e) => setFCity(e.target.value)} className="min-w-0 flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm sm:flex-none"><option value="">Toate orașele</option>{cities.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <select value={fCategory} onChange={(e) => setFCategory(e.target.value)} className="min-w-0 flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm sm:flex-none"><option value="">Toate categoriile</option>{CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABEL(c)}</option>)}</select>
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="min-w-0 flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm sm:flex-none"><option value="">Toate etapele pipeline</option>{LEAD_PIPELINE_STAGES.map((stage) => <option key={stage.code} value={stage.code}>{stage.label}</option>)}</select>
            <select value={fContactSla} onChange={(e) => setFContactSla(e.target.value)} className="min-w-0 flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm sm:flex-none">
              <option value="">Toate termenele de contact</option>
              <option value="pending">De contactat în 24h</option>
              <option value="due_today">Expiră astăzi</option>
              <option value="overdue">Contact întârziat</option>
              <option value="missing_description">Fără descriere</option>
              <option value="missing_next_action">Fără următoarea acțiune</option>
            </select>
            <button onClick={() => setShowFilters((s) => !s)} className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"><Filter size={14} /> Filtre <ChevronDown size={14} /></button>
          </div>
          {showFilters && (
            <div className="flex flex-wrap gap-3 items-center pt-2 border-t border-gray-100">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" /> Doar clienții mei
              </label>
              <select value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)} disabled={onlyMine} className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:text-gray-400">
                <option value="">Toți agenții</option>
                <option value="__none__">De alocat de owner</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.email}{a.id === user?.id ? ' (eu)' : ''}</option>)}
              </select>
              <select value={fSource} onChange={(e) => setFSource(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm"><option value="">Toate sursele</option>{SOURCES.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}</select>
              {(search || fCity || fCategory || fSource || fStatus || fContactSla || !onlyMine) && (
                <button onClick={() => { setSearch(''); setFCity(''); setFCategory(''); setFSource(''); setFStatus(''); setFContactSla(''); setOnlyMine(true); setSelectedAgent(''); }} className="text-sm text-gray-500 underline">Reset</button>
              )}
            </div>
          )}
        </div>

        {/* Bulk bar */}
        {visible.length > 0 && (
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" /> Selectează tot ({visible.length})
            </label>
            {selected.size > 0 && (
              <div className="flex items-center gap-2 flex-wrap bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                <span className="text-sm font-medium text-emerald-800">{selected.size} selectați</span>
                <select value={bulkAgent} onChange={(e) => setBulkAgent(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
                  <option value="">— Alege agent —</option><option value="__none__">Fără agent</option>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
                </select>
                <button onClick={applyBulkAgent} disabled={!bulkAgent || bulkLoading} className="px-4 py-1.5 text-sm font-semibold text-white rounded-lg disabled:opacity-50" style={{ backgroundColor: '#0E6B54' }}>{bulkLoading ? 'Se atribuie...' : 'Atribuie'}</button>
              </div>
            )}
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}</div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3"><p className="text-red-800">{error}</p><button onClick={fetchClients} className="ml-auto text-sm underline text-red-600">Reîncearcă</button></div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16"><User size={40} className="mx-auto text-gray-300 mb-3" /><p className="text-gray-500 font-medium">Niciun client în această listă</p></div>
        ) : (
          <div className="space-y-2.5">
            {visible.map((c) => {
              const normalizedSource = c.source_normalized || normalizeLeadSource(c.source);
              const parsed = parseLeadMessage(c.message, leadSourceLabel(normalizedSource));
              const responsibleAgentId = c.responsible_agent_id || c.agent_id;
              const agentName = responsibleAgentId ? (agentNames[responsibleAgentId] || '') : '';
              const operationalStage = pipelineMeta(c.pipeline_stage, c.status);
              const sla = contactSlaMeta(c);
              return (
                <div key={c.id} className="bg-white rounded-xl border border-gray-200 hover:border-emerald-300 transition-colors p-4">
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} className="mt-3 w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 flex-shrink-0" />
                    <Avatar name={c.contact_name} />
                    <div className="flex-1 min-w-0">
                      {/* Row 1 */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {c.contact_id ? <Link href={`/clients/${c.contact_id}`} className="font-semibold text-gray-900 hover:text-emerald-700 hover:underline">{c.contact_name}</Link> : <span className="font-semibold text-gray-900">{c.contact_name}</span>}
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${operationalStage.color}`}>{operationalStage.label}</span>
                            <span title="Status istoric păstrat" className={`text-[10px] font-medium px-2 py-0.5 rounded-full opacity-70 ${statusColor(c.status)}`}>{statusLabel(c.status)}</span>
                            {(c.lead_count || 0) > 1 && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{c.lead_count} leaduri</span>}
                            {(c.demand_count || 0) > 0 && <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">{c.demand_count} cereri</span>}
                            {c.lead_assignment_status === 'pending_owner' && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">De alocat de owner</span>}
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sla.color}`}>{sla.label}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500 mt-1 flex-wrap">
                            {c.contact_phone && <span className="flex items-center gap-1"><Phone size={12} />{c.contact_phone}</span>}
                            {c.contact_email && <span className="flex items-center gap-1"><Mail size={12} />{c.contact_email}</span>}
                          </div>
                        </div>
                        <span className="text-xs text-gray-400 flex items-center gap-1 flex-shrink-0"><Clock size={11} />{relativeTime(c.first_response_at || c.received_at)}</span>
                      </div>

                      {/* Row 2: meta chips */}
                      <div className="flex items-center gap-2 mt-2 flex-wrap text-xs">
                        {c.city && <span className="flex items-center gap-1 text-gray-600"><MapPin size={11} className="text-emerald-600" />{c.city}</span>}
                        {c.category && <span className="flex items-center gap-1 text-gray-600 capitalize"><Tag size={11} />{CAT_LABEL(c.category)}</span>}
                        {parsed.source && <span className="flex items-center gap-1 text-gray-500"><Globe size={11} />{parsed.source}</span>}
                        {agentName && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium"><User size={11} />{agentName}</span>}
                      </div>

                      {c.property_id && c.property_title ? (
                        <div className="mt-3 flex max-w-2xl overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/70">
                          <Link
                            href={`/properties/${c.property_id}`}
                            title="Deschide proprietatea în CRM"
                            className="h-24 w-28 flex-shrink-0 bg-slate-200 bg-cover bg-center"
                            style={c.property_main_photo_url ? { backgroundImage: `url("${c.property_main_photo_url}")` } : undefined}
                            aria-label={`Deschide ${c.property_title}`}
                          />
                          <div className="min-w-0 flex-1 p-3">
                            <Link href={`/properties/${c.property_id}`} className="block truncate text-sm font-semibold text-emerald-900 hover:underline">
                              {c.property_title}
                            </Link>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
                              {(c.property_public_code || c.property_code) && <span>Cod: {c.property_public_code || c.property_code}</span>}
                              {c.property_price != null && <span className="font-semibold text-gray-800">{Number(c.property_price).toLocaleString('ro-RO')} {c.property_currency || 'EUR'}</span>}
                              {c.city && <span>{c.city}</span>}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-semibold">
                              <Link href={`/properties/${c.property_id}`} className="text-emerald-800 hover:underline">Deschide în CRM</Link>
                              {c.property_public_url && (
                                <a href={c.property_public_url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                                  Vezi pe kiraimobiliare.ro
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : ['storia', 'olx', 'storia_olx'].includes(normalizedSource || '') ? (
                        <button
                          onClick={() => openLinkProperty(c)}
                          className="mt-2 inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:border-amber-400 hover:bg-amber-100"
                        >
                          🏠 Proprietate neidentificată · Leagă proprietatea
                        </button>
                      ) : null}

                      {parsed.text && <p className="text-sm text-gray-600 mt-2 line-clamp-2">{parsed.text}</p>}

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-gray-100 flex-wrap">
                        <a href={`tel:${c.contact_phone}`} title="Sună" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-emerald-700"><Phone size={16} /></a>
                        <button onClick={() => setReplyClient(c)} title="WhatsApp" className="p-1.5 rounded-lg text-gray-500 hover:bg-green-50 hover:text-green-600"><MessageCircle size={16} /></button>
                        {c.contact_email && <a href={`mailto:${c.contact_email}`} title="Email" className="p-1.5 rounded-lg text-gray-500 hover:bg-blue-50 hover:text-blue-600"><Mail size={16} /></a>}
                        <button onClick={() => setReplyClient(c)} title="Răspunde" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"><Send size={16} /></button>
                        <button onClick={() => setContactClient(c)} title="Înregistrează conversația" className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"><MessageSquareText size={15} />Înregistrează</button>
                        <PipelineStageControl
                          lead={c}
                          compact
                          onChanged={(stage, changedAt) => setClients((current) => current.map((client) => client.id === c.id
                            ? { ...client, pipeline_stage: stage, pipeline_stage_changed_at: changedAt || new Date().toISOString() }
                            : client))}
                        />
                        <button onClick={() => setEditClient(c)} title="Editează" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"><Pencil size={16} /></button>
                        <div className="relative ml-auto">
                          <button onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === c.id ? null : c.id); }} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"><MoreVertical size={16} /></button>
                          {menuOpen === c.id && (
                            <div className="absolute right-0 top-9 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-52 text-sm" onClick={(e) => e.stopPropagation()}>
                              <button onClick={() => { setNoteClient(c); setMenuOpen(null); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"><StickyNote size={14} /> Adaugă notiță</button>
                              <button onClick={() => scheduleViewing(c)} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"><CalendarPlus size={14} /> Programează vizionare</button>
                              <button onClick={() => { setMatchClient(c); setMenuOpen(null); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"><Target size={14} /> Proprietăți potrivite</button>
                              <button onClick={() => { setHistoryClient(c); setMenuOpen(null); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"><History size={14} /> Vezi istoric</button>
                              {c.contact_id && <Link href={`/clients/${c.contact_id}`} className="w-full px-3 py-2 hover:bg-emerald-50 text-emerald-800 flex items-center gap-2"><User size={14} /> Profil complet</Link>}
                              <button onClick={() => { remove(c.id); setMenuOpen(null); }} className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 flex items-center gap-2"><Trash2 size={14} /> Șterge</button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {addOpen && <ClientDialog client={null} agents={agents} onClose={() => setAddOpen(false)} onSaved={fetchClients} />}
      {editClient && <ClientDialog client={editClient} agents={agents} onClose={() => setEditClient(null)} onSaved={fetchClients} />}
      {historyClient && <HistoryModal client={historyClient} onClose={() => setHistoryClient(null)} />}
      {matchClient && <MatchModal client={matchClient} onClose={() => setMatchClient(null)} />}
      {noteClient && <NoteModal client={noteClient} onClose={() => setNoteClient(null)} onSaved={fetchClients} />}
      {linkClient && (
        <div className="mobile-dialog-backdrop fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="mobile-dialog-panel bg-white rounded-xl w-full max-w-2xl shadow-2xl max-h-[86vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">Leagă proprietatea</h3>
                <p className="text-xs text-gray-500">Client: {linkClient.contact_name}</p>
              </div>
              <button onClick={() => setLinkClient(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
                <input
                  value={propertySearch}
                  onChange={(e) => setPropertySearch(e.target.value)}
                  placeholder="Caută după cod, titlu, oraș..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  autoFocus
                />
              </div>
              {propertyLinkError && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{propertyLinkError}</div>}
              {propertyLinkLoading && propertyOptions.length === 0 ? (
                <div className="text-center py-8 text-gray-400"><Loader2 className="animate-spin mx-auto mb-2" size={24} />Se încarcă proprietățile...</div>
              ) : filteredPropertyOptions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">Nu am găsit proprietăți pentru căutarea asta.</div>
              ) : (
                <div className="space-y-2">
                  {filteredPropertyOptions.map((property) => (
                    <button
                      key={property.id}
                      onClick={() => linkPropertyToClient(property)}
                      disabled={propertyLinkLoading}
                      className="w-full text-left rounded-xl border border-gray-200 p-3 hover:border-emerald-400 hover:bg-emerald-50 disabled:opacity-60"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-gray-900 truncate">
                            {property.internal_code ? `${property.internal_code} · ` : ''}{property.title || 'Proprietate fără titlu'}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {[property.city, property.category ? CAT_LABEL(property.category) : null].filter(Boolean).join(' · ') || 'Fără localitate'}
                          </p>
                        </div>
                        {typeof property.price === 'number' && (
                          <span className="text-xs font-semibold text-emerald-700 flex-shrink-0">
                            {property.price.toLocaleString('ro-RO')} {property.currency || 'EUR'}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <ReplyLeadDialog
        lead={replyClient ? {
          id: replyClient.id,
          property_id: replyClient.property_id,
          contact_name: replyClient.contact_name,
          contact_phone: replyClient.contact_phone,
          message: parseLeadMessage(replyClient.message, replyClient.source).text || replyClient.message || '',
          property_title: replyClient.property_title,
          property_public_url: replyClient.property_public_url,
        } : null}
        isOpen={!!replyClient}
        onClose={() => setReplyClient(null)}
        onSuccess={fetchClients}
      />
      <RecordContactDialog
        lead={contactClient}
        isOpen={Boolean(contactClient)}
        onClose={() => setContactClient(null)}
        onSuccess={fetchClients}
      />
      {viewingClient && (
        <ScheduleViewingDialog
          lead={viewingClient}
          onClose={() => setViewingClient(null)}
          onSuccess={fetchClients}
        />
      )}
    </ProtectedLayout>
  );
}
