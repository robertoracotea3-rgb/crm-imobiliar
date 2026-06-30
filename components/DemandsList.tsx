'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Trash2, MapPin, DollarSign, Target, Zap, X, Home, CheckCircle, AlertCircle, Info, XCircle, Pencil, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { JUDETE, ORASE_BY_JUDET } from '@/lib/romania-locations';

const SOURCE_LABEL: Record<string, string> = {
  facebook: 'Facebook',
  olx: 'OLX',
  storia: 'Storia',
  imobiliare: 'Imobiliare.ro',
  banner: 'Banner',
  site_propriu: 'Site propriu',
  recomandare: 'Recomandare',
  altul: 'Altul',
};

const SOURCE_COLOR: Record<string, string> = {
  facebook: 'bg-blue-100 text-blue-700',
  olx: 'bg-orange-100 text-orange-700',
  storia: 'bg-pink-100 text-pink-700',
  imobiliare: 'bg-yellow-100 text-yellow-800',
  banner: 'bg-purple-100 text-purple-700',
  site_propriu: 'bg-emerald-100 text-emerald-700',
  recomandare: 'bg-teal-100 text-teal-700',
  altul: 'bg-gray-100 text-gray-600',
};

interface Demand {
  id: string;
  internal_code: string;
  category: string;
  transaction?: string;
  source?: string;
  agent_id?: string;
  budget_min?: number;
  budget_max?: number;
  currency?: string;
  cities?: string[];
  counties?: string[];
  notes?: string;
  created_at: string;
  criteria?: {
    suprafata_min?: number;
    suprafata_max?: number;
    nr_camere_min?: number;
    nr_camere_max?: number;
    etaj_min?: number;
    etaj_max?: number;
    agent_id?: string;
    property_id?: string;
  };
}

interface Match {
  id: string;
  internal_code: string;
  title: string;
  city?: string;
  county?: string;
  price: number;
  currency?: string;
  category: string;
  score: number;
  details: Record<string, string>;
  attributes?: { photos?: string[] };
}

interface DemandsListProps {
  demands: Demand[];
  onDelete?: (id: string) => void;
  onStatusChange?: (id: string, status: string) => void;
  canDelete?: boolean;
  agentNames?: Record<string, string>;
}

function EditDemandModal({ demand, onClose, onSuccess }: {
  demand: Demand; onClose: () => void; onSuccess: (updated: Demand) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({
    category: demand.category || '',
    transaction: demand.transaction || 'vanzare',
    budget_min: demand.budget_min?.toString() || '',
    budget_max: demand.budget_max?.toString() || '',
    currency: demand.currency || 'EUR',
    county: demand.counties?.[0] || '',
    city: demand.cities?.[0] || '',
    nr_camere_min: demand.criteria?.nr_camere_min?.toString() || '',
    nr_camere_max: demand.criteria?.nr_camere_max?.toString() || '',
    suprafata_min: demand.criteria?.suprafata_min?.toString() || '',
    suprafata_max: demand.criteria?.suprafata_max?.toString() || '',
    notes: demand.notes || '',
    source: demand.source || '',
  });

  const cities = form.county ? (ORASE_BY_JUDET[form.county] || []) : [];
  const f = (name: string, value: string) => setForm(prev => ({ ...prev, [name]: value }));

  const handleSave = async () => {
    setSaving(true);
    setErr('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Neautentificat');
      const res = await fetch('/api/demands/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          id: demand.id,
          category: form.category,
          transaction: form.transaction,
          budget_min: form.budget_min ? +form.budget_min : null,
          budget_max: form.budget_max ? +form.budget_max : null,
          currency: form.currency,
          counties: form.county ? [form.county] : [],
          cities: form.city ? [form.city] : [],
          notes: form.notes,
          source: form.source,
          criteria: {
            ...(demand.criteria || {}),
            nr_camere_min: form.nr_camere_min ? +form.nr_camere_min : null,
            nr_camere_max: form.nr_camere_max ? +form.nr_camere_max : null,
            suprafata_min: form.suprafata_min ? +form.suprafata_min : null,
            suprafata_max: form.suprafata_max ? +form.suprafata_max : null,
          },
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Eroare la salvare');
      onSuccess(d.demand || { ...demand, ...form });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Eroare');
    } finally {
      setSaving(false);
    }
  };

  const ic = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm';

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-bold text-gray-900">Editează cererea</h3>
            <p className="text-xs text-gray-500 font-mono mt-0.5">{demand.internal_code}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Categorie</label>
              <select value={form.category} onChange={e => f('category', e.target.value)} className={ic}>
                {['apartament','casa_vila','teren','spatiu_comercial','birou','spatiu_industrial','pensiune_hotel','garaj'].map(c => (
                  <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Tip tranzacție</label>
              <select value={form.transaction} onChange={e => f('transaction', e.target.value)} className={ic}>
                <option value="vanzare">Cumpărare</option>
                <option value="inchiriere">Închiriere</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Buget min</label>
              <input type="number" value={form.budget_min} onChange={e => f('budget_min', e.target.value)} placeholder="0" className={ic} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Buget max</label>
              <input type="number" value={form.budget_max} onChange={e => f('budget_max', e.target.value)} placeholder="∞" className={ic} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Monedă</label>
              <select value={form.currency} onChange={e => f('currency', e.target.value)} className={ic}>
                <option>EUR</option><option>RON</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Județ</label>
              <select value={form.county} onChange={e => { f('county', e.target.value); f('city', ''); }} className={ic}>
                <option value="">— Oriunde —</option>
                {JUDETE.map(j => <option key={j} value={j}>{j}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Localitate</label>
              <select value={form.city} onChange={e => f('city', e.target.value)} disabled={!form.county} className={ic + ' disabled:bg-gray-50 disabled:text-gray-400'}>
                <option value="">— Oriunde —</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Nr. camere (min–max)</label>
              <div className="flex gap-2">
                <input type="number" value={form.nr_camere_min} onChange={e => f('nr_camere_min', e.target.value)} placeholder="min" className={ic} min="0" />
                <input type="number" value={form.nr_camere_max} onChange={e => f('nr_camere_max', e.target.value)} placeholder="max" className={ic} min="0" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Suprafață mp (min–max)</label>
              <div className="flex gap-2">
                <input type="number" value={form.suprafata_min} onChange={e => f('suprafata_min', e.target.value)} placeholder="min" className={ic} min="0" />
                <input type="number" value={form.suprafata_max} onChange={e => f('suprafata_max', e.target.value)} placeholder="max" className={ic} min="0" />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Sursă</label>
            <select value={form.source} onChange={e => f('source', e.target.value)} className={ic}>
              <option value="">— Necunoscută —</option>
              {['facebook','olx','storia','imobiliare','banner','site_propriu','recomandare','altul'].map(s => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Observații</label>
            <textarea value={form.notes} onChange={e => f('notes', e.target.value)} rows={3}
              placeholder="Preferințe, detalii suplimentare..." className={ic} />
          </div>

          {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        </div>

        <div className="px-5 pb-5 pt-2 flex gap-2 justify-end border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Anulare</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-sm text-white rounded-lg disabled:opacity-50 hover:opacity-90 transition-colors"
            style={{ backgroundColor: '#0E6B54' }}
          >
            {saving ? 'Se salvează...' : 'Salvează modificările'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CloseModal({ demand, onClose, onSuccess }: {
  demand: Demand; onClose: () => void; onSuccess: (id: string, status: string) => void;
}) {
  const [closeStatus, setCloseStatus] = useState<'indeplinita' | 'anulata'>('indeplinita');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleClose = async () => {
    if (!comment.trim() || comment.trim().length < 5) {
      setErr('Comentariul este obligatoriu (minim 5 caractere)');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Neautentificat');
      const res = await fetch('/api/demands/close', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ id: demand.id, close_status: closeStatus, close_comment: comment.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Eroare');
      onSuccess(demand.id, closeStatus);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Eroare');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Închide cererea</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">
            Cerere: <span className="font-mono text-xs text-gray-500">{demand.internal_code}</span>
          </p>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-2">Status final *</label>
            <div className="flex gap-3">
              <label className={`flex-1 flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-colors ${closeStatus === 'indeplinita' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input type="radio" name="closeStatus" value="indeplinita" checked={closeStatus === 'indeplinita'} onChange={() => setCloseStatus('indeplinita')} className="sr-only" />
                <CheckCircle size={18} className={closeStatus === 'indeplinita' ? 'text-emerald-600' : 'text-gray-400'} />
                <div>
                  <p className="text-sm font-medium text-gray-800">Îndeplinită</p>
                  <p className="text-xs text-gray-500">Cerere finalizată cu succes</p>
                </div>
              </label>
              <label className={`flex-1 flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-colors ${closeStatus === 'anulata' ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input type="radio" name="closeStatus" value="anulata" checked={closeStatus === 'anulata'} onChange={() => setCloseStatus('anulata')} className="sr-only" />
                <XCircle size={18} className={closeStatus === 'anulata' ? 'text-red-600' : 'text-gray-400'} />
                <div>
                  <p className="text-sm font-medium text-gray-800">Anulată</p>
                  <p className="text-xs text-gray-500">Clientul a renunțat</p>
                </div>
              </label>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Comentariu de închidere * <span className="text-gray-400">(obligatoriu, min. 5 caractere)</span>
            </label>
            <textarea
              value={comment}
              onChange={e => { setComment(e.target.value); setErr(''); }}
              placeholder="ex: Clientul a achiziționat apartamentul din str. Eroilor nr. 5..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className={`text-xs mt-1 ${comment.length < 5 && comment.length > 0 ? 'text-red-500' : 'text-gray-400'}`}>
              {comment.length}/5+ caractere
            </p>
          </div>

          {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        </div>
        <div className="px-5 pb-5 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Anulare</button>
          <button
            onClick={handleClose}
            disabled={saving || comment.trim().length < 5}
            className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 hover:opacity-90 transition-colors"
            style={{ backgroundColor: closeStatus === 'anulata' ? '#dc2626' : '#0E6B54' }}
          >
            {saving ? 'Se salvează...' : `Marchează ca ${closeStatus === 'indeplinita' ? 'îndeplinită' : 'anulată'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function MatchModal({ demand, onClose }: { demand: Demand; onClose: () => void }) {
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setError('Neautentificat'); return; }
        const res = await fetch(`/api/demands/auto-match?demand_id=${demand.id}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const d = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(d.error);
        setMatches(d.matches || []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Eroare');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [demand.id]);

  const scoreColor = (s: number) => {
    if (s >= 80) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    if (s >= 55) return 'text-yellow-700 bg-yellow-50 border-yellow-200';
    return 'text-gray-600 bg-gray-50 border-gray-200';
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-bold text-gray-900">Potriviri automate</h3>
            <p className="text-xs text-gray-500 mt-0.5 font-mono">{demand.internal_code}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && (
            <div className="text-center py-8 text-gray-400">
              <Zap size={28} className="mx-auto mb-2 animate-pulse" />
              <p className="text-sm">Caut proprietati potrivite...</p>
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-sm">{error}</div>
          )}
          {matches !== null && matches.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <Home size={28} className="mx-auto mb-2" />
              <p className="text-sm">Nu am gasit proprietati cu scor ≥ 30%. Adauga mai multe proprietati active.</p>
            </div>
          )}
          {matches?.map((m) => (
            <div key={m.id} className={`rounded-xl border p-4 ${scoreColor(m.score)}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-2xl font-black`}>{m.score}%</span>
                    <span className="text-xs font-medium opacity-75">compatibilitate</span>
                  </div>
                  <Link
                    href={`/properties/${m.id}`}
                    className="font-semibold text-gray-900 hover:text-emerald-700 text-sm block truncate"
                    target="_blank"
                  >
                    {m.title}
                  </Link>
                  <p className="text-xs text-gray-500 mt-0.5 font-mono">{m.internal_code}</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {[m.city, m.county].filter(Boolean).join(', ')} — {(m.price ?? 0).toLocaleString('ro-RO')} {m.currency || 'EUR'}
                  </p>
                </div>
                {m.attributes?.photos?.[0] && (
                  <img
                    src={m.attributes.photos[0]}
                    alt={m.title}
                    className="w-20 h-16 object-cover rounded-lg flex-shrink-0"
                  />
                )}
              </div>
              {/* Detalii scor */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(m.details).map(([key, val]) => {
                  const ok = val.toLowerCase().includes('potrivit') || val.toLowerCase().includes('in range') || val.toLowerCase().includes('nespecificat');
                  return (
                    <span
                      key={key}
                      className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${ok ? 'bg-white/70 text-gray-700' : 'bg-red-100 text-red-700'}`}
                    >
                      {ok ? <CheckCircle size={11} /> : <AlertCircle size={11} />}
                      {key}: {val}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-3 border-t border-gray-100 flex-shrink-0">
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <Info size={12} />
            Scorul combina: categorie, locatie, pret, suprafata si nr. camere
          </p>
        </div>
      </div>
    </div>
  );
}

export function DemandsList({ demands, onDelete, onStatusChange, canDelete = false, agentNames = {} }: DemandsListProps) {
  const [matchDemand, setMatchDemand] = useState<Demand | null>(null);
  const [closeDemand, setCloseDemand] = useState<Demand | null>(null);
  const [editDemand, setEditDemand] = useState<Demand | null>(null);
  const [localDemands, setLocalDemands] = useState<Demand[]>(demands);

  useEffect(() => { setLocalDemands(demands); }, [demands]);

  if (localDemands.length === 0) {
    return (
      <div className="text-center py-12">
        <Target size={40} className="mx-auto mb-3 text-gray-300" />
        <p className="text-gray-500 text-lg font-medium">Nu ai cereri inca</p>
        <p className="text-gray-400 text-sm mt-1">Adauga prima cerere de la un client</p>
      </div>
    );
  }

  return (
    <>
      {matchDemand && (
        <MatchModal demand={matchDemand} onClose={() => setMatchDemand(null)} />
      )}
      {closeDemand && (
        <CloseModal
          demand={closeDemand}
          onClose={() => setCloseDemand(null)}
          onSuccess={(id, status) => {
            onStatusChange?.(id, status);
            setCloseDemand(null);
          }}
        />
      )}
      {editDemand && (
        <EditDemandModal
          demand={editDemand}
          onClose={() => setEditDemand(null)}
          onSuccess={(updated) => {
            setLocalDemands(prev => prev.map(d => d.id === updated.id ? { ...d, ...updated } : d));
            setEditDemand(null);
          }}
        />
      )}

      <div className="space-y-3">
        {localDemands.map((demand) => {
          const c = demand.criteria || {};
          const city = demand.cities?.[0] || '';
          const county = demand.counties?.[0] || '';
          const source = demand.source || '';
          const notes = demand.notes || '';
          const currency = demand.currency || 'EUR';
          const camere = c.nr_camere_min || c.nr_camere_max
            ? `${c.nr_camere_min ?? '?'}-${c.nr_camere_max ?? '+'} cam`
            : null;
          const suprafata = c.suprafata_min || c.suprafata_max
            ? `${c.suprafata_min ?? '?'}-${c.suprafata_max ?? '+'}mp`
            : null;
          const tranzactie = demand.transaction;

          return (
            <div
              key={demand.id}
              className="bg-white rounded-xl border border-gray-200 hover:border-emerald-300 hover:shadow-sm transition-all"
            >
              {/* Rand principal */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Cod + titlu auto + badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-gray-400">{demand.internal_code}</span>
                      <h3 className="font-bold text-gray-900 text-sm">
                        {demand.category?.replace(/_/g, ' ')}
                        {camere ? ` · ${camere}` : ''}
                        {city || county ? ` — ${[city, county].filter(Boolean).join(', ')}` : ''}
                      </h3>
                      {source && (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SOURCE_COLOR[source] || 'bg-gray-100 text-gray-600'}`}>
                          {SOURCE_LABEL[source] || source}
                        </span>
                      )}
                      {tranzactie && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                          {tranzactie === 'vanzare' ? 'Cumparare' : 'Inchiriere'}
                        </span>
                      )}
                      {demand.agent_id && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 flex items-center gap-1">
                          <User size={11} />
                          {agentNames[demand.agent_id] || 'Agent'}
                        </span>
                      )}
                    </div>

                    {/* Locatie + pret */}
                    <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-600">
                      {(city || county) && (
                        <span className="flex items-center gap-1">
                          <MapPin size={12} className="text-emerald-600" />
                          {[city, county].filter(Boolean).join(', ')}
                        </span>
                      )}
                      {(demand.budget_min || demand.budget_max) && (
                        <span className="flex items-center gap-1 font-semibold text-gray-800">
                          <DollarSign size={12} />
                          {demand.budget_min ? demand.budget_min.toLocaleString() : '0'} — {demand.budget_max ? demand.budget_max.toLocaleString() : '∞'} {currency}
                        </span>
                      )}
                      <span className="text-gray-400 capitalize">{demand.category.replace(/_/g, ' ')}</span>
                      {camere && <span>{camere}</span>}
                      {suprafata && <span>{suprafata}</span>}
                    </div>

                    {/* Observatii — direct vizibile */}
                    {notes && (
                      <div className="mt-2 text-xs text-gray-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 flex gap-1.5">
                        <span className="flex-shrink-0 text-amber-500">💬</span>
                        <span className="italic">{notes}</span>
                      </div>
                    )}
                  </div>

                  {/* Actiuni */}
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button
                      onClick={() => setMatchDemand(demand)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-white transition-all hover:opacity-90"
                      style={{ backgroundColor: '#0E6B54' }}
                    >
                      <Zap size={13} />
                      Potriviri auto
                    </button>
                    <button
                      onClick={() => setEditDemand(demand)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Pencil size={13} />
                      Editează
                    </button>
                    <button
                      onClick={() => setCloseDemand(demand)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <CheckCircle size={13} />
                      Închide cerere
                    </button>
                    {canDelete && (
                      <button
                        onClick={() => onDelete?.(demand.id)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors self-end"
                        title="Sterge"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
