'use client';

import { useState, useEffect } from 'react';
import { X, ChevronDown, ChevronUp, UserPlus, Search, User, Home } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { JUDETE, ORASE_BY_JUDET } from '@/lib/romania-locations';

function AutoComplete({ value, onChange, options, placeholder, disabled }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const filtered = value.length > 0
    ? options.filter(o => o.toLowerCase().includes(value.toLowerCase())).slice(0, 8)
    : options.slice(0, 8);
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        placeholder={placeholder}
        disabled={disabled}
        className={ic + (disabled ? ' bg-gray-50 text-gray-400' : '')}
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg mt-0.5 max-h-48 overflow-y-auto">
          {filtered.map(opt => (
            <button key={opt} type="button"
              onMouseDown={() => { onChange(opt); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-gray-800 text-sm border-b border-gray-50 last:border-0">
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Contact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  type?: string;
}

const ic = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900 text-sm';

interface AddDemandDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const CATEGORIES = [
  { value: 'apartament', label: 'Apartament' },
  { value: 'casa_vila', label: 'Casa / Vila' },
  { value: 'spatiu_comercial', label: 'Spatiu comercial' },
  { value: 'spatiu_industrial', label: 'Spatiu industrial' },
  { value: 'teren', label: 'Teren' },
  { value: 'pensiune_hotel', label: 'Pensiune / Hotel' },
  { value: 'birou', label: 'Birou' },
  { value: 'garaj', label: 'Garaj' },
];

const SURSE = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'olx', label: 'OLX' },
  { value: 'storia', label: 'Storia' },
  { value: 'imobiliare', label: 'Imobiliare.ro' },
  { value: 'banner', label: 'Banner / Panou' },
  { value: 'site_propriu', label: 'Site propriu' },
  { value: 'recomandare', label: 'Recomandare' },
  { value: 'altul', label: 'Altul' },
];

interface Section {
  title: string;
  open: boolean;
}

export function AddDemandDialog({ isOpen, onClose, onSuccess }: AddDemandDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [agents, setAgents] = useState<{ id: string; email: string }[]>([]);
  const [sections, setSections] = useState<Record<string, boolean>>({
    client: true,
    locatie: true,
    cerere: true,
    caracteristici: false,
    crm: false,
  });

  // Contact state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [contactOpen, setContactOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [showNewContact, setShowNewContact] = useState(false);
  const [newC, setNewC] = useState({ name: '', phone: '', email: '', type: 'cumparator' });
  const [newCSaving, setNewCSaving] = useState(false);

  // Property search state
  const [allProperties, setAllProperties] = useState<any[]>([]);
  const [propSearch, setPropSearch] = useState('');
  const [propOpen, setPropOpen] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [selectedPropertyLabel, setSelectedPropertyLabel] = useState('');

  const [fd, setFd] = useState({
    source: '',
    notes: '',
    city: '',
    county: '',
    category: 'apartament',
    tip_tranzactie: 'vanzare',
    min_price: '',
    max_price: '',
    currency: 'EUR',
    suprafata_min: '',
    suprafata_max: '',
    etaj_min: '',
    etaj_max: '',
    nr_camere_min: '',
    nr_camere_max: '',
    agent_id: '',
    property_id: '',
  });

  useEffect(() => {
    if (!isOpen) return;
    fetchAgents();
    fetchContacts();
    fetchProperties();
  }, [isOpen]);

  const fetchAgents = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/agents/list', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      const d = await res.json();
      setAgents(d.agents || []);
    }
  };

  const fetchContacts = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/contacts', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      const d = await res.json();
      setContacts(d.contacts || []);
    }
  };

  const fetchProperties = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/properties/list', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      const d = await res.json();
      setAllProperties(d.properties || []);
    }
  };

  const filteredProperties = propSearch.length > 0
    ? allProperties.filter((p) =>
        p.title?.toLowerCase().includes(propSearch.toLowerCase()) ||
        p.internal_code?.toLowerCase().includes(propSearch.toLowerCase()) ||
        p.city?.toLowerCase().includes(propSearch.toLowerCase())
      ).slice(0, 8)
    : allProperties.slice(0, 6);

  const selectProperty = (p: any) => {
    setSelectedPropertyId(p.id);
    setSelectedPropertyLabel(`${p.internal_code} — ${p.title}`);
    setPropSearch('');
    setPropOpen(false);
  };

  const filteredContacts = contactSearch.length > 0
    ? contacts.filter(c =>
        c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
        (c.phone || '').includes(contactSearch)
      )
    : contacts.slice(0, 6);

  const selectContact = (c: Contact) => {
    setSelectedContactId(c.id);
    setContactSearch(c.name);
    setContactOpen(false);
    setShowNewContact(false);
  };

  const createContact = async () => {
    if (!newC.name.trim()) return;
    setNewCSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(newC),
      });
      const data = await res.json();
      if (res.ok && data.contact) {
        setContacts(p => [...p, data.contact]);
        selectContact(data.contact);
        setNewC({ name: '', phone: '', email: '', type: 'cumparator' });
        setShowNewContact(false);
      }
    } finally {
      setNewCSaving(false);
    }
  };

  const set = (key: string, value: string) => {
    setFd((prev) => ({ ...prev, [key]: value }));
    setError('');
  };

  const toggleSection = (key: string) => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError('');

      if (!fd.city && !fd.county) { setError('Adauga cel putin orasul sau judetul'); return; }

      const location = [fd.city, fd.county].filter(Boolean).join(', ');

      // Auto-generate title from criteria
      const catLabel = CATEGORIES.find(c => c.value === fd.category)?.label || fd.category;
      const camereStr = fd.nr_camere_min
        ? ` ${fd.nr_camere_min}${fd.nr_camere_max && fd.nr_camere_max !== fd.nr_camere_min ? `-${fd.nr_camere_max}` : ''} cam`
        : '';
      const tranzStr = fd.tip_tranzactie === 'inchiriere' ? ' chirie' : '';
      const autoTitle = `${catLabel}${camereStr}${tranzStr}${location ? ` — ${location}` : ''}`;

      const criteria = {
        category: fd.category,
        tip_tranzactie: fd.tip_tranzactie,
        city: fd.city,
        county: fd.county,
        location,
        price_range: {
          min: fd.min_price ? parseInt(fd.min_price) : null,
          max: fd.max_price ? parseInt(fd.max_price) : null,
        },
        currency: fd.currency,
        suprafata_min: fd.suprafata_min ? parseInt(fd.suprafata_min) : null,
        suprafata_max: fd.suprafata_max ? parseInt(fd.suprafata_max) : null,
        etaj_min: fd.etaj_min ? parseInt(fd.etaj_min) : null,
        etaj_max: fd.etaj_max ? parseInt(fd.etaj_max) : null,
        nr_camere_min: fd.nr_camere_min ? parseInt(fd.nr_camere_min) : null,
        nr_camere_max: fd.nr_camere_max ? parseInt(fd.nr_camere_max) : null,
        source: fd.source,
        agent_id: fd.agent_id || null,
        property_id: selectedPropertyId || null,
        contact_id: selectedContactId || null,
        notes: fd.notes,
      };

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sesiune invalida');

      const res = await fetch('/api/demands/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title: autoTitle,
          location,
          category: fd.category,
          min_price: fd.min_price ? parseInt(fd.min_price) : null,
          max_price: fd.max_price ? parseInt(fd.max_price) : null,
          criteria,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Eroare server');

      setFd({
        source: '', notes: '', city: '', county: '',
        category: 'apartament', tip_tranzactie: 'vanzare',
        min_price: '', max_price: '', currency: 'EUR',
        suprafata_min: '', suprafata_max: '', etaj_min: '', etaj_max: '',
        nr_camere_min: '', nr_camere_max: '', agent_id: '', property_id: '',
      });
      setSelectedContactId(null);
      setContactSearch('');
      setShowNewContact(false);
      setNewC({ name: '', phone: '', email: '', type: 'cumparator' });
      setSelectedPropertyId(null);
      setSelectedPropertyLabel('');
      setPropSearch('');
      onClose();
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare la adaugare');
    } finally {
      setLoading(false);
    }
  };

  const SectionHeader = ({ id, title }: { id: string; title: string }) => (
    <button
      type="button"
      onClick={() => toggleSection(id)}
      className="w-full flex justify-between items-center py-2 text-sm font-semibold text-gray-700 border-b border-gray-200 mb-3"
    >
      <span>{title}</span>
      {sections[id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4 flex justify-between items-center flex-shrink-0">
          <h2 className="text-xl font-bold" style={{ color: '#0E6B54' }}>
            Adauga Cerere
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded transition-colors">
            <X size={22} />
          </button>
        </div>

        {/* Form scroll */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-sm">{error}</div>
          )}

          {/* Sectiunea 1: Date client */}
          <div>
            <SectionHeader id="client" title="Date client" />
            {sections.client && (
              <div className="space-y-3">
                {/* Contact */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-gray-600">Contact client</label>
                    <button
                      type="button"
                      onClick={() => setShowNewContact(!showNewContact)}
                      className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg text-white hover:opacity-90"
                      style={{ backgroundColor: '#0E6B54' }}
                    >
                      <UserPlus size={12} /> Contact nou
                    </button>
                  </div>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                    <input
                      type="text"
                      value={contactSearch}
                      onChange={(e) => { setContactSearch(e.target.value); setContactOpen(true); }}
                      onFocus={() => setContactOpen(true)}
                      onBlur={() => setTimeout(() => setContactOpen(false), 180)}
                      placeholder="Cauta dupa nume sau telefon..."
                      className={ic + ' pl-8'}
                    />
                    {contactOpen && (
                      <div className="absolute top-full left-0 right-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg mt-0.5 max-h-44 overflow-y-auto">
                        {filteredContacts.length === 0 ? (
                          <p className="px-4 py-3 text-sm text-gray-400">Niciun contact găsit</p>
                        ) : filteredContacts.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={() => selectContact(c)}
                            className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 border-b border-gray-50 last:border-0"
                          >
                            <p className="text-sm font-medium text-gray-800">{c.name}</p>
                            {c.phone && <p className="text-xs text-gray-500">{c.phone}</p>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {selectedContactId && (
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                      <User size={12} />
                      <span className="font-medium">{contactSearch}</span>
                      <button
                        type="button"
                        onClick={() => { setSelectedContactId(null); setContactSearch(''); }}
                        className="ml-auto text-gray-400 hover:text-gray-600"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {showNewContact && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold text-emerald-800">Contact nou</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={newC.name}
                        onChange={(e) => setNewC((p) => ({ ...p, name: e.target.value }))}
                        placeholder="Nume *"
                        className={ic}
                      />
                      <input
                        type="tel"
                        value={newC.phone}
                        onChange={(e) => setNewC((p) => ({ ...p, phone: e.target.value }))}
                        placeholder="Telefon"
                        className={ic}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="email"
                        value={newC.email}
                        onChange={(e) => setNewC((p) => ({ ...p, email: e.target.value }))}
                        placeholder="Email"
                        className={ic}
                      />
                      <select
                        value={newC.type}
                        onChange={(e) => setNewC((p) => ({ ...p, type: e.target.value }))}
                        className={ic + ' bg-white'}
                      >
                        <option value="cumparator">Cumpărător</option>
                        <option value="chirias">Chiriaș</option>
                        <option value="proprietar">Proprietar</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={createContact}
                        disabled={newCSaving || !newC.name.trim()}
                        className="px-3 py-1.5 text-white text-xs rounded-lg disabled:opacity-50 hover:opacity-90"
                        style={{ backgroundColor: '#0E6B54' }}
                      >
                        {newCSaving ? 'Se salveaza...' : 'Salveaza si selecteaza'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowNewContact(false)}
                        className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-white"
                      >
                        Anulare
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Sursa</label>
                    <select
                      value={fd.source}
                      onChange={(e) => set('source', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    >
                      <option value="">-- Selecteaza sursa --</option>
                      {SURSE.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Agent alocat</label>
                    <select
                      value={fd.agent_id}
                      onChange={(e) => set('agent_id', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    >
                      <option value="">-- Fara agent --</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>{a.email}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Observatii</label>
                  <textarea
                    value={fd.notes}
                    onChange={(e) => set('notes', e.target.value)}
                    placeholder="Note despre client, preferinte speciale, urgenta..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Sectiunea 2: Locatie */}
          <div>
            <SectionHeader id="locatie" title="Locatie dorita" />
            {sections.locatie && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Judet</label>
                  <AutoComplete
                    value={fd.county}
                    onChange={(v) => { set('county', v); set('city', ''); }}
                    options={JUDETE}
                    placeholder="ex: Brașov"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Oras *</label>
                  <AutoComplete
                    value={fd.city}
                    onChange={(v) => set('city', v)}
                    options={(ORASE_BY_JUDET as Record<string, string[]>)[fd.county] || JUDETE}
                    placeholder="ex: Brașov"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Sectiunea 3: Cerere */}
          <div>
            <SectionHeader id="cerere" title="Cerere imobiliara" />
            {sections.cerere && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Categorie</label>
                    <select
                      value={fd.category}
                      onChange={(e) => set('category', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Tip tranzactie</label>
                    <select
                      value={fd.tip_tranzactie}
                      onChange={(e) => set('tip_tranzactie', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    >
                      <option value="vanzare">Cumparare</option>
                      <option value="inchiriere">Inchiriere</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Moneda</label>
                  <div className="flex gap-2">
                    {['EUR', 'RON'].map((cur) => (
                      <button
                        key={cur}
                        type="button"
                        onClick={() => set('currency', cur)}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                          fd.currency === cur
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                            : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {cur}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Pret min ({fd.currency})</label>
                    <input
                      type="number"
                      value={fd.min_price}
                      onChange={(e) => set('min_price', e.target.value)}
                      placeholder="ex: 50000"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Pret max ({fd.currency})</label>
                    <input
                      type="number"
                      value={fd.max_price}
                      onChange={(e) => set('max_price', e.target.value)}
                      placeholder="ex: 100000"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sectiunea 4: Caracteristici */}
          <div>
            <SectionHeader id="caracteristici" title="Caracteristici dorite" />
            {sections.caracteristici && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Suprafata min (mp)</label>
                    <input
                      type="number"
                      value={fd.suprafata_min}
                      onChange={(e) => set('suprafata_min', e.target.value)}
                      placeholder="ex: 50"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Suprafata max (mp)</label>
                    <input
                      type="number"
                      value={fd.suprafata_max}
                      onChange={(e) => set('suprafata_max', e.target.value)}
                      placeholder="ex: 100"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Nr. camere min</label>
                    <input
                      type="number"
                      value={fd.nr_camere_min}
                      onChange={(e) => set('nr_camere_min', e.target.value)}
                      placeholder="ex: 2"
                      min="1"
                      max="20"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Nr. camere max</label>
                    <input
                      type="number"
                      value={fd.nr_camere_max}
                      onChange={(e) => set('nr_camere_max', e.target.value)}
                      placeholder="ex: 3"
                      min="1"
                      max="20"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Etaj min</label>
                    <input
                      type="number"
                      value={fd.etaj_min}
                      onChange={(e) => set('etaj_min', e.target.value)}
                      placeholder="ex: 1"
                      min="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Etaj max</label>
                    <input
                      type="number"
                      value={fd.etaj_max}
                      onChange={(e) => set('etaj_max', e.target.value)}
                      placeholder="ex: 5"
                      min="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sectiunea 5: CRM */}
          <div>
            <SectionHeader id="crm" title="Legatura CRM" />
            {sections.crm && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Proprietate (optional)
                </label>
                {selectedPropertyId ? (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    <Home size={14} className="text-emerald-600 flex-shrink-0" />
                    <span className="text-sm font-medium text-emerald-800 flex-1 truncate">{selectedPropertyLabel}</span>
                    <button
                      type="button"
                      onClick={() => { setSelectedPropertyId(null); setSelectedPropertyLabel(''); setPropSearch(''); }}
                      className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                    <input
                      type="text"
                      value={propSearch}
                      onChange={(e) => { setPropSearch(e.target.value); setPropOpen(true); }}
                      onFocus={() => setPropOpen(true)}
                      onBlur={() => setTimeout(() => setPropOpen(false), 180)}
                      placeholder="Cauta dupa cod, titlu sau oras..."
                      className={ic + ' pl-8'}
                    />
                    {propOpen && (
                      <div className="absolute top-full left-0 right-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg mt-0.5 max-h-48 overflow-y-auto">
                        {filteredProperties.length === 0 ? (
                          <p className="px-4 py-3 text-sm text-gray-400">Nicio proprietate gasita</p>
                        ) : filteredProperties.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={() => selectProperty(p)}
                            className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 border-b border-gray-50 last:border-0 flex items-center gap-3"
                          >
                            {p.attributes?.photos?.[0] ? (
                              <img src={p.attributes.photos[0]} alt="" className="w-10 h-8 object-cover rounded flex-shrink-0" />
                            ) : (
                              <div className="w-10 h-8 bg-gray-100 rounded flex-shrink-0 flex items-center justify-center">
                                <Home size={14} className="text-gray-400" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{p.title}</p>
                              <p className="text-xs text-gray-500 font-mono">{p.internal_code} · {[p.city, p.county].filter(Boolean).join(', ')}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-1">Completeaza daca clientul a sunat pentru o proprietate anume</p>
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            Anuleaza
          </button>
          <button
            type="submit"
            form=""
            disabled={loading}
            onClick={handleSubmit as any}
            className="flex-1 px-4 py-2 text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors text-sm font-medium"
            style={{ backgroundColor: '#0E6B54' }}
          >
            {loading ? 'Se salveaza...' : 'Salveaza Cerere'}
          </button>
        </div>
      </div>
    </div>
  );
}
