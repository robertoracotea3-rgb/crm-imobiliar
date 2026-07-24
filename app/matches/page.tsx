'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Filter, Plus, RefreshCw, Target } from 'lucide-react';

import { AddDemandDialog } from '@/components/AddDemandDialog';
import { DemandsList } from '@/components/DemandsList';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { DEMAND_INTENTS, DEMAND_PROPERTY_TYPES } from '@/lib/demand-record';
import { ORASE_BY_JUDET } from '@/lib/romania-locations';
import { supabase } from '@/lib/supabase';

const INTENT_LABEL: Record<string, string> = { cumparare: 'Cumpărare', inchiriere: 'Închiriere', vanzare: 'Vânzare', oferire_inchiriere: 'Oferire spre închiriere' };
const TYPE_LABEL: Record<string, string> = { apartament: 'Apartament', studio_apartment: 'Garsonieră', casa_vila: 'Casă / Vilă', spatiu_comercial: 'Spațiu comercial', spatiu_industrial: 'Spațiu industrial', teren: 'Teren', pensiune_hotel: 'Pensiune / Hotel', birou: 'Birou', garaj: 'Garaj' };
const selectClass = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-emerald-500 focus:outline-none';

interface Pagination { page: number; page_size: number; total: number; total_pages: number }

export default function MatchesPage() {
  return <Suspense fallback={<ProtectedLayout><div className="p-6 text-gray-500">Se încarcă cererile…</div></ProtectedLayout>}><DemandWorkspace /></Suspense>;
}

function DemandWorkspace() {
  const searchParams = useSearchParams();
  const contactId = searchParams.get('contact_id') || '';
  const focusedDemandId = searchParams.get('demand_id') || '';
  const [demands, setDemands] = useState([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, page_size: 25, total: 0, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addOpen, setAddOpen] = useState(Boolean(contactId));
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState(focusedDemandId ? 'all' : 'activa');
  const [intent, setIntent] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [city, setCity] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [search, setSearch] = useState('');

  const cities = useMemo(() => [...new Set(Object.values(ORASE_BY_JUDET).flat())].sort((a, b) => a.localeCompare(b, 'ro')), []);
  const fetchDemands = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sesiune expirată');
      const params = new URLSearchParams({ page: String(page), page_size: '25', status });
      if (intent) params.set('intent', intent);
      if (propertyType) params.set('property_type', propertyType);
      if (city) params.set('city', city);
      if (onlyMine) params.set('agent_id', 'mine');
      if (search.trim()) params.set('search', search.trim());
      if (focusedDemandId) params.set('demand_id', focusedDemandId);
      const response = await fetch(`/api/demands/list?${params}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Cererile nu au putut fi încărcate');
      setDemands(result.demands || []);
      setPagination(result.pagination);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Eroare la încărcare');
    } finally {
      setLoading(false);
    }
  }, [city, focusedDemandId, intent, onlyMine, page, propertyType, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchDemands(); }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchDemands]);
  const filter = (setter: (value: string) => void, value: string) => { setter(value); setPage(1); };

  return <ProtectedLayout><main className="min-h-screen bg-gray-50 p-4 md:p-6">
    <div className="mx-auto max-w-7xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><div className="mb-1 flex items-center gap-2"><Link href="/clients" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-200" aria-label="Înapoi la clienți"><ArrowLeft size={18} /></Link><h1 className="text-3xl font-bold text-emerald-800">Cereri și potriviri</h1></div><p className="text-sm text-gray-500">{pagination.total} cereri · criterii explicite · matching verificat de agent</p></div><button onClick={() => setAddOpen(true)} className="flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white"><Plus size={17} />Cerere nouă</button></div>

      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-3"><div className="flex flex-wrap items-center gap-2"><Filter size={16} className="text-gray-400" /><input value={search} onChange={(event) => filter(setSearch, event.target.value)} className="min-w-[220px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Cod, observații, cerințe…" /><select className={selectClass} value={status} onChange={(event) => filter(setStatus, event.target.value)}><option value="all">Toate statusurile</option><option value="activa">Active</option><option value="inactiva">Inactive</option><option value="de_verificat_inchidere">De verificat pentru închidere</option><option value="inchisa">Închise</option><option value="indeplinita">Îndeplinite istoric</option><option value="anulata">Anulate istoric</option></select><select className={selectClass} value={intent} onChange={(event) => filter(setIntent, event.target.value)}><option value="">Toate intențiile</option>{DEMAND_INTENTS.map((value) => <option key={value} value={value}>{INTENT_LABEL[value]}</option>)}</select><select className={selectClass} value={propertyType} onChange={(event) => filter(setPropertyType, event.target.value)}><option value="">Toate tipurile</option>{DEMAND_PROPERTY_TYPES.map((value) => <option key={value} value={value}>{TYPE_LABEL[value]}</option>)}</select><select className={`${selectClass} max-w-[190px]`} value={city} onChange={(event) => filter(setCity, event.target.value)}><option value="">Toate localitățile</option>{cities.map((value) => <option key={value} value={value}>{value}</option>)}</select><label className="flex items-center gap-2 px-2 text-sm text-gray-600"><input type="checkbox" checked={onlyMine} onChange={(event) => { setOnlyMine(event.target.checked); setPage(1); }} />Doar ale mele</label><button onClick={fetchDemands} className="rounded-lg border border-gray-300 p-2 text-gray-500" title="Reîncarcă"><RefreshCw size={16} /></button></div></div>

      {focusedDemandId && <div className="mb-4 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800"><span>Este afișată cererea selectată din notificare.</span><Link href="/matches" className="font-semibold underline">Vezi toate cererile</Link></div>}
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {loading ? <div className="rounded-2xl border bg-white py-20 text-center text-gray-400"><Target className="mx-auto mb-2 animate-pulse" />Se încarcă…</div> : <DemandsList demands={demands} onChanged={fetchDemands} />}
      <div className="mt-5 flex items-center justify-between text-sm text-gray-600"><span>Pagina {pagination.page} din {pagination.total_pages}</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40">Anterior</button><button disabled={page >= pagination.total_pages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40">Următor</button></div></div>
    </div>
    {addOpen && <AddDemandDialog key={contactId || 'new'} defaultContactId={contactId} onClose={() => setAddOpen(false)} onSuccess={fetchDemands} />}
  </main></ProtectedLayout>;
}
