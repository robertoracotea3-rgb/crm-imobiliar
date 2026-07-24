'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';

import { supabase } from '@/lib/supabase';
import { DEMAND_INTENTS, DEMAND_PROPERTY_TYPES } from '@/lib/demand-record';
import { JUDETE, getCities } from '@/lib/romania-locations';

export interface DemandView {
  id: string;
  internal_code?: string;
  contact_id?: string | null;
  agent_id?: string | null;
  intent?: string | null;
  transaction?: string | null;
  category?: string | null;
  property_types?: string[] | null;
  budget_min?: number | null;
  budget_max?: number | null;
  budget_unknown?: boolean | null;
  currency?: string | null;
  counties?: string[] | null;
  cities?: string[] | null;
  zones?: string[] | null;
  radius_km?: number | null;
  rooms_min?: number | null;
  rooms_max?: number | null;
  usable_area_min?: number | null;
  usable_area_max?: number | null;
  land_area_min?: number | null;
  land_area_max?: number | null;
  floor_preferences?: string[] | null;
  furnished_preference?: string | null;
  parking_required?: boolean | null;
  financing?: string | null;
  deadline_date?: string | null;
  special_requirements?: string | null;
  source?: string | null;
  notes?: string | null;
  status?: string | null;
  criteria?: Record<string, unknown> | null;
  last_relevant_activity_at?: string | null;
  review_due_at?: string | null;
  review_marked_at?: string | null;
  review_count?: number | null;
  review_blockers_snapshot?: string[] | null;
  next_action_type?: string | null;
  next_action_at?: string | null;
  contact_after_at?: string | null;
  close_reason_code?: string | null;
  close_reason_note?: string | null;
  closed_at?: string | null;
  reopened_at?: string | null;
}

interface ContactOption { id: string; full_name?: string; name?: string; phone?: string; email?: string }
interface AgentOption { id: string; email?: string; name?: string }

interface FormState {
  status: string;
  contact_id: string;
  agent_id: string;
  intent: string;
  property_types: string[];
  budget_min: string;
  budget_max: string;
  budget_unknown: boolean;
  currency: string;
  counties: string[];
  cities: string[];
  zones: string[];
  radius_km: string;
  rooms_min: string;
  rooms_max: string;
  usable_area_min: string;
  usable_area_max: string;
  land_area_min: string;
  land_area_max: string;
  floor_preferences: string[];
  furnished_preference: string;
  parking_required: boolean;
  financing: string;
  deadline_date: string;
  special_requirements: string;
  source: string;
  notes: string;
}

const TYPE_LABELS: Record<string, string> = {
  apartament: 'Apartament', casa_vila: 'Casă / Vilă', spatiu_comercial: 'Spațiu comercial',
  spatiu_industrial: 'Spațiu industrial', teren: 'Teren', pensiune_hotel: 'Pensiune / Hotel',
  birou: 'Birou', garaj: 'Garaj',
};
const INTENT_LABELS: Record<string, string> = {
  cumparare: 'Cumpărare', inchiriere: 'Închiriere', vanzare: 'Vânzare', oferire_inchiriere: 'Oferire spre închiriere',
};
const SOURCE_OPTIONS = [
  ['manual', 'Manual'], ['storia', 'Storia'], ['olx', 'OLX'], ['imobiliare_ro', 'Imobiliare.ro'],
  ['site_propriu', 'Site propriu'], ['facebook', 'Facebook'], ['recomandare', 'Recomandare'], ['altul', 'Altul'],
];
const FLOOR_OPTIONS = ['demisol', 'parter', '1', '2', '3', '4', '5+', 'ultimul'];
const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200';

function stringValue(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function initialForm(demand?: DemandView | null, defaultContactId?: string): FormState {
  const criteria = demand?.criteria || {};
  return {
    status: demand?.status || 'activa',
    contact_id: demand?.contact_id || defaultContactId || '',
    agent_id: demand?.agent_id || '',
    intent: demand?.intent || (demand?.transaction === 'inchiriere' ? 'inchiriere' : 'cumparare'),
    property_types: demand?.property_types?.length ? demand.property_types : [demand?.category || 'apartament'],
    budget_min: stringValue(demand?.budget_min),
    budget_max: stringValue(demand?.budget_max),
    budget_unknown: demand?.budget_unknown ?? (demand?.budget_min == null && demand?.budget_max == null),
    currency: demand?.currency || 'EUR',
    counties: demand?.counties || [],
    cities: demand?.cities || [],
    zones: demand?.zones || [],
    radius_km: stringValue(demand?.radius_km),
    rooms_min: stringValue(demand?.rooms_min ?? criteria.nr_camere_min),
    rooms_max: stringValue(demand?.rooms_max ?? criteria.nr_camere_max),
    usable_area_min: stringValue(demand?.usable_area_min ?? criteria.suprafata_min),
    usable_area_max: stringValue(demand?.usable_area_max ?? criteria.suprafata_max),
    land_area_min: stringValue(demand?.land_area_min ?? criteria.teren_min),
    land_area_max: stringValue(demand?.land_area_max ?? criteria.teren_max),
    floor_preferences: demand?.floor_preferences || [],
    furnished_preference: demand?.furnished_preference || '',
    parking_required: demand?.parking_required === true,
    financing: demand?.financing || '',
    deadline_date: demand?.deadline_date || '',
    special_requirements: demand?.special_requirements || '',
    source: demand?.source || 'manual',
    notes: demand?.notes || '',
  };
}

export function AddDemandDialog({
  onClose,
  onSuccess,
  demand,
  defaultContactId,
}: {
  onClose: () => void;
  onSuccess?: () => void;
  demand?: DemandView | null;
  defaultContactId?: string;
}) {
  const [form, setForm] = useState<FormState>(() => initialForm(demand, defaultContactId));
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [countyChoice, setCountyChoice] = useState(form.counties[0] || 'Brașov');
  const [cityChoice, setCityChoice] = useState('');
  const [zoneDraft, setZoneDraft] = useState('');
  const [newContact, setNewContact] = useState({ full_name: '', phone: '', email: '' });
  const [showNewContact, setShowNewContact] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const headers = { Authorization: `Bearer ${session.access_token}` };
      const [contactResponse, agentResponse] = await Promise.all([
        fetch('/api/contacts', { headers }),
        fetch('/api/agents/list', { headers }),
      ]);
      if (cancelled) return;
      if (contactResponse.ok) setContacts((await contactResponse.json()).contacts || []);
      if (agentResponse.ok) setAgents((await agentResponse.json()).agents || []);
    })();
    return () => { cancelled = true; };
  }, []);

  const cityOptions = useMemo(() => getCities(countyChoice), [countyChoice]);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError('');
  };
  const toggleList = (key: 'property_types' | 'floor_preferences', value: string) => {
    set(key, form[key].includes(value) ? form[key].filter((item) => item !== value) : [...form[key], value]);
  };
  const addLocation = () => {
    if (!cityChoice) return;
    setForm((current) => ({
      ...current,
      counties: current.counties.includes(countyChoice) ? current.counties : [...current.counties, countyChoice],
      cities: current.cities.includes(cityChoice) ? current.cities : [...current.cities, cityChoice],
    }));
    setCityChoice('');
  };
  const addZone = () => {
    const value = zoneDraft.trim();
    if (value && !form.zones.includes(value)) set('zones', [...form.zones, value]);
    setZoneDraft('');
  };

  const createContact = async () => {
    if (!newContact.full_name.trim()) return setError('Numele clientului este obligatoriu');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return setError('Sesiune expirată');
    const response = await fetch('/api/contacts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newContact, name: newContact.full_name, type: 'cumparator' }),
    });
    const result = await response.json();
    if (!response.ok) return setError(result.error || 'Clientul nu a putut fi creat');
    const contact = result.contact as ContactOption;
    setContacts((current) => [contact, ...current]);
    set('contact_id', contact.id);
    setShowNewContact(false);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.contact_id) return setError('Selectează clientul');
    if (form.property_types.length === 0) return setError('Selectează cel puțin un tip de proprietate');
    if (!form.budget_unknown && !form.budget_min && !form.budget_max) {
      return setError('Completează bugetul sau bifează „Buget necunoscut”');
    }
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sesiune expirată');
      const response = await fetch(demand ? '/api/demands/update' : '/api/demands/create', {
        method: demand ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(demand ? { id: demand.id } : {}),
          ...form,
          category: form.property_types[0],
          budget_min: form.budget_unknown || !form.budget_min ? null : Number(form.budget_min),
          budget_max: form.budget_unknown || !form.budget_max ? null : Number(form.budget_max),
          radius_km: form.radius_km ? Number(form.radius_km) : null,
          rooms_min: form.rooms_min ? Number(form.rooms_min) : null,
          rooms_max: form.rooms_max ? Number(form.rooms_max) : null,
          usable_area_min: form.usable_area_min ? Number(form.usable_area_min) : null,
          usable_area_max: form.usable_area_max ? Number(form.usable_area_max) : null,
          land_area_min: form.land_area_min ? Number(form.land_area_min) : null,
          land_area_max: form.land_area_max ? Number(form.land_area_max) : null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Cererea nu a putut fi salvată');
      onSuccess?.();
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Eroare la salvare');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mobile-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3">
      <form onSubmit={submit} className="mobile-dialog-panel flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-4 sm:px-6">
          <div><h2 className="text-xl font-bold text-emerald-800">{demand ? `Editează ${demand.internal_code || 'cererea'}` : 'Cerere nouă'}</h2><p className="text-xs text-gray-500">Criteriile necunoscute nu reduc și nu cresc artificial scorul.</p></div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100" aria-label="Închide"><X size={20} /></button>
        </div>

        <div className="grid flex-1 gap-5 overflow-y-auto p-4 sm:p-6 md:grid-cols-2">
          <section className="space-y-4">
            <h3 className="font-bold text-gray-900">Client și scop</h3>
            <div><label className="mb-1 block text-xs font-semibold text-gray-600">Client *</label><div className="flex gap-2"><select value={form.contact_id} onChange={(event) => set('contact_id', event.target.value)} className={inputClass}><option value="">Selectează clientul</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.full_name || contact.name || 'Client'}{contact.phone ? ` · ${contact.phone}` : ''}</option>)}</select><button type="button" onClick={() => setShowNewContact((value) => !value)} className="rounded-lg border border-emerald-300 px-3 text-emerald-700" title="Client nou"><Plus size={18} /></button></div></div>
            {showNewContact && <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><input className={inputClass} placeholder="Nume complet *" value={newContact.full_name} onChange={(event) => setNewContact({ ...newContact, full_name: event.target.value })} /><div className="grid grid-cols-2 gap-2"><input className={inputClass} placeholder="Telefon" value={newContact.phone} onChange={(event) => setNewContact({ ...newContact, phone: event.target.value })} /><input className={inputClass} placeholder="E-mail" value={newContact.email} onChange={(event) => setNewContact({ ...newContact, email: event.target.value })} /></div><button type="button" onClick={createContact} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Creează și selectează</button></div>}
            <div><label className="mb-1 block text-xs font-semibold text-gray-600">Tipul solicitării *</label><div className="grid grid-cols-2 gap-2">{DEMAND_INTENTS.map((intent) => <button type="button" key={intent} onClick={() => set('intent', intent)} className={`rounded-lg border px-3 py-2 text-sm ${form.intent === intent ? 'border-emerald-600 bg-emerald-50 font-semibold text-emerald-800' : 'border-gray-200 text-gray-600'}`}>{INTENT_LABELS[intent]}</button>)}</div></div>
            {demand && <div><label className="mb-1 block text-xs font-semibold text-gray-600">Status operațional</label><select className={inputClass} value={form.status} onChange={(event) => set('status', event.target.value)} disabled={['de_verificat_inchidere', 'inchisa', 'closed', 'indeplinita', 'anulata'].includes(form.status)}><option value="activa">Activă</option><option value="inactiva">Inactivă</option>{form.status === 'de_verificat_inchidere' && <option value="de_verificat_inchidere">De verificat pentru închidere</option>}{['inchisa', 'closed', 'indeplinita', 'anulata'].includes(form.status) && <option value={form.status}>Închisă</option>}</select><p className="mt-1 text-[11px] text-gray-500">Închiderea, prelungirea și reactivarea se fac din fluxul „Revizuiește”.</p></div>}
            <div><label className="mb-1 block text-xs font-semibold text-gray-600">Tipuri proprietate *</label><div className="grid grid-cols-2 gap-2">{DEMAND_PROPERTY_TYPES.map((type) => <label key={type} className="flex items-center gap-2 rounded-lg border border-gray-200 p-2 text-sm"><input type="checkbox" checked={form.property_types.includes(type)} onChange={() => toggleList('property_types', type)} />{TYPE_LABELS[type]}</label>)}</div></div>
            <div className="grid grid-cols-2 gap-3"><div><label className="mb-1 block text-xs font-semibold text-gray-600">Sursă</label><select value={form.source} onChange={(event) => set('source', event.target.value)} className={inputClass}>{SOURCE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div><label className="mb-1 block text-xs font-semibold text-gray-600">Agent</label><select value={form.agent_id} onChange={(event) => set('agent_id', event.target.value)} className={inputClass}><option value="">Agentul curent</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name || agent.email || agent.id}</option>)}</select></div></div>

            <h3 className="pt-2 font-bold text-gray-900">Localizare</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]"><select className={inputClass} value={countyChoice} onChange={(event) => { setCountyChoice(event.target.value); setCityChoice(''); }}><option value="">Județ</option>{JUDETE.map((county) => <option key={county} value={county}>{county}</option>)}</select><select className={inputClass} value={cityChoice} disabled={!countyChoice} onChange={(event) => setCityChoice(event.target.value)}><option value="">Oraș / sat / comună</option>{cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}</select><button type="button" onClick={addLocation} disabled={!cityChoice} className="mobile-touch-target flex items-center justify-center rounded-lg bg-emerald-700 px-3 text-white disabled:opacity-40"><Plus size={18} /><span className="ml-2 sm:hidden">Adaugă localitatea</span></button></div>
            <div className="flex flex-wrap gap-2">{form.cities.map((city) => <button type="button" key={city} onClick={() => set('cities', form.cities.filter((item) => item !== city))} className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-800">{city} ×</button>)}{form.cities.length === 0 && <span className="text-xs text-gray-400">Nicio localitate selectată</span>}</div>
            <div className="flex gap-2"><input className={inputClass} placeholder="Zonă / cartier" value={zoneDraft} onChange={(event) => setZoneDraft(event.target.value)} /><button type="button" onClick={addZone} className="rounded-lg border border-gray-300 px-3"><Plus size={18} /></button></div>
            <div className="flex flex-wrap gap-2">{form.zones.map((zone) => <button type="button" key={zone} onClick={() => set('zones', form.zones.filter((item) => item !== zone))} className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-800">{zone} ×</button>)}</div>
            <div><label className="mb-1 block text-xs font-semibold text-gray-600">Rază (km, opțional)</label><input type="number" min="0" max="250" className={inputClass} value={form.radius_km} onChange={(event) => set('radius_km', event.target.value)} /></div>
          </section>

          <section className="space-y-4">
            <h3 className="font-bold text-gray-900">Buget și caracteristici</h3>
            <label className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 text-sm"><input type="checkbox" checked={form.budget_unknown} onChange={(event) => set('budget_unknown', event.target.checked)} />Clientul nu știe încă bugetul</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_90px]"><input disabled={form.budget_unknown} type="number" min="0" className={inputClass} placeholder="Buget minim" value={form.budget_min} onChange={(event) => set('budget_min', event.target.value)} /><input disabled={form.budget_unknown} type="number" min="0" className={inputClass} placeholder="Buget maxim" value={form.budget_max} onChange={(event) => set('budget_max', event.target.value)} /><select className={inputClass} value={form.currency} onChange={(event) => set('currency', event.target.value)}><option>EUR</option><option>RON</option></select></div>
            <Range label="Camere" min={form.rooms_min} max={form.rooms_max} onMin={(value) => set('rooms_min', value)} onMax={(value) => set('rooms_max', value)} />
            <Range label="Suprafață utilă (mp)" min={form.usable_area_min} max={form.usable_area_max} onMin={(value) => set('usable_area_min', value)} onMax={(value) => set('usable_area_max', value)} />
            <Range label="Teren (mp)" min={form.land_area_min} max={form.land_area_max} onMin={(value) => set('land_area_min', value)} onMax={(value) => set('land_area_max', value)} />
            <div><label className="mb-1 block text-xs font-semibold text-gray-600">Etaje acceptate</label><div className="flex flex-wrap gap-2">{FLOOR_OPTIONS.map((floor) => <button type="button" key={floor} onClick={() => toggleList('floor_preferences', floor)} className={`rounded-lg border px-3 py-1.5 text-xs ${form.floor_preferences.includes(floor) ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-gray-200 text-gray-600'}`}>{floor}</button>)}</div></div>
            <div className="grid grid-cols-2 gap-3"><div><label className="mb-1 block text-xs font-semibold text-gray-600">Mobilare</label><select className={inputClass} value={form.furnished_preference} onChange={(event) => set('furnished_preference', event.target.value)}><option value="">Nespecificat</option><option value="oricare">Indiferent</option><option value="nemobilat">Nemobilat</option><option value="partial mobilat">Parțial mobilat</option><option value="mobilat">Mobilat</option></select></div><div><label className="mb-1 block text-xs font-semibold text-gray-600">Finanțare</label><select className={inputClass} value={form.financing} onChange={(event) => set('financing', event.target.value)}><option value="">Nespecificat</option><option value="numerar">Numerar</option><option value="credit">Credit</option><option value="credit_preaprobat">Credit preaprobat</option><option value="mixt">Mixt</option></select></div></div>
            <label className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 text-sm"><input type="checkbox" checked={form.parking_required} onChange={(event) => set('parking_required', event.target.checked)} />Parcarea este obligatorie</label>
            <div><label className="mb-1 block text-xs font-semibold text-gray-600">Termen</label><input type="date" className={inputClass} value={form.deadline_date} onChange={(event) => set('deadline_date', event.target.value)} /></div>
            <div><label className="mb-1 block text-xs font-semibold text-gray-600">Cerințe speciale</label><textarea className={inputClass} rows={3} value={form.special_requirements} onChange={(event) => set('special_requirements', event.target.value)} placeholder="Accesibilitate, animale, orientare, utilități etc." /></div>
            <div><label className="mb-1 block text-xs font-semibold text-gray-600">Observații interne</label><textarea className={inputClass} rows={3} value={form.notes} onChange={(event) => set('notes', event.target.value)} /></div>
          </section>
        </div>

        {error && <p className="mx-6 mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-4 sm:gap-3 sm:px-6"><button type="button" onClick={onClose} className="mobile-touch-target flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm sm:flex-none">Anulează</button><button type="submit" disabled={loading} className="mobile-touch-target flex-1 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:flex-none sm:px-5">{loading ? 'Se salvează…' : demand ? 'Salvează modificările' : 'Creează cererea'}</button></div>
      </form>
    </div>
  );
}

function Range({ label, min, max, onMin, onMax }: { label: string; min: string; max: string; onMin: (value: string) => void; onMax: (value: string) => void }) {
  return <div><label className="mb-1 block text-xs font-semibold text-gray-600">{label}</label><div className="grid grid-cols-2 gap-2"><input type="number" min="0" className={inputClass} placeholder="Minim" value={min} onChange={(event) => onMin(event.target.value)} /><input type="number" min="0" className={inputClass} placeholder="Maxim" value={max} onChange={(event) => onMax(event.target.value)} /></div></div>;
}
