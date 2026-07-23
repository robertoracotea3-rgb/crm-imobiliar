'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, CircleHelp, MapPin, Pencil, Target, X, Zap } from 'lucide-react';

import { AddDemandDialog, type DemandView } from '@/components/AddDemandDialog';
import { supabase } from '@/lib/supabase';

interface ContactSummary { id: string; full_name: string; phone?: string; email?: string }
interface DemandListItem extends DemandView {
  created_at?: string;
  contact?: ContactSummary | null;
}
interface MatchItem {
  id: string;
  match_id?: string | null;
  match_status?: string;
  internal_code?: string;
  title?: string;
  city?: string;
  county?: string;
  price?: number | null;
  currency?: string;
  score: number;
  coverage: number;
  reason: string;
  matched: string[];
  unmatched: string[];
  unknown: string[];
  price_difference: number | null;
}

const INTENT_LABEL: Record<string, string> = {
  cumparare: 'Cumpărare', inchiriere: 'Închiriere', vanzare: 'Vânzare', oferire_inchiriere: 'Oferire spre închiriere',
};
const TYPE_LABEL: Record<string, string> = {
  apartament: 'Apartament', casa_vila: 'Casă / Vilă', spatiu_comercial: 'Spațiu comercial',
  spatiu_industrial: 'Spațiu industrial', teren: 'Teren', pensiune_hotel: 'Pensiune / Hotel', birou: 'Birou', garaj: 'Garaj',
};

export function DemandsList({ demands, onChanged }: { demands: DemandListItem[]; onChanged?: () => void }) {
  const [editing, setEditing] = useState<DemandListItem | null>(null);
  const [matching, setMatching] = useState<DemandListItem | null>(null);

  if (demands.length === 0) {
    return <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center"><Target className="mx-auto mb-3 text-gray-300" size={38} /><p className="font-medium text-gray-600">Nu există cereri pentru filtrele alese.</p></div>;
  }

  return <>
    <div className="space-y-3">
      {demands.map((demand) => {
        const types = demand.property_types?.length ? demand.property_types : [demand.category].filter(Boolean) as string[];
        const budget = demand.budget_unknown
          ? 'Buget necunoscut'
          : `${demand.budget_min?.toLocaleString('ro-RO') || '—'} – ${demand.budget_max?.toLocaleString('ro-RO') || '—'} ${demand.currency || 'EUR'}`;
        return <article key={demand.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-emerald-300">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-gray-400">{demand.internal_code || 'Cerere'}</span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">{INTENT_LABEL[demand.intent || ''] || demand.intent || 'Solicitare'}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${demand.status === 'activa' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{demand.status || 'activa'}</span>
              </div>
              {demand.contact ? <Link href={`/clients/${demand.contact.id}`} className="mt-1 block font-bold text-gray-900 hover:text-emerald-700">{demand.contact.full_name}</Link> : <p className="mt-1 font-bold text-amber-700">Client neasociat</p>}
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
                {types.map((type) => <span key={type} className="rounded bg-gray-100 px-2 py-1">{TYPE_LABEL[type] || type}</span>)}
                {(demand.cities || []).map((city) => <span key={city} className="flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-blue-700"><MapPin size={11} />{city}</span>)}
                <span className="rounded bg-amber-50 px-2 py-1 font-semibold text-amber-800">{budget}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                {(demand.rooms_min != null || demand.rooms_max != null) && <span>Camere: {demand.rooms_min ?? '—'}–{demand.rooms_max ?? '—'}</span>}
                {(demand.usable_area_min != null || demand.usable_area_max != null) && <span>Utilă: {demand.usable_area_min ?? '—'}–{demand.usable_area_max ?? '—'} mp</span>}
                {(demand.land_area_min != null || demand.land_area_max != null) && <span>Teren: {demand.land_area_min ?? '—'}–{demand.land_area_max ?? '—'} mp</span>}
                {demand.parking_required && <span>Parcare obligatorie</span>}
                {demand.financing && <span>Finanțare: {demand.financing.replace(/_/g, ' ')}</span>}
                {demand.deadline_date && <span>Termen: {new Date(`${demand.deadline_date}T00:00:00`).toLocaleDateString('ro-RO')}</span>}
              </div>
              {demand.special_requirements && <p className="mt-2 rounded-lg bg-purple-50 px-3 py-2 text-xs text-purple-800">Cerințe speciale: {demand.special_requirements}</p>}
              {demand.notes && <p className="mt-2 text-sm text-gray-600">{demand.notes}</p>}
            </div>
            <div className="flex gap-2">
              {(demand.intent === 'cumparare' || demand.intent === 'inchiriere' || !demand.intent) && <button onClick={() => setMatching(demand)} className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white"><Zap size={14} />Potriviri</button>}
              <button onClick={() => setEditing(demand)} className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700"><Pencil size={14} />Editează</button>
            </div>
          </div>
        </article>;
      })}
    </div>
    {editing && <AddDemandDialog key={editing.id} demand={editing} onClose={() => setEditing(null)} onSuccess={onChanged} />}
    {matching && <MatchDialog demand={matching} onClose={() => setMatching(null)} />}
  </>;
}

function MatchDialog({ demand, onClose }: { demand: DemandListItem; onClose: () => void }) {
  const [matches, setMatches] = useState<MatchItem[] | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return setError('Sesiune expirată');
      const response = await fetch(`/api/demands/auto-match?demand_id=${demand.id}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const result = await response.json();
      if (cancelled) return;
      if (!response.ok) setError(result.error || 'Matchingul nu a putut fi calculat');
      else { setMatches(result.matches || []); setNotice(result.notice || ''); }
    })();
    return () => { cancelled = true; };
  }, [demand.id]);

  const updateMatch = async (match: MatchItem, action: 'approve' | 'reject') => {
    if (!match.match_id) return;
    setUpdating(match.match_id);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const response = await fetch('/api/demands/matches', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: match.match_id, action }),
    });
    if (response.ok) setMatches((current) => current?.map((item) => item.match_id === match.match_id ? { ...item, match_status: action === 'approve' ? 'aprobata' : 'respinsa' } : item) || []);
    setUpdating('');
  };

  return <div className="mobile-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3"><div className="mobile-dialog-panel flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
    <div className="flex items-center justify-between border-b px-6 py-4"><div><h2 className="font-bold text-gray-900">Potriviri explicate · {demand.internal_code}</h2><p className="text-xs text-gray-500">Rezultatele au fost filtrate pe server. Nicio recomandare nu este trimisă automat clientului.</p></div><button onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100"><X size={20} /></button></div>
    <div className="flex-1 space-y-3 overflow-y-auto p-5">
      {!matches && !error && <p className="py-12 text-center text-gray-500">Se calculează potrivirile…</p>}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">{notice}</p>}
      {matches?.length === 0 && !notice && <p className="py-12 text-center text-gray-500">Nu există proprietăți care trec criteriile obligatorii.</p>}
      {matches?.map((match) => <article key={match.id} className="rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="text-2xl font-black text-emerald-700">{match.score}%</span><span className="text-xs text-gray-500">acoperire date {match.coverage}%</span></div><Link href={`/properties/${match.id}`} className="font-bold text-gray-900 hover:text-emerald-700">{match.internal_code ? `${match.internal_code} · ` : ''}{match.title || 'Proprietate'}</Link><p className="text-xs text-gray-500">{[match.city, match.county].filter(Boolean).join(', ')} · {match.price?.toLocaleString('ro-RO') || 'Preț necunoscut'} {match.currency || 'EUR'}</p></div><span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">{match.match_status || 'noua'}</span></div>
        <p className="mt-3 text-sm text-gray-700">{match.reason}</p>
        <div className="mt-3 grid gap-2 md:grid-cols-3"><Explanation icon={CheckCircle2} title="Potrivite" color="text-emerald-700 bg-emerald-50" items={match.matched} /><Explanation icon={AlertTriangle} title="Nepotrivite" color="text-red-700 bg-red-50" items={match.unmatched} /><Explanation icon={CircleHelp} title="Date lipsă" color="text-amber-700 bg-amber-50" items={match.unknown} /></div>
        {match.price_difference != null && match.price_difference !== 0 && <p className="mt-2 text-xs font-semibold text-amber-700">Diferență de preț: {match.price_difference > 0 ? '+' : ''}{match.price_difference.toLocaleString('ro-RO')} {match.currency || 'EUR'}</p>}
        {match.match_id && <div className="mt-3 flex items-center gap-2 border-t pt-3"><button disabled={updating === match.match_id} onClick={() => updateMatch(match, 'approve')} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white">Aprobă recomandarea</button><button disabled={updating === match.match_id} onClick={() => updateMatch(match, 'reject')} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs">Respinge</button><span className="text-xs text-gray-400">Aprobarea nu trimite mesaj clientului.</span></div>}
      </article>)}
    </div>
  </div></div>;
}

function Explanation({ icon: Icon, title, color, items }: { icon: typeof CheckCircle2; title: string; color: string; items: string[] }) {
  return <div className={`rounded-lg p-3 ${color}`}><p className="mb-1 flex items-center gap-1 text-xs font-bold"><Icon size={13} />{title}</p>{items.length > 0 ? <ul className="space-y-1 text-xs">{items.map((item) => <li key={item}>• {item}</li>)}</ul> : <p className="text-xs opacity-70">Niciun criteriu</p>}</div>;
}
