'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import {
  Target, RefreshCw, Phone, ExternalLink, Trash2, Filter, StickyNote, MapPin, Loader2,
} from 'lucide-react';

interface Prospect {
  id: string;
  source: string;
  url: string;
  title?: string | null;
  price?: number | null;
  currency?: string | null;
  category?: string | null;
  transaction?: string | null;
  city?: string | null;
  zone?: string | null;
  phone?: string | null;
  seller_name?: string | null;
  posted_at?: string | null;
  status: string;
  notes?: string | null;
  last_seen_at: string;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  nou:       { label: 'Nou',       cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  contactat: { label: 'Contactat', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  refuzat:   { label: 'Refuzat',   cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  mandat:    { label: 'Mandat obținut', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};
const SOURCE_LABEL: Record<string, string> = { olx: 'OLX', publi24: 'Publi24', homezz: 'Homezz', romimo: 'Romimo' };
const CATEGORIES = [
  { v: '', l: 'Toate categoriile' }, { v: 'apartament', l: 'Apartamente' },
  { v: 'casa', l: 'Case / Vile' }, { v: 'teren', l: 'Terenuri' }, { v: 'comercial', l: 'Comercial' },
];

const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

export default function ProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState('');
  const [filters, setFilters] = useState({ status: '', source: '', category: '', city: '', q: '', phone: false });

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const t = await token();
      if (!t) return;
      const qs = new URLSearchParams();
      if (filters.status) qs.set('status', filters.status);
      if (filters.source) qs.set('source', filters.source);
      if (filters.category) qs.set('category', filters.category);
      if (filters.city) qs.set('city', filters.city);
      if (filters.q) qs.set('q', filters.q);
      if (filters.phone) qs.set('phone', '1');
      const res = await fetch('/api/prospects?' + qs.toString(), { headers: { Authorization: `Bearer ${t}` }, cache: 'no-store' });
      const d = await res.json();
      if (d.needsMigration) setNeedsMigration(true);
      setProspects(d.prospects || []);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / filter change
  useEffect(() => { load(); }, [load]);

  const refresh = async () => {
    setRefreshing(true); setRefreshMsg('');
    try {
      const t = await token();
      if (!t) return;
      const res = await fetch('/api/prospects/refresh', {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const d = await res.json();
      if (!res.ok) { setRefreshMsg(d.error || 'Eroare la actualizare'); return; }
      const parts = (d.results || []).map((r: { label: string; count: number; error?: string }) =>
        r.error ? `${r.label}: eroare (${r.error})` : `${r.label}: ${r.count}`
      );
      setRefreshMsg(`Actualizat — ${parts.join(' · ')}`);
      await load();
    } catch (e) {
      setRefreshMsg(e instanceof Error ? e.message : 'Eroare la actualizare');
    } finally {
      setRefreshing(false);
    }
  };

  const setStatus = async (p: Prospect, status: string) => {
    const t = await token(); if (!t) return;
    setProspects(prev => prev.map(x => x.id === p.id ? { ...x, status } : x));
    await fetch('/api/prospects', {
      method: 'PATCH', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, status }),
    });
  };

  const editNote = async (p: Prospect) => {
    const notes = window.prompt('Notiță pentru acest anunț:', p.notes || '');
    if (notes === null) return;
    const t = await token(); if (!t) return;
    setProspects(prev => prev.map(x => x.id === p.id ? { ...x, notes } : x));
    await fetch('/api/prospects', {
      method: 'PATCH', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, notes }),
    });
  };

  const remove = async (id: string) => {
    if (!confirm('Ștergi acest anunț din listă?')) return;
    const t = await token(); if (!t) return;
    const res = await fetch(`/api/prospects?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } });
    if (res.ok) setProspects(prev => prev.filter(x => x.id !== id));
  };

  const withPhone = prospects.filter(p => p.phone).length;

  return (
    <ProtectedLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2" style={{ color: '#0E6B54' }}>
              <Target size={28} /> Anunțuri particulari
            </h1>
            <p className="text-sm text-gray-500 mt-1">{prospects.length} anunțuri · {withPhone} cu telefon · județul Brașov, persoane fizice</p>
          </div>
          <button onClick={refresh} disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: '#0E6B54' }}>
            {refreshing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
            {refreshing ? 'Se actualizează...' : 'Actualizează'}
          </button>
        </div>

        {refreshMsg && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-800 mb-4">{refreshMsg}</div>}
        {needsMigration && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 mb-4">
            Tabela <code>prospects</code> lipsește — rulează <code>migrations/2026-prospects.sql</code> în Supabase.
          </div>
        )}

        {/* Filtre */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 mb-5 flex flex-wrap gap-3 items-center">
          <Filter size={15} className="text-gray-400" />
          <input value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} placeholder="Caută în titlu..."
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 flex-1 min-w-[160px]" />
          <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm">
            <option value="">Toate statusurile</option>
            {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm">
            {CATEGORIES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
          </select>
          <input value={filters.city} onChange={e => setFilters(f => ({ ...f, city: e.target.value }))} placeholder="Localitate"
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-32" />
          <label className="flex items-center gap-1.5 text-sm text-gray-600 select-none cursor-pointer">
            <input type="checkbox" checked={filters.phone} onChange={e => setFilters(f => ({ ...f, phone: e.target.checked }))} className="accent-emerald-600" />
            Doar cu telefon
          </label>
        </div>

        {loading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
        ) : prospects.length === 0 ? (
          <div className="text-center py-16">
            <Target size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">Niciun anunț încă</p>
            <p className="text-sm text-gray-400 mt-1">Apasă butonul de actualizare ca să aduci anunțurile de la particulari din Brașov.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {prospects.map(p => {
              const meta = STATUS_META[p.status] || STATUS_META.nou;
              return (
                <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-gray-900 hover:text-emerald-700 truncate max-w-[420px]">
                          {p.title || 'Anunț'}
                        </a>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-violet-50 text-violet-700 border-violet-200">{SOURCE_LABEL[p.source] || p.source}</span>
                        {p.category && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{p.category}</span>}
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${meta.cls}`}>{meta.label}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                        {typeof p.price === 'number' && <span className="font-bold text-gray-800">{p.price.toLocaleString('ro-RO')} {p.currency || 'EUR'}</span>}
                        <span className="flex items-center gap-1"><MapPin size={12} />{[p.city, p.zone].filter(Boolean).join(' · ') || 'Brașov'}</span>
                        {p.seller_name && <span>{p.seller_name}</span>}
                        {p.posted_at && <span>{fmtDate(p.posted_at)}</span>}
                      </div>
                      {p.notes && <p className="text-xs text-gray-500 mt-1 italic">📝 {p.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {p.phone ? (
                        <a href={`tel:${p.phone}`} className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"><Phone size={13} />{p.phone}</a>
                      ) : (
                        <a href={p.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"><ExternalLink size={13} />Vezi anunț</a>
                      )}
                      <select value={p.status} onChange={e => setStatus(p, e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500">
                        {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                      </select>
                      <button onClick={() => editNote(p)} className="p-1.5 text-gray-400 hover:text-amber-600" title="Notiță"><StickyNote size={15} /></button>
                      <button onClick={() => remove(p.id)} className="p-1.5 text-red-400 hover:text-red-600" title="Șterge"><Trash2 size={15} /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}
