'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { ReplyLeadDialog } from '@/components/ReplyLeadDialog';
import {
  MessageCircle, TrendingUp, Clock, Plus, X, Loader2,
  Phone, Mail, User, Filter, Search, Trash2, ArrowRightCircle,
} from 'lucide-react';

interface Lead {
  id: string;
  contact_name: string;
  contact_phone: string;
  contact_email?: string;
  message: string;
  property_title?: string;
  received_at: string;
  first_response_at?: string;
  status: 'new' | 'replied' | 'contacted' | 'in_progress' | 'won' | 'lost';
  source?: string;
  notes?: string;
}

const STATUS_LABELS: Record<string, string> = {
  new: 'Lead Nou', contacted: 'Contactat', viewing: 'Vizionare',
  negotiation: 'Negociere', precontract: 'Antecontract', won: 'Vândut', lost: 'Pierdut',
  // legacy (lead-uri vechi)
  replied: 'Răspuns trimis', in_progress: 'În lucru',
};
const STATUS_COLORS: Record<string, string> = {
  new: 'bg-amber-100 text-amber-800', contacted: 'bg-blue-100 text-blue-800',
  viewing: 'bg-cyan-100 text-cyan-800', negotiation: 'bg-purple-100 text-purple-800',
  precontract: 'bg-indigo-100 text-indigo-800', won: 'bg-green-100 text-green-800',
  lost: 'bg-red-100 text-red-700',
  replied: 'bg-blue-100 text-blue-800', in_progress: 'bg-purple-100 text-purple-800',
};
// Coloanele kanban (în ordine). 'lost' rămâne disponibil în dropdown, dar nu are coloană.
const STATUS_PIPELINE = ['new', 'contacted', 'viewing', 'negotiation', 'precontract', 'won'];
const SOURCES = ['Facebook', 'OLX', 'Storia', 'Imobiliare.ro', 'Site propriu', 'Recomandare', 'Manual', 'Altul'];
const ic = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900 text-sm';

function AddLeadDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ contact_name: '', contact_phone: '', contact_email: '', message: '', source: 'Manual', agent_id: '' });
  const [agents, setAgents] = useState<{ id: string; email: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      fetch('/api/agents/list', { headers: { Authorization: `Bearer ${session.access_token}` } })
        .then(r => r.json()).then(d => setAgents(d.agents || []));
    });
  }, []);

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.contact_name.trim()) { setError('Numele este obligatoriu'); return; }
    if (!form.contact_phone.trim()) { setError('Telefonul este obligatoriu'); return; }
    try {
      setSaving(true); setError('');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sesiune expirată');
      const res = await fetch('/api/leads/create', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Lead nou</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">{error}</div>}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Nume contact *</label>
            <div className="relative"><User size={16} className="absolute left-3 top-2.5 text-gray-400" />
              <input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} className={ic + ' pl-9'} placeholder="Ion Popescu" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Telefon *</label>
            <div className="relative"><Phone size={16} className="absolute left-3 top-2.5 text-gray-400" />
              <input value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} className={ic + ' pl-9'} placeholder="07xx xxx xxx" type="tel" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Email</label>
            <div className="relative"><Mail size={16} className="absolute left-3 top-2.5 text-gray-400" />
              <input value={form.contact_email} onChange={e => set('contact_email', e.target.value)} className={ic + ' pl-9'} placeholder="email@exemplu.ro" type="email" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Mesaj / Solicitare</label>
            <textarea value={form.message} onChange={e => set('message', e.target.value)} className={ic} rows={3} placeholder="Clientul este interesat de..." />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Sursă</label>
            <select value={form.source} onChange={e => set('source', e.target.value)} className={ic}>
              {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Agent responsabil</label>
            <select value={form.agent_id} onChange={e => set('agent_id', e.target.value)} className={ic}>
              <option value="">— Neasignat —</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.email}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: '#0E6B54' }}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {saving ? 'Se salvează...' : 'Adaugă lead'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Anulare</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isReplyOpen, setIsReplyOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [view, setView] = useState<'list' | 'pipeline'>('list');
  const [dragLeadId, setDragLeadId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const handleDropOnColumn = (status: string) => {
    if (dragLeadId) {
      const lead = leads.find(l => l.id === dragLeadId);
      if (lead && lead.status !== status) handleStatusChange(dragLeadId, status);
    }
    setDragLeadId(null);
    setDragOverCol(null);
  };

  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Sesiune expirată'); return; }
      const res = await fetch('/api/leads/list', { headers: { Authorization: `Bearer ${session.access_token}` } });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setLeads(d.leads || []);
    } catch {
      setError('Nu am putut încărca lead-urile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const handleDelete = async (id: string) => {
    if (!confirm('Ștergi acest lead?')) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch(`/api/leads/delete?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` } });
    if (res.ok) setLeads(prev => prev.filter(l => l.id !== id));
  };

  const handleConvertToDemand = async (lead: Lead) => {
    if (!confirm(`Convertești lead-ul "${lead.contact_name}" în cerere? Se vor crea automat un contact și o cerere activă.`)) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const auth = { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
    try {
      // 1) Creează un contact din datele lead-ului (intră în baza de Contacte)
      let contactId: string | null = null;
      try {
        const cRes = await fetch('/api/contacts', {
          method: 'POST', headers: auth,
          body: JSON.stringify({
            name: lead.contact_name,
            phone: lead.contact_phone || '',
            email: lead.contact_email || '',
            type: 'cumparator',
            notes: lead.message || '',
          }),
        });
        if (cRes.ok) { const cd = await cRes.json(); contactId = cd.contact?.id || null; }
      } catch { /* dacă pică crearea contactului, continuăm fără el */ }

      // 2) Creează cererea — datele MERG în `criteria` (forma așteptată de API),
      //    păstrăm mesajul lead-ului și legăm contactul.
      const res = await fetch('/api/demands/create', {
        method: 'POST', headers: auth,
        body: JSON.stringify({
          category: 'apartament',
          criteria: {
            tip_tranzactie: 'vanzare',
            source: lead.source || 'lead',
            notes: [lead.message, lead.contact_phone ? `Tel: ${lead.contact_phone}` : ''].filter(Boolean).join(' | '),
            contact_id: contactId,
          },
        }),
      });
      if (res.ok) {
        handleStatusChange(lead.id, 'contacted');
        alert('Contact + cerere create cu succes! Completează detaliile din modulul Cereri & Potriviri.');
      } else {
        const d = await res.json();
        alert('Eroare: ' + (d.error || 'Necunoscut'));
      }
    } catch {
      alert('Eroare la creare cerere');
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/leads/update', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) setLeads(prev => prev.map(l => l.id === id ? { ...l, status: status as Lead['status'] } : l));
  };

  const newLeads = leads.filter(l => l.status === 'new').length;
  const wonLeads = leads.filter(l => l.status === 'won').length;
  const respondedLeads = leads.filter(l => l.first_response_at);
  const avgResponseTime = respondedLeads.length > 0
    ? Math.round(respondedLeads.reduce((sum, l) =>
        sum + (new Date(l.first_response_at!).getTime() - new Date(l.received_at).getTime()) / 60000, 0) / respondedLeads.length)
    : 0;

  const filtered = leads.filter(l => {
    if (filterStatus && l.status !== filterStatus) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      return l.contact_name?.toLowerCase().includes(q) || l.contact_phone?.toLowerCase().includes(q) ||
        l.message?.toLowerCase().includes(q) || l.property_title?.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <ProtectedLayout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: '#0E6B54' }}>Lead-uri</h1>
            <p className="text-sm text-gray-500 mt-1">{leads.length} lead-uri totale</p>
          </div>
          <div className="flex gap-2">
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button onClick={() => setView('list')} className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${view === 'list' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>Listă</button>
              <button onClick={() => setView('pipeline')} className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${view === 'pipeline' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>Pipeline</button>
            </div>
            <button onClick={() => setIsAddOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white hover:opacity-90"
              style={{ backgroundColor: '#0E6B54' }}>
              <Plus size={18} />Adaugă lead
            </button>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Lead-uri noi', value: newLeads, color: 'text-amber-600', icon: <MessageCircle size={28} className="text-amber-200" /> },
            { label: 'Total', value: leads.length, color: 'text-gray-800', icon: <TrendingUp size={28} className="text-gray-200" /> },
            { label: 'Timp med. răspuns', value: `${avgResponseTime}m`, color: 'text-emerald-600', icon: <Clock size={28} className="text-emerald-200" /> },
            { label: 'Câștigate', value: wonLeads, color: 'text-green-600', icon: <TrendingUp size={28} className="text-green-200" /> },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-gray-500 text-xs">{s.label}</p><p className={`text-3xl font-bold mt-1 ${s.color}`}>{s.value}</p></div>
                {s.icon}
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Caută după nume, telefon, mesaj..." />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
            <option value="">Toate statusurile</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {(searchTerm || filterStatus) && (
            <button onClick={() => { setSearchTerm(''); setFilterStatus(''); }}
              className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              <Filter size={13} /> Reset
            </button>
          )}
          <span className="text-xs text-gray-400 ml-auto">{filtered.length} rezultate</span>
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}</div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
            <p className="text-red-800">{error}</p>
            <button onClick={fetchLeads} className="ml-auto text-sm underline text-red-600">Reîncearcă</button>
          </div>
        ) : view === 'pipeline' ? (
          <>
            <p className="text-xs text-gray-400 mb-3">Trage cardurile dintr-o coloană în alta pentru a schimba statusul.</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 overflow-x-auto pb-4">
              {STATUS_PIPELINE.map(st => {
                const col = leads.filter(l => l.status === st);
                const isOver = dragOverCol === st;
                return (
                  <div
                    key={st}
                    className="min-w-[155px]"
                    onDragOver={e => { e.preventDefault(); setDragOverCol(st); }}
                    onDragLeave={() => setDragOverCol(c => (c === st ? null : c))}
                    onDrop={e => { e.preventDefault(); handleDropOnColumn(st); }}
                  >
                    <div className="flex items-center justify-between mb-2 px-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[st]}`}>{STATUS_LABELS[st]}</span>
                      <span className="text-xs text-gray-400 font-bold">{col.length}</span>
                    </div>
                    <div className={`space-y-2 rounded-xl transition-colors min-h-[64px] ${isOver ? 'bg-emerald-50 ring-2 ring-emerald-300 ring-inset p-1' : ''}`}>
                      {col.length === 0 ? (
                        <div className="h-16 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center text-xs text-gray-300">
                          {isOver ? 'Plasează aici' : 'Gol'}
                        </div>
                      ) : col.map(lead => (
                        <div
                          key={lead.id}
                          draggable
                          onDragStart={() => setDragLeadId(lead.id)}
                          onDragEnd={() => { setDragLeadId(null); setDragOverCol(null); }}
                          className={`bg-white rounded-xl border border-gray-200 p-3 shadow-sm cursor-move transition-opacity ${dragLeadId === lead.id ? 'opacity-40' : 'hover:border-emerald-300'}`}
                        >
                          <p className="font-semibold text-gray-900 text-sm truncate">{lead.contact_name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{lead.contact_phone}</p>
                          {lead.property_title && <p className="text-xs text-emerald-700 mt-1 truncate">{lead.property_title}</p>}
                          <div className="flex gap-1 mt-2">
                            <select value={lead.status} onChange={e => handleStatusChange(lead.id, e.target.value)}
                              className="flex-1 text-xs border border-gray-200 rounded px-1 py-1 bg-white focus:outline-none">
                              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                            <button onClick={() => handleDelete(lead.id)} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <MessageCircle size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">{searchTerm || filterStatus ? 'Niciun lead găsit' : 'Nu ai lead-uri încă'}</p>
            <p className="text-sm text-gray-400 mt-1">Adaugă primul lead cu butonul de mai sus</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(lead => (
              <div key={lead.id}
                className="bg-white rounded-xl border border-gray-200 hover:border-emerald-300 transition-all p-4"
                style={{ borderLeftWidth: '4px', borderLeftColor: '#0E6B54' }}>
                {/* Row 1: name + badge | timestamp */}
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <p className="font-semibold text-gray-900">{lead.contact_name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[lead.status] || 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABELS[lead.status] || lead.status}
                    </span>
                    {lead.source && <span className="text-xs text-gray-400 flex-shrink-0">{lead.source}</span>}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-400 flex-shrink-0 mt-0.5">
                    <Clock size={12} />
                    {lead.first_response_at
                      ? `${Math.floor((new Date(lead.first_response_at).getTime() - new Date(lead.received_at).getTime()) / 60000)}m`
                      : `${Math.floor((Date.now() - new Date(lead.received_at).getTime()) / 60000)}m așteptare`}
                  </div>
                </div>
                {/* Row 2: contact info */}
                <div className="flex items-center gap-3 text-sm text-gray-500 mb-1">
                  <span className="flex items-center gap-1"><Phone size={12} />{lead.contact_phone}</span>
                  {lead.contact_email && <span className="flex items-center gap-1"><Mail size={12} />{lead.contact_email}</span>}
                </div>
                {lead.message && <p className="text-sm text-gray-700 mb-1 line-clamp-2">{lead.message}</p>}
                {lead.property_title && <p className="text-xs text-emerald-700 mb-2">Proprietate: {lead.property_title}</p>}
                {/* Row last: action buttons */}
                <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-gray-100">
                  <select value={lead.status} onChange={e => handleStatusChange(lead.id, e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500">
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <button onClick={() => { setSelectedLead(lead); setIsReplyOpen(true); }}
                    className="px-3 py-1.5 text-sm rounded-lg font-medium text-white hover:opacity-90"
                    style={{ backgroundColor: '#0E6B54' }}>
                    Răspunde
                  </button>
                  <button onClick={() => handleConvertToDemand(lead)}
                    className="px-3 py-1.5 text-sm rounded-lg font-medium border border-purple-300 text-purple-700 hover:bg-purple-50 flex items-center gap-1.5">
                    <ArrowRightCircle size={14} />
                    Cerere
                  </button>
                  <button onClick={() => handleDelete(lead.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg ml-auto">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {isAddOpen && <AddLeadDialog onClose={() => setIsAddOpen(false)} onSuccess={() => { setIsAddOpen(false); fetchLeads(); }} />}
        <ReplyLeadDialog
          lead={selectedLead}
          isOpen={isReplyOpen}
          onClose={() => { setIsReplyOpen(false); setSelectedLead(null); }}
          onSuccess={() => fetchLeads()}
        />
      </div>
    </ProtectedLayout>
  );
}
