'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Upload, ImageIcon, UserPlus, Search, Wand2, Loader2, Copy, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { JUDETE, getCities, filterOptions } from '@/lib/romania-locations';
import { SetupAlert } from './SetupAlert';
import { MapPicker } from './MapPicker';

interface Contact {
  id: string; name: string; phone?: string; phone2?: string;
  email?: string; cnp?: string; address?: string; type?: string; notes?: string;
}

// ─── helpers ────────────────────────────────────────────────────────────────

const ic = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900 text-sm';
const sc = `${ic} bg-white`;

function F({ label, req, children }: { label: string; req?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}{req ? ' *' : ''}</label>
      {children}
    </div>
  );
}

function SH({ title }: { title: string }) {
  return <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-4 mb-2 border-b border-gray-100 pb-1">{title}</p>;
}

function Chk({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 select-none">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="w-4 h-4 rounded accent-emerald-600" />
      {label}
    </label>
  );
}

function AutoComplete({ value, onChange, options, placeholder, disabled }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const filtered = filterOptions(options, value);

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

// ─── constants ───────────────────────────────────────────────────────────────

const TIP_PROPRIETATE = [
  'Apartament', 'Casă/Vilă', 'Teren', 'Spațiu comercial',
  'Birou', 'Hală', 'Industrial', 'Hotel/Pensiune', 'Garaj', 'Fermă',
];

const CODE_PREFIX: Record<string, string> = {
  'Apartament': 'AP', 'Casă/Vilă': 'CV', 'Teren': 'TR',
  'Spațiu comercial': 'SC', 'Birou': 'BR', 'Hală': 'HL',
  'Industrial': 'IN', 'Hotel/Pensiune': 'PH', 'Garaj': 'GR', 'Fermă': 'FR',
};

const CATEGORY_MAP: Record<string, string> = {
  'Apartament': 'apartament', 'Casă/Vilă': 'casa_vila', 'Teren': 'teren',
  'Spațiu comercial': 'spatiu_comercial', 'Birou': 'birou', 'Hală': 'spatiu_industrial',
  'Industrial': 'spatiu_industrial', 'Hotel/Pensiune': 'pensiune_hotel',
  'Garaj': 'garaj', 'Fermă': 'teren',
};

const STATUS_MAP: Record<string, string> = {
  'Activă': 'activa', 'Rezervată': 'rezervata', 'Vândută': 'tranzactionata', 'Închiriată': 'tranzactionata',
};

const TRANSACTION_MAP: Record<string, string> = {
  'Vânzare': 'vanzare', 'Închiriere': 'inchiriere',
};

const genCode = (tip: string) => `${CODE_PREFIX[tip] || 'PR'}-0001`;

// ─── form state ──────────────────────────────────────────────────────────────

interface FD {
  // 1 - Date generale
  title: string; internal_code: string; tip_oferta: string;
  tip_proprietate: string; price: string; currency: string;
  comision: string; comision_prop_pct: string; comision_prop_val: string;
  comision_chir_pct: string; comision_chir_val: string;
  tva_inclus: boolean; negociabil: boolean;
  exclusivitate: boolean; stare_oferta: string;
  // 2 - Localizare
  judet: string; localitate: string; cartier: string; zona: string;
  strada: string; numar: string; bloc: string; apartament_nr: string;
  cod_postal: string; lat: string; lon: string; ascunde_adresa: boolean;
  // 3 - Proprietar
  prop_nume: string; prop_tel: string; prop_tel2: string;
  prop_email: string; prop_cnp: string; prop_adresa: string; prop_obs: string;
  // 4 - Suprafete & Camere
  sup_utila: string; sup_construita: string; sup_totala: string;
  sup_teren: string; sup_curte: string; sup_balcon: string;
  sup_terasa: string; sup_pivnita: string; sup_garaj_mp: string;
  front_stradal: string; nr_camere: string; nr_dormitoare: string;
  nr_bai: string; nr_bucatarii: string; nr_balcoane: string;
  nr_terase: string; nr_parcare: string; compartimentare: string;
  confort: string; etaj: string; nr_etaje: string;
  mansarda: boolean; demisol: boolean; subsol: boolean;
  parter: boolean; ultimul_etaj: boolean;
  // 5 - Constructie & Utilitati
  an_constructie: string; an_renovare: string; structura: string;
  regim_inaltime: string; clasa_energetica: string; risc_seismic: string;
  certificat_energetic: boolean;
  util_curent: boolean; util_apa: boolean; util_canal: boolean;
  util_gaz: boolean; util_internet: boolean; util_cablu: boolean;
  util_fosa: boolean; util_put: boolean;
  util_fotovoltaice: boolean; util_trifazic: boolean;
  inc_centrala_proprie: boolean; inc_centrala_bloc: boolean;
  inc_termoficare: boolean; inc_pardoseala: boolean;
  inc_semineu: boolean; aer_conditionat: boolean; nr_ac: string;
  // 6 - Finisaje & Dotari
  stare: string; pereti: string; podele: string; tamplarie: string;
  usa_intrare: string; acoperis: string;
  izolatie_ext: boolean; izolatie_int: boolean;
  mobilat: string; utilat: string;
  dot_lift: boolean; dot_interfon: boolean; dot_videointerfon: boolean;
  dot_alarma: boolean; dot_supraveghere: boolean; dot_curte: boolean;
  dot_gradina: boolean; dot_piscina: boolean; dot_foisor: boolean;
  dot_garaj: boolean; dot_boxa: boolean; dot_dressing: boolean;
  dot_debara: boolean; dot_jacuzzi: boolean; dot_sauna: boolean;
  dot_terasa: boolean;
  // 8 - Agent
  agent_id: string;
  // 7 - Teren specific
  intravilan: string; pot: string; cut: string; dest_teren: string;
  nr_fronturi: string; deschidere: string; lungime: string;
  latime: string; forma_teren: string;
  // 7 - Comercial specific
  vitrina: string; inaltime_spatiu: string; grupuri_sanitare: string;
  acces_tir: boolean; rampa: boolean; putere_instalata: string;
  // 7 - Media & Marketing
  descriere: string; descriere_en: string; titlu_seo: string;
  meta_desc: string; tags: string;
  pub_site: boolean; pub_imobiliare: boolean; pub_olx: boolean;
  pub_storia: boolean; pub_facebook: boolean;
  // 8 - Date interne
  agent: string; data_preluarii: string; data_expirare: string;
  sursa_lead: string; obs_interne: string;
}

const EMPTY: FD = {
  title: '', internal_code: genCode('Apartament'), tip_oferta: 'Vânzare',
  tip_proprietate: 'Apartament', price: '', currency: 'EUR',
  comision: '', comision_prop_pct: '', comision_prop_val: '', comision_chir_pct: '', comision_chir_val: '',
  tva_inclus: false, negociabil: true,
  exclusivitate: false, stare_oferta: 'Activă',
  judet: '', localitate: '', cartier: '', zona: '',
  strada: '', numar: '', bloc: '', apartament_nr: '',
  cod_postal: '', lat: '', lon: '', ascunde_adresa: false,
  prop_nume: '', prop_tel: '', prop_tel2: '',
  prop_email: '', prop_cnp: '', prop_adresa: '', prop_obs: '',
  sup_utila: '', sup_construita: '', sup_totala: '',
  sup_teren: '', sup_curte: '', sup_balcon: '',
  sup_terasa: '', sup_pivnita: '', sup_garaj_mp: '',
  front_stradal: '', nr_camere: '', nr_dormitoare: '',
  nr_bai: '', nr_bucatarii: '', nr_balcoane: '',
  nr_terase: '', nr_parcare: '', compartimentare: '',
  confort: '', etaj: '', nr_etaje: '',
  mansarda: false, demisol: false, subsol: false,
  parter: false, ultimul_etaj: false,
  an_constructie: '', an_renovare: '', structura: '',
  regim_inaltime: '', clasa_energetica: '', risc_seismic: '',
  certificat_energetic: false,
  util_curent: false, util_apa: false, util_canal: false,
  util_gaz: false, util_internet: false, util_cablu: false,
  util_fosa: false, util_put: false,
  util_fotovoltaice: false, util_trifazic: false,
  inc_centrala_proprie: false, inc_centrala_bloc: false,
  inc_termoficare: false, inc_pardoseala: false,
  inc_semineu: false, aer_conditionat: false, nr_ac: '',
  stare: '', pereti: '', podele: '', tamplarie: '',
  usa_intrare: '', acoperis: '',
  izolatie_ext: false, izolatie_int: false,
  mobilat: '', utilat: '',
  dot_lift: false, dot_interfon: false, dot_videointerfon: false,
  dot_alarma: false, dot_supraveghere: false, dot_curte: false,
  dot_gradina: false, dot_piscina: false, dot_foisor: false,
  dot_garaj: false, dot_boxa: false, dot_dressing: false,
  dot_debara: false, dot_jacuzzi: false, dot_sauna: false,
  dot_terasa: false,
  agent_id: '',
  intravilan: '', pot: '', cut: '', dest_teren: '',
  nr_fronturi: '', deschidere: '', lungime: '', latime: '', forma_teren: '',
  vitrina: '', inaltime_spatiu: '', grupuri_sanitare: '',
  acces_tir: false, rampa: false, putere_instalata: '',
  descriere: '', descriere_en: '', titlu_seo: '',
  meta_desc: '', tags: '',
  pub_site: false, pub_imobiliare: false, pub_olx: false,
  pub_storia: false, pub_facebook: false,
  agent: '', data_preluarii: '', data_expirare: '',
  sursa_lead: '', obs_interne: '',
};

// ─── component ───────────────────────────────────────────────────────────────

export function AddPropertyDialog({ isOpen, onClose, onSuccess }: {
  isOpen: boolean; onClose: () => void; onSuccess?: () => void;
}) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [fd, setFd] = useState<FD>(EMPTY);
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Contacts
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [contactOpen, setContactOpen] = useState(false);
  const [showNewContact, setShowNewContact] = useState(false);
  const [newC, setNewC] = useState({ name: '', phone: '', email: '', type: 'proprietar' });
  const [newCSaving, setNewCSaving] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  // Agents
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);

  // AI description
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDescriptions, setAiDescriptions] = useState<Record<string, string> | null>(null);
  const [aiError, setAiError] = useState('');
  const [copiedKey, setCopiedKey] = useState('');

  const fetchNextCode = async (tip: string, token: string) => {
    const prefix = CODE_PREFIX[tip] || 'PR';
    const res = await fetch(`/api/properties/next-code?prefix=${prefix}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await res.json();
    return d.code || genCode(tip);
  };

  useEffect(() => {
    if (!isOpen) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      // load contacts
      fetch('/api/contacts', { headers: { Authorization: `Bearer ${session.access_token}` } })
        .then(r => r.json()).then(d => setContacts(d.contacts || []));
      // load agents
      fetch('/api/agents/list', { headers: { Authorization: `Bearer ${session.access_token}` } })
        .then(r => r.json()).then(d => {
          const list = (d.agents || []).map((a: { id: string; email: string }) => ({ id: a.id, name: a.email }));
          setAgents(list);
          // pre-select current user
          if (user?.id) setFd(prev => ({ ...prev, agent_id: user.id }));
        });
      // fetch next sequential code
      fetchNextCode(fd.tip_proprietate, session.access_token)
        .then(code => setFd(prev => ({ ...prev, internal_code: code })));
    });
  }, [isOpen, user]);

  const filteredContacts = contactSearch.length > 0
    ? contacts.filter(c =>
        c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
        (c.phone || '').includes(contactSearch)
      ).slice(0, 6)
    : contacts.slice(0, 6);

  const selectContact = (c: Contact) => {
    setFd(prev => ({
      ...prev,
      prop_nume: c.name, prop_tel: c.phone || '',
      prop_tel2: c.phone2 || '', prop_email: c.email || '',
      prop_cnp: c.cnp || '', prop_adresa: c.address || '',
      prop_obs: c.notes || '',
    }));
    setSelectedContactId(c.id);
    setContactSearch(c.name);
    setContactOpen(false);
    setShowNewContact(false);
  };

  const createContact = async () => {
    if (!newC.name.trim()) return;
    try {
      setNewCSaving(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(newC),
      });
      const data = await res.json();
      if (res.ok && data.contact) {
        setContacts(p => [...p, data.contact]);
        selectContact(data.contact);
        setNewC({ name: '', phone: '', email: '', type: 'proprietar' });
        setShowNewContact(false);
      }
    } finally {
      setNewCSaving(false);
    }
  };

  const set = useCallback((name: keyof FD, value: string | boolean) => {
    setFd(prev => {
      const next = { ...prev, [name]: value };
      if (name === 'title') next.title = (value as string).slice(0, 70);
      return next;
    });
    if (name === 'tip_proprietate') {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) return;
        fetchNextCode(value as string, session.access_token)
          .then(code => setFd(prev => ({ ...prev, internal_code: code })));
      });
    }
    setError('');
  }, []);

  const isAp = fd.tip_proprietate === 'Apartament';
  const isCasa = ['Casă/Vilă', 'Hotel/Pensiune'].includes(fd.tip_proprietate);
  const isTeren = ['Teren', 'Fermă'].includes(fd.tip_proprietate);
  const isComercial = ['Spațiu comercial', 'Hală', 'Industrial', 'Birou'].includes(fd.tip_proprietate);
  const hasEtaje = isAp || fd.tip_proprietate === 'Birou' || isComercial;
  const cities = getCities(fd.judet);

  const buildLocation = () => {
    const parts: string[] = [];
    const adresa = [fd.strada, fd.numar].filter(Boolean).join(' ');
    if (adresa) parts.push(adresa);
    if (isAp && fd.bloc) parts.push(`Bl. ${fd.bloc}`);
    if (isAp && fd.apartament_nr) parts.push(`Ap. ${fd.apartament_nr}`);
    if (fd.cartier) parts.push(fd.cartier);
    if (fd.localitate) parts.push(fd.localitate);
    if (fd.judet) parts.push(fd.judet);
    return parts.join(', ') || fd.localitate || fd.judet || '-';
  };

  // Coordinates are valid only when both are present, numeric and non-zero
  // (OLX's Mercury geocoder rejects 0,0). Empty strings parse to 0, hence the guard.
  const hasValidCoords = () => {
    const la = parseFloat(fd.lat), lo = parseFloat(fd.lon);
    return !isNaN(la) && !isNaN(lo) && la !== 0 && lo !== 0;
  };

  const validate = (s: number) => {
    if (s === 1) {
      if (!fd.title.trim()) { setError('Titlul este obligatoriu'); return false; }
      if (fd.title.trim().length < 5) { setError('Titlul trebuie să aibă minim 5 caractere (cerință Storia/OLX)'); return false; }
      if (!fd.price) { setError('Pretul este obligatoriu'); return false; }
    }
    if (s === 2) {
      if (!fd.judet) { setError('Judetul este obligatoriu'); return false; }
      if (!fd.localitate) { setError('Localitatea este obligatorie'); return false; }
      if (!hasValidCoords()) { setError('Selectează locația pe hartă — coordonatele (lat/lon) sunt obligatorii pentru publicarea pe Storia/OLX'); return false; }
    }
    if (s === 4) {
      if (isAp && (!fd.nr_camere || +fd.nr_camere < 1)) { setError('Numărul de camere este obligatoriu pentru apartamente (cerință Storia/OLX)'); return false; }
      if (isTeren) {
        if (!fd.sup_teren || +fd.sup_teren <= 0) { setError('Suprafața terenului este obligatorie (cerință Storia/OLX)'); return false; }
      } else {
        if (!fd.sup_utila || +fd.sup_utila <= 0) { setError('Suprafața utilă este obligatorie (cerință Storia/OLX)'); return false; }
        if (isCasa && (!fd.sup_teren || +fd.sup_teren <= 0)) { setError('Suprafața terenului este obligatorie pentru case (cerință Storia/OLX)'); return false; }
      }
    }
    return true;
  };

  const next = () => { if (validate(step)) setStep(s => Math.min(s + 1, 8)); };
  const prev = () => setStep(s => Math.max(s - 1, 1));

  const handlePhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/') && f.size <= 10_000_000);
    setPhotos(p => [...p, ...files]);
    files.forEach(f => {
      const r = new FileReader();
      r.onload = ev => setPreviews(p => [...p, ev.target?.result as string]);
      r.readAsDataURL(f);
    });
  };

  const removePhoto = (i: number) => {
    setPhotos(p => p.filter((_, idx) => idx !== i));
    setPreviews(p => p.filter((_, idx) => idx !== i));
  };

  const handleSave = async () => {
    // Safety net: the step bar lets users jump steps, bypassing per-step `next()`
    // validation. Re-check the OLX-mandatory data fields and jump to the first gap.
    for (const s of [1, 2, 4]) {
      if (!validate(s)) { setStep(s); return; }
    }

    try {
      setLoading(true);
      setError('');
      setStatus('Se salveaza...');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Nu esti autentificat');

      const attributes = {
        tip_oferta: fd.tip_oferta, tip_proprietate: fd.tip_proprietate,
        currency: fd.currency,
        comision: fd.comision,
        comision_prop_pct: fd.comision_prop_pct ? +fd.comision_prop_pct : null,
        comision_prop_val: fd.comision_prop_val ? +fd.comision_prop_val : null,
        comision_chir_pct: fd.comision_chir_pct ? +fd.comision_chir_pct : null,
        comision_chir_val: fd.comision_chir_val ? +fd.comision_chir_val : null,
        profit_estimat: fd.comision_prop_val || fd.comision_chir_val
          ? (parseFloat(fd.comision_prop_val || '0') || 0) + (parseFloat(fd.comision_chir_val || '0') || 0)
          : null,
        tva_inclus: fd.tva_inclus,
        negociabil: fd.negociabil, exclusivitate: fd.exclusivitate,
        judet: fd.judet, localitate: fd.localitate, cartier: fd.cartier,
        zona: fd.zona, strada: fd.strada, numar: fd.numar,
        bloc: fd.bloc, apartament_nr: fd.apartament_nr,
        cod_postal: fd.cod_postal, lat: fd.lat, lon: fd.lon,
        ascunde_adresa: fd.ascunde_adresa,
        prop_nume: fd.prop_nume, prop_tel: fd.prop_tel, prop_tel2: fd.prop_tel2,
        prop_email: fd.prop_email, prop_cnp: fd.prop_cnp,
        prop_adresa: fd.prop_adresa, prop_obs: fd.prop_obs,
        sup_utila: fd.sup_utila ? +fd.sup_utila : null,
        sup_construita: fd.sup_construita ? +fd.sup_construita : null,
        sup_totala: fd.sup_totala ? +fd.sup_totala : null,
        sup_teren: fd.sup_teren ? +fd.sup_teren : null,
        sup_curte: fd.sup_curte ? +fd.sup_curte : null,
        sup_balcon: fd.sup_balcon ? +fd.sup_balcon : null,
        sup_terasa: fd.sup_terasa ? +fd.sup_terasa : null,
        sup_pivnita: fd.sup_pivnita ? +fd.sup_pivnita : null,
        sup_garaj_mp: fd.sup_garaj_mp ? +fd.sup_garaj_mp : null,
        front_stradal: fd.front_stradal ? +fd.front_stradal : null,
        nr_camere: fd.nr_camere ? +fd.nr_camere : null,
        nr_dormitoare: fd.nr_dormitoare ? +fd.nr_dormitoare : null,
        nr_bai: fd.nr_bai ? +fd.nr_bai : null,
        nr_bucatarii: fd.nr_bucatarii ? +fd.nr_bucatarii : null,
        nr_balcoane: fd.nr_balcoane ? +fd.nr_balcoane : null,
        nr_terase: fd.nr_terase ? +fd.nr_terase : null,
        nr_parcare: fd.nr_parcare ? +fd.nr_parcare : null,
        compartimentare: fd.compartimentare, confort: fd.confort,
        etaj: fd.etaj ? +fd.etaj : null,
        nr_etaje: fd.nr_etaje ? +fd.nr_etaje : null,
        mansarda: fd.mansarda, demisol: fd.demisol, subsol: fd.subsol,
        parter: fd.parter, ultimul_etaj: fd.ultimul_etaj,
        an_constructie: fd.an_constructie ? +fd.an_constructie : null,
        an_renovare: fd.an_renovare ? +fd.an_renovare : null,
        structura: fd.structura, regim_inaltime: fd.regim_inaltime,
        clasa_energetica: fd.clasa_energetica, risc_seismic: fd.risc_seismic,
        certificat_energetic: fd.certificat_energetic,
        utilitati: {
          curent: fd.util_curent, apa: fd.util_apa, canalizare: fd.util_canal,
          gaz: fd.util_gaz, internet: fd.util_internet, cablu: fd.util_cablu,
          fosa: fd.util_fosa, put: fd.util_put,
          fotovoltaice: fd.util_fotovoltaice, trifazic: fd.util_trifazic,
        },
        incalzire: {
          centrala_proprie: fd.inc_centrala_proprie, centrala_bloc: fd.inc_centrala_bloc,
          termoficare: fd.inc_termoficare, pardoseala: fd.inc_pardoseala,
          semineu: fd.inc_semineu, aer_conditionat: fd.aer_conditionat,
          nr_ac: fd.nr_ac ? +fd.nr_ac : null,
        },
        finisaje: {
          stare: fd.stare, pereti: fd.pereti, podele: fd.podele,
          tamplarie: fd.tamplarie, usa_intrare: fd.usa_intrare, acoperis: fd.acoperis,
          izolatie_ext: fd.izolatie_ext, izolatie_int: fd.izolatie_int,
        },
        mobilat: fd.mobilat, utilat: fd.utilat,
        dotari: {
          lift: fd.dot_lift, interfon: fd.dot_interfon, videointerfon: fd.dot_videointerfon,
          alarma: fd.dot_alarma, supraveghere: fd.dot_supraveghere,
          curte: fd.dot_curte, gradina: fd.dot_gradina, piscina: fd.dot_piscina,
          foisor: fd.dot_foisor, garaj: fd.dot_garaj, boxa: fd.dot_boxa,
          dressing: fd.dot_dressing, debara: fd.dot_debara,
          jacuzzi: fd.dot_jacuzzi, sauna: fd.dot_sauna, terasa: fd.dot_terasa,
        },
        teren: isTeren ? {
          intravilan: fd.intravilan, pot: fd.pot, cut: fd.cut,
          destinatie: fd.dest_teren, nr_fronturi: fd.nr_fronturi,
          deschidere: fd.deschidere, lungime: fd.lungime,
          latime: fd.latime, forma: fd.forma_teren,
        } : undefined,
        comercial: isComercial ? {
          vitrina: fd.vitrina ? +fd.vitrina : null,
          inaltime: fd.inaltime_spatiu ? +fd.inaltime_spatiu : null,
          grupuri_sanitare: fd.grupuri_sanitare,
          acces_tir: fd.acces_tir, rampa: fd.rampa,
          putere_instalata: fd.putere_instalata,
        } : undefined,
        descriere_en: fd.descriere_en, titlu_seo: fd.titlu_seo,
        meta_desc: fd.meta_desc, tags: fd.tags,
        publicare: {
          site: fd.pub_site, imobiliare: fd.pub_imobiliare,
          olx: fd.pub_olx, storia: fd.pub_storia, facebook: fd.pub_facebook,
        },
        agent: fd.agent, data_preluarii: fd.data_preluarii,
        data_expirare: fd.data_expirare, sursa_lead: fd.sursa_lead,
        obs_interne: fd.obs_interne,
      };

      const res = await fetch('/api/properties/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          propertyData: {
            title: fd.title,
            internal_code: fd.internal_code,
            price: parseFloat(fd.price) || 0,
            category: CATEGORY_MAP[fd.tip_proprietate] || 'apartament',
            transaction: TRANSACTION_MAP[fd.tip_oferta] || 'vanzare',
            description: fd.descriere,
            status: STATUS_MAP[fd.stare_oferta] || 'activa',
            agent_id: fd.agent_id || null,
            owner_contact_id: selectedContactId,
            attributes: { ...attributes, location_text: buildLocation() },
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Eroare server');

      if (photos.length > 0) {
        setStatus(`Se incarca ${photos.length} poze...`);
        const form = new FormData();
        form.append('propertyId', data.property_id);
        form.append('agencyId', data.agency_id);
        photos.forEach(f => form.append('photos', f));
        await fetch('/api/properties/upload-photos', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: form,
        });
      }

      setFd(EMPTY);
      setPhotos([]);
      setPreviews([]);
      setSelectedContactId(null);
      setContactSearch('');
      setAiDescriptions(null);
      setAiError('');
      setStep(1);
      onClose();
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  if (!isOpen) return null;

  const STEPS = ['Date Generale', 'Localizare', 'Proprietar', 'Suprafețe', 'Construcție', 'Dotări', 'Media', 'Promovare'];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-bold" style={{ color: '#0E6B54' }}>Adaugă Proprietate</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={22} /></button>
        </div>

        {/* Steps bar */}
        <div className="px-6 py-3 flex gap-1 border-b border-gray-100 flex-shrink-0 overflow-x-auto">
          {STEPS.map((label, i) => {
            const s = i + 1;
            return (
              <div key={s} className="flex items-center">
                <button
                  type="button"
                  onClick={() => setStep(s)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${s === step ? 'text-white' : s < step ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100' : 'text-gray-400 bg-gray-100 hover:bg-gray-200'}`}
                  style={s === step ? { backgroundColor: '#0E6B54' } : {}}
                >
                  <span className="font-bold">{s}</span>
                  <span className="hidden sm:inline">{label}</span>
                </button>
                {s < 8 && <div className={`w-4 h-px mx-0.5 ${s < step ? 'bg-emerald-400' : 'bg-gray-200'}`} />}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <div className="mb-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-sm">{error}</div>
              <SetupAlert message={error} />
            </div>
          )}

          {/* ── Step 1: Date Generale ── */}
          {step === 1 && (
            <div className="space-y-3">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-medium text-gray-600">Titlu anunț *</label>
                  <span className={`text-xs ${fd.title.length > 60 ? 'text-orange-500' : 'text-gray-400'}`}>{fd.title.length}/70</span>
                </div>
                <input type="text" value={fd.title} onChange={e => set('title', e.target.value)} maxLength={70}
                  placeholder="ex: Apartament 3 camere, decomandat, vedere panoramică"
                  className={ic} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <F label="Tip proprietate *">
                  <select value={fd.tip_proprietate} onChange={e => set('tip_proprietate', e.target.value)} className={sc}>
                    {TIP_PROPRIETATE.map(t => <option key={t}>{t}</option>)}
                  </select>
                </F>
                <F label="Cod intern (auto)">
                  <input value={fd.internal_code} readOnly className={ic + ' bg-gray-50 text-gray-500 font-mono'} />
                </F>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <F label="Tip ofertă *">
                  <select value={fd.tip_oferta} onChange={e => set('tip_oferta', e.target.value)} className={sc}>
                    <option>Vânzare</option><option>Închiriere</option>
                  </select>
                </F>
                <F label="Stare ofertă">
                  <select value={fd.stare_oferta} onChange={e => set('stare_oferta', e.target.value)} className={sc}>
                    <option>Activă</option><option>Rezervată</option><option>Vândută</option><option>Închiriată</option>
                  </select>
                </F>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <F label="Preț *">
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-gray-500 text-sm font-medium">
                        {fd.currency === 'EUR' ? '€' : 'RON'}
                      </span>
                      <input type="number" value={fd.price} onChange={e => set('price', e.target.value)}
                        placeholder="ex: 75000" className={ic + ' pl-10'} />
                    </div>
                  </F>
                </div>
                <F label="Monedă">
                  <select value={fd.currency} onChange={e => set('currency', e.target.value)} className={sc}>
                    <option>EUR</option><option>RON</option>
                  </select>
                </F>
              </div>

              <SH title="Comisioane" />
              <div className="grid grid-cols-2 gap-3">
                <F label="Comision proprietar (%)">
                  <input type="number" value={fd.comision_prop_pct}
                    onChange={e => {
                      const pct = e.target.value;
                      const val = fd.price && pct ? (parseFloat(fd.price) * parseFloat(pct) / 100).toFixed(0) : '';
                      setFd(prev => ({ ...prev, comision_prop_pct: pct, comision_prop_val: val }));
                    }}
                    placeholder="ex: 3" min="0" max="100" step="0.5" className={ic} />
                </F>
                <F label="Valoare comision proprietar">
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-500 text-sm">{fd.currency === 'EUR' ? '€' : 'RON'}</span>
                    <input type="number" value={fd.comision_prop_val}
                      onChange={e => setFd(prev => ({ ...prev, comision_prop_val: e.target.value }))}
                      placeholder="auto-calculat" className={ic + ' pl-8'} />
                  </div>
                </F>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <F label={fd.tip_oferta === 'Închiriere' ? 'Comision chiriaș (%)' : 'Comision cumpărător (%)'}>
                  <input type="number" value={fd.comision_chir_pct}
                    onChange={e => {
                      const pct = e.target.value;
                      const val = fd.price && pct ? (parseFloat(fd.price) * parseFloat(pct) / 100).toFixed(0) : '';
                      setFd(prev => ({ ...prev, comision_chir_pct: pct, comision_chir_val: val }));
                    }}
                    placeholder="ex: 3" min="0" max="100" step="0.5" className={ic} />
                </F>
                <F label={fd.tip_oferta === 'Închiriere' ? 'Valoare comision chiriaș' : 'Valoare comision cumpărător'}>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-500 text-sm">{fd.currency === 'EUR' ? '€' : 'RON'}</span>
                    <input type="number" value={fd.comision_chir_val}
                      onChange={e => setFd(prev => ({ ...prev, comision_chir_val: e.target.value }))}
                      placeholder="auto-calculat" className={ic + ' pl-8'} />
                  </div>
                </F>
              </div>
              {(fd.comision_prop_val || fd.comision_chir_val) && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-800 font-medium">
                  Profit estimat: {fd.currency === 'EUR' ? '€' : 'RON'}{' '}
                  {((parseFloat(fd.comision_prop_val || '0') || 0) + (parseFloat(fd.comision_chir_val || '0') || 0)).toLocaleString()}
                </div>
              )}

              <div className="flex gap-6 pt-1">
                <Chk label="Negociabil" checked={fd.negociabil} onChange={v => set('negociabil', v)} />
                <Chk label="TVA inclus" checked={fd.tva_inclus} onChange={v => set('tva_inclus', v)} />
                <Chk label="Exclusivitate" checked={fd.exclusivitate} onChange={v => set('exclusivitate', v)} />
              </div>
            </div>
          )}

          {/* ── Step 2: Localizare ── */}
          {step === 2 && (
            <div className="space-y-3">
              {/* Județ + Localitate — sus */}
              <div className="grid grid-cols-2 gap-3">
                <F label="Județ *">
                  <AutoComplete value={fd.judet} onChange={v => { set('judet', v); set('localitate', ''); }}
                    options={JUDETE} placeholder="ex: Brașov" />
                </F>
                <F label="Localitate *">
                  <AutoComplete value={fd.localitate} onChange={v => set('localitate', v)}
                    options={cities.length > 0 ? cities : JUDETE}
                    placeholder={fd.judet ? 'ex: Făgăraș' : 'Selectați județul mai întâi'}
                    disabled={false} />
                </F>
              </div>

              {/* Hartă — imediat vizibilă, click pentru a seta locația */}
              <MapPicker
                lat={fd.lat}
                lon={fd.lon}
                onCoords={(lat, lon) => { set('lat', lat); set('lon', lon); }}
              />

              {/* Coordonate auto-completate de hartă — obligatorii pentru Storia/OLX */}
              <div className="grid grid-cols-2 gap-3">
                <F label="Latitudine *">
                  <input type="text" value={fd.lat} onChange={e => set('lat', e.target.value)}
                    placeholder="45.8416" className={ic} />
                </F>
                <F label="Longitudine *">
                  <input type="text" value={fd.lon} onChange={e => set('lon', e.target.value)}
                    placeholder="24.9731" className={ic} />
                </F>
              </div>

              {/* Adresă detaliată */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <F label="Stradă">
                    <input type="text" value={fd.strada} onChange={e => set('strada', e.target.value)}
                      placeholder="ex: Str. Eroilor" className={ic} />
                  </F>
                </div>
                <F label="Număr">
                  <input type="text" value={fd.numar} onChange={e => set('numar', e.target.value)}
                    placeholder="12" className={ic} />
                </F>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <F label="Cartier">
                  <input type="text" value={fd.cartier} onChange={e => set('cartier', e.target.value)}
                    placeholder="ex: Centru" className={ic} />
                </F>
                <F label="Zonă">
                  <input type="text" value={fd.zona} onChange={e => set('zona', e.target.value)}
                    placeholder="ex: Central" className={ic} />
                </F>
              </div>

              {isAp && (
                <div className="grid grid-cols-2 gap-3">
                  <F label="Nr. Bloc">
                    <input type="text" value={fd.bloc} onChange={e => set('bloc', e.target.value)}
                      placeholder="ex: A2" className={ic} />
                  </F>
                  <F label="Nr. Apartament">
                    <input type="text" value={fd.apartament_nr} onChange={e => set('apartament_nr', e.target.value)}
                      placeholder="ex: 15" className={ic} />
                  </F>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <F label="Cod Poștal">
                  <input type="text" value={fd.cod_postal} onChange={e => set('cod_postal', e.target.value)}
                    placeholder="ex: 505200" className={ic} />
                </F>
                <div className="flex items-end">
                  <Chk label="Ascunde adresa exactă pe anunț" checked={fd.ascunde_adresa} onChange={v => set('ascunde_adresa', v)} />
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Proprietar ── */}
          {step === 3 && (
            <div className="space-y-3">
              {/* Contact search */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-600">Caută contact existent</label>
                  <button type="button" onClick={() => setShowNewContact(!showNewContact)}
                    className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg hover:opacity-90 text-white transition-colors"
                    style={{ backgroundColor: '#0E6B54' }}>
                    <UserPlus size={13} /> Contact nou
                  </button>
                </div>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                  <input type="text" value={contactSearch}
                    onChange={e => { setContactSearch(e.target.value); setContactOpen(true); }}
                    onFocus={() => setContactOpen(true)}
                    onBlur={() => setTimeout(() => setContactOpen(false), 180)}
                    placeholder="Scrie nume sau telefon..."
                    className={ic + ' pl-8'} />
                  {contactOpen && (
                    <div className="absolute top-full left-0 right-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg mt-0.5 max-h-48 overflow-y-auto">
                      {filteredContacts.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-gray-400">Niciun contact găsit</p>
                      ) : filteredContacts.map(c => (
                        <button key={c.id} type="button"
                          onMouseDown={() => selectContact(c)}
                          className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 border-b border-gray-50 last:border-0">
                          <p className="text-sm font-medium text-gray-800">{c.name}</p>
                          {c.phone && <p className="text-xs text-gray-500">{c.phone}</p>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Quick new contact form */}
              {showNewContact && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-emerald-800">Contact nou</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" value={newC.name} onChange={e => setNewC(p => ({ ...p, name: e.target.value }))}
                      placeholder="Nume *" className={ic} />
                    <input type="tel" value={newC.phone} onChange={e => setNewC(p => ({ ...p, phone: e.target.value }))}
                      placeholder="Telefon" className={ic} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="email" value={newC.email} onChange={e => setNewC(p => ({ ...p, email: e.target.value }))}
                      placeholder="Email" className={ic} />
                    <select value={newC.type} onChange={e => setNewC(p => ({ ...p, type: e.target.value }))}
                      className={ic + ' bg-white'}>
                      <option value="proprietar">Proprietar</option>
                      <option value="cumparator">Cumpărător</option>
                      <option value="chirias">Chiriaș</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={createContact} disabled={newCSaving || !newC.name.trim()}
                      className="px-3 py-1.5 text-white text-xs rounded-lg disabled:opacity-50 hover:opacity-90"
                      style={{ backgroundColor: '#0E6B54' }}>
                      {newCSaving ? 'Se salvează...' : 'Salvează și selectează'}
                    </button>
                    <button type="button" onClick={() => setShowNewContact(false)}
                      className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-white">
                      Anulare
                    </button>
                  </div>
                </div>
              )}

              {/* Proprietar fields */}
              <div className="border-t border-gray-100 pt-3 space-y-3">
                <F label="Nume proprietar">
                  <input type="text" value={fd.prop_nume} onChange={e => set('prop_nume', e.target.value)}
                    placeholder="ex: Ion Popescu" className={ic} />
                </F>
                <div className="grid grid-cols-2 gap-3">
                  <F label="Telefon">
                    <input type="tel" value={fd.prop_tel} onChange={e => set('prop_tel', e.target.value)}
                      placeholder="07xx xxx xxx" className={ic} />
                  </F>
                  <F label="Telefon secundar">
                    <input type="tel" value={fd.prop_tel2} onChange={e => set('prop_tel2', e.target.value)}
                      placeholder="07xx xxx xxx" className={ic} />
                  </F>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <F label="Email">
                    <input type="email" value={fd.prop_email} onChange={e => set('prop_email', e.target.value)}
                      placeholder="email@example.com" className={ic} />
                  </F>
                  <F label="CNP / CUI">
                    <input type="text" value={fd.prop_cnp} onChange={e => set('prop_cnp', e.target.value)}
                      placeholder="CNP sau CUI" className={ic} />
                  </F>
                </div>
                <F label="Adresă proprietar">
                  <input type="text" value={fd.prop_adresa} onChange={e => set('prop_adresa', e.target.value)}
                    placeholder="Adresa completa" className={ic} />
                </F>
                <F label="Observații proprietar">
                  <textarea value={fd.prop_obs} onChange={e => set('prop_obs', e.target.value)}
                    placeholder="Note despre proprietar..." rows={3} className={ic} />
                </F>
              </div>
            </div>
          )}

          {/* ── Step 4: Suprafete & Compartimentare ── */}
          {step === 4 && (
            <div className="space-y-3">
              <SH title="Suprafețe (m²)" />
              <div className="grid grid-cols-3 gap-3">
                <F label={`Suprafață utilă${!isTeren ? ' *' : ''}`}><input type="number" value={fd.sup_utila} onChange={e => set('sup_utila', e.target.value)} placeholder="mp" min="0" className={ic} /></F>
                <F label="Suprafață construită"><input type="number" value={fd.sup_construita} onChange={e => set('sup_construita', e.target.value)} placeholder="mp" min="0" className={ic} /></F>
                <F label="Suprafață totală"><input type="number" value={fd.sup_totala} onChange={e => set('sup_totala', e.target.value)} placeholder="mp" min="0" className={ic} /></F>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <F label={`Suprafață teren${isTeren || isCasa ? ' *' : ''}`}><input type="number" value={fd.sup_teren} onChange={e => set('sup_teren', e.target.value)} placeholder="mp" min="0" className={ic} /></F>
                <F label="Suprafață curte"><input type="number" value={fd.sup_curte} onChange={e => set('sup_curte', e.target.value)} placeholder="mp" min="0" className={ic} /></F>
                <F label="Suprafață balcon"><input type="number" value={fd.sup_balcon} onChange={e => set('sup_balcon', e.target.value)} placeholder="mp" min="0" className={ic} /></F>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <F label="Suprafață terasă"><input type="number" value={fd.sup_terasa} onChange={e => set('sup_terasa', e.target.value)} placeholder="mp" min="0" className={ic} /></F>
                <F label="Suprafață pivniță"><input type="number" value={fd.sup_pivnita} onChange={e => set('sup_pivnita', e.target.value)} placeholder="mp" min="0" className={ic} /></F>
                <F label="Suprafață garaj (mp)"><input type="number" value={fd.sup_garaj_mp} onChange={e => set('sup_garaj_mp', e.target.value)} placeholder="mp" min="0" className={ic} /></F>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <F label="Front stradal (m)"><input type="number" value={fd.front_stradal} onChange={e => set('front_stradal', e.target.value)} placeholder="m" min="0" className={ic} /></F>
              </div>

              {!isTeren && (
                <>
                  <SH title="Compartimentare" />
                  <div className="grid grid-cols-3 gap-3">
                    <F label={`Camere${isAp ? ' *' : ''}`}><input type="number" value={fd.nr_camere} onChange={e => set('nr_camere', e.target.value)} placeholder="nr" min="0" className={ic} /></F>
                    <F label="Dormitoare"><input type="number" value={fd.nr_dormitoare} onChange={e => set('nr_dormitoare', e.target.value)} placeholder="nr" min="0" className={ic} /></F>
                    <F label="Băi"><input type="number" value={fd.nr_bai} onChange={e => set('nr_bai', e.target.value)} placeholder="nr" min="0" className={ic} /></F>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <F label="Bucătării"><input type="number" value={fd.nr_bucatarii} onChange={e => set('nr_bucatarii', e.target.value)} placeholder="nr" min="0" className={ic} /></F>
                    <F label="Balcoane"><input type="number" value={fd.nr_balcoane} onChange={e => set('nr_balcoane', e.target.value)} placeholder="nr" min="0" className={ic} /></F>
                    <F label="Terase"><input type="number" value={fd.nr_terase} onChange={e => set('nr_terase', e.target.value)} placeholder="nr" min="0" className={ic} /></F>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <F label="Locuri parcare"><input type="number" value={fd.nr_parcare} onChange={e => set('nr_parcare', e.target.value)} placeholder="nr" min="0" className={ic} /></F>
                    <F label="Compartimentare">
                      <select value={fd.compartimentare} onChange={e => set('compartimentare', e.target.value)} className={sc}>
                        <option value="">-</option>
                        <option>Decomandat</option><option>Semidecomandat</option>
                        <option>Nedecomandat</option><option>Circular</option>
                      </select>
                    </F>
                    <F label="Confort">
                      <select value={fd.confort} onChange={e => set('confort', e.target.value)} className={sc}>
                        <option value="">-</option>
                        <option>1</option><option>2</option><option>3</option><option>Lux</option>
                      </select>
                    </F>
                  </div>
                </>
              )}

              {hasEtaje && (
                <>
                  <SH title="Etaje" />
                  <div className="grid grid-cols-2 gap-3">
                    <F label="Etaj">
                      <input type="number" value={fd.etaj} onChange={e => set('etaj', e.target.value)} placeholder="0 = parter" min="0" className={ic} />
                    </F>
                    <F label="Nr. etaje clădire">
                      <input type="number" value={fd.nr_etaje} onChange={e => set('nr_etaje', e.target.value)} placeholder="total etaje" min="0" className={ic} />
                    </F>
                  </div>
                  <div className="flex gap-5 flex-wrap pt-1">
                    <Chk label="Mansardă" checked={fd.mansarda} onChange={v => set('mansarda', v)} />
                    <Chk label="Demisol" checked={fd.demisol} onChange={v => set('demisol', v)} />
                    <Chk label="Subsol" checked={fd.subsol} onChange={v => set('subsol', v)} />
                    <Chk label="Parter" checked={fd.parter} onChange={v => set('parter', v)} />
                    <Chk label="Ultimul etaj" checked={fd.ultimul_etaj} onChange={v => set('ultimul_etaj', v)} />
                  </div>
                </>
              )}

              {/* Teren specific */}
              {isTeren && (
                <>
                  <SH title="Detalii teren" />
                  <div className="grid grid-cols-3 gap-3">
                    <F label="Intravilan / Extravilan">
                      <select value={fd.intravilan} onChange={e => set('intravilan', e.target.value)} className={sc}>
                        <option value="">-</option><option>Intravilan</option><option>Extravilan</option>
                      </select>
                    </F>
                    <F label="POT (%)"><input type="text" value={fd.pot} onChange={e => set('pot', e.target.value)} placeholder="ex: 40" className={ic} /></F>
                    <F label="CUT"><input type="text" value={fd.cut} onChange={e => set('cut', e.target.value)} placeholder="ex: 1.2" className={ic} /></F>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <F label="Destinație">
                      <input type="text" value={fd.dest_teren} onChange={e => set('dest_teren', e.target.value)} placeholder="ex: Rezidential" className={ic} />
                    </F>
                    <F label="Nr. fronturi"><input type="text" value={fd.nr_fronturi} onChange={e => set('nr_fronturi', e.target.value)} placeholder="ex: 2" className={ic} /></F>
                    <F label="Formă teren">
                      <input type="text" value={fd.forma_teren} onChange={e => set('forma_teren', e.target.value)} placeholder="ex: Dreptunghiular" className={ic} />
                    </F>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <F label="Deschidere (m)"><input type="number" value={fd.deschidere} onChange={e => set('deschidere', e.target.value)} placeholder="m" className={ic} /></F>
                    <F label="Lungime (m)"><input type="number" value={fd.lungime} onChange={e => set('lungime', e.target.value)} placeholder="m" className={ic} /></F>
                    <F label="Lățime (m)"><input type="number" value={fd.latime} onChange={e => set('latime', e.target.value)} placeholder="m" className={ic} /></F>
                  </div>
                </>
              )}

              {/* Comercial specific */}
              {isComercial && (
                <>
                  <SH title="Detalii spațiu" />
                  <div className="grid grid-cols-3 gap-3">
                    <F label="Vitrină (m)"><input type="number" value={fd.vitrina} onChange={e => set('vitrina', e.target.value)} placeholder="m" className={ic} /></F>
                    <F label="Înălțime spațiu (m)"><input type="number" value={fd.inaltime_spatiu} onChange={e => set('inaltime_spatiu', e.target.value)} placeholder="m" className={ic} /></F>
                    <F label="Grupuri sanitare"><input type="text" value={fd.grupuri_sanitare} onChange={e => set('grupuri_sanitare', e.target.value)} placeholder="ex: 2" className={ic} /></F>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <F label="Putere instalată (kW)"><input type="text" value={fd.putere_instalata} onChange={e => set('putere_instalata', e.target.value)} placeholder="ex: 100" className={ic} /></F>
                  </div>
                  <div className="flex gap-5">
                    <Chk label="Acces TIR" checked={fd.acces_tir} onChange={v => set('acces_tir', v)} />
                    <Chk label="Rampă descărcare" checked={fd.rampa} onChange={v => set('rampa', v)} />
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Step 5: Constructie & Utilitati & Incalzire ── */}
          {step === 5 && (
            <div className="space-y-3">
              <SH title="Clădire" />
              <div className="grid grid-cols-2 gap-3">
                <F label="An construcție"><input type="number" value={fd.an_constructie} onChange={e => set('an_constructie', e.target.value)} placeholder="ex: 1998" className={ic} /></F>
                <F label="An renovare"><input type="number" value={fd.an_renovare} onChange={e => set('an_renovare', e.target.value)} placeholder="ex: 2020" className={ic} /></F>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <F label="Structură">
                  <select value={fd.structura} onChange={e => set('structura', e.target.value)} className={sc}>
                    <option value="">-</option>
                    <option>Cărămidă</option><option>Beton</option><option>BCA</option>
                    <option>Lemn</option><option>Metal</option>
                  </select>
                </F>
                <F label="Regim înălțime"><input type="text" value={fd.regim_inaltime} onChange={e => set('regim_inaltime', e.target.value)} placeholder="ex: P+2" className={ic} /></F>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <F label="Clasă energetică">
                  <select value={fd.clasa_energetica} onChange={e => set('clasa_energetica', e.target.value)} className={sc}>
                    <option value="">-</option>
                    {['A', 'A+', 'B', 'C', 'D', 'E', 'F', 'G'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </F>
                <F label="Risc seismic">
                  <select value={fd.risc_seismic} onChange={e => set('risc_seismic', e.target.value)} className={sc}>
                    <option value="">-</option>
                    <option>RS I</option><option>RS II</option><option>RS III</option><option>Fără risc</option>
                  </select>
                </F>
              </div>
              <Chk label="Certificat energetic disponibil" checked={fd.certificat_energetic} onChange={v => set('certificat_energetic', v)} />

              <SH title="Utilități" />
              <div className="grid grid-cols-4 gap-3">
                <Chk label="Curent" checked={fd.util_curent} onChange={v => set('util_curent', v)} />
                <Chk label="Apă" checked={fd.util_apa} onChange={v => set('util_apa', v)} />
                <Chk label="Canalizare" checked={fd.util_canal} onChange={v => set('util_canal', v)} />
                <Chk label="Gaz" checked={fd.util_gaz} onChange={v => set('util_gaz', v)} />
                <Chk label="Internet" checked={fd.util_internet} onChange={v => set('util_internet', v)} />
                <Chk label="Cablu TV" checked={fd.util_cablu} onChange={v => set('util_cablu', v)} />
                <Chk label="Fosă septică" checked={fd.util_fosa} onChange={v => set('util_fosa', v)} />
                <Chk label="Puț" checked={fd.util_put} onChange={v => set('util_put', v)} />
                <Chk label="Panouri fotovoltaice" checked={fd.util_fotovoltaice} onChange={v => set('util_fotovoltaice', v)} />
                <Chk label="Curent trifazic" checked={fd.util_trifazic} onChange={v => set('util_trifazic', v)} />
              </div>

              <SH title="Încălzire" />
              <div className="grid grid-cols-3 gap-3">
                <Chk label="Centrală proprie" checked={fd.inc_centrala_proprie} onChange={v => set('inc_centrala_proprie', v)} />
                <Chk label="Centrală bloc" checked={fd.inc_centrala_bloc} onChange={v => set('inc_centrala_bloc', v)} />
                <Chk label="Termoficare" checked={fd.inc_termoficare} onChange={v => set('inc_termoficare', v)} />
                <Chk label="Încălzire pardoseală" checked={fd.inc_pardoseala} onChange={v => set('inc_pardoseala', v)} />
                <Chk label="Șemineu" checked={fd.inc_semineu} onChange={v => set('inc_semineu', v)} />
                <Chk label="Aer condiționat" checked={fd.aer_conditionat} onChange={v => set('aer_conditionat', v)} />
              </div>
              {fd.aer_conditionat && (
                <F label="Nr. aparate AC">
                  <input type="number" value={fd.nr_ac} onChange={e => set('nr_ac', e.target.value)} placeholder="ex: 3" min="0" className={ic} style={{ maxWidth: 120 }} />
                </F>
              )}
            </div>
          )}

          {/* ── Step 6: Finisaje & Dotari ── */}
          {step === 6 && (
            <div className="space-y-3">
              <SH title="Finisaje" />
              <div className="grid grid-cols-2 gap-3">
                <F label="Stare">
                  <select value={fd.stare} onChange={e => set('stare', e.target.value)} className={sc}>
                    <option value="">-</option>
                    <option>Nou</option><option>Renovat</option><option>Necesită renovare</option>
                  </select>
                </F>
                <F label="Mobilat">
                  <select value={fd.mobilat} onChange={e => set('mobilat', e.target.value)} className={sc}>
                    <option value="">-</option>
                    <option>Nemobilat</option><option>Parțial mobilat</option><option>Mobilat complet</option>
                  </select>
                </F>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <F label="Pereți"><input type="text" value={fd.pereti} onChange={e => set('pereti', e.target.value)} placeholder="ex: Gresie, vopsea" className={ic} /></F>
                <F label="Podele"><input type="text" value={fd.podele} onChange={e => set('podele', e.target.value)} placeholder="ex: Parchet, gresie" className={ic} /></F>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <F label="Tâmplărie"><input type="text" value={fd.tamplarie} onChange={e => set('tamplarie', e.target.value)} placeholder="ex: PVC, termopan" className={ic} /></F>
                <F label="Ușă intrare"><input type="text" value={fd.usa_intrare} onChange={e => set('usa_intrare', e.target.value)} placeholder="ex: Metalică, blindată" className={ic} /></F>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <F label="Acoperiș"><input type="text" value={fd.acoperis} onChange={e => set('acoperis', e.target.value)} placeholder="ex: Tablă, țiglă" className={ic} /></F>
                <F label="Utilat">
                  <select value={fd.utilat} onChange={e => set('utilat', e.target.value)} className={sc}>
                    <option value="">-</option>
                    <option>Neutilat</option><option>Parțial utilat</option><option>Utilat complet</option>
                  </select>
                </F>
              </div>
              <div className="flex gap-5">
                <Chk label="Izolație exterioară" checked={fd.izolatie_ext} onChange={v => set('izolatie_ext', v)} />
                <Chk label="Izolație interioară" checked={fd.izolatie_int} onChange={v => set('izolatie_int', v)} />
              </div>

              <SH title="Dotări" />
              <div className="grid grid-cols-3 gap-y-2 gap-x-3">
                <Chk label="Lift" checked={fd.dot_lift} onChange={v => set('dot_lift', v)} />
                <Chk label="Interfon" checked={fd.dot_interfon} onChange={v => set('dot_interfon', v)} />
                <Chk label="Videointerfon" checked={fd.dot_videointerfon} onChange={v => set('dot_videointerfon', v)} />
                <Chk label="Alarmă" checked={fd.dot_alarma} onChange={v => set('dot_alarma', v)} />
                <Chk label="Supraveghere video" checked={fd.dot_supraveghere} onChange={v => set('dot_supraveghere', v)} />
                <Chk label="Curte" checked={fd.dot_curte} onChange={v => set('dot_curte', v)} />
                <Chk label="Grădină" checked={fd.dot_gradina} onChange={v => set('dot_gradina', v)} />
                <Chk label="Piscină" checked={fd.dot_piscina} onChange={v => set('dot_piscina', v)} />
                <Chk label="Foișor" checked={fd.dot_foisor} onChange={v => set('dot_foisor', v)} />
                <Chk label="Garaj" checked={fd.dot_garaj} onChange={v => set('dot_garaj', v)} />
                <Chk label="Boxă" checked={fd.dot_boxa} onChange={v => set('dot_boxa', v)} />
                <Chk label="Dressing" checked={fd.dot_dressing} onChange={v => set('dot_dressing', v)} />
                <Chk label="Debara" checked={fd.dot_debara} onChange={v => set('dot_debara', v)} />
                <Chk label="Jacuzzi" checked={fd.dot_jacuzzi} onChange={v => set('dot_jacuzzi', v)} />
                <Chk label="Saună" checked={fd.dot_sauna} onChange={v => set('dot_sauna', v)} />
                <Chk label="Terasă" checked={fd.dot_terasa} onChange={v => set('dot_terasa', v)} />
              </div>
            </div>
          )}

          {/* ── Step 7: Media & Marketing & Date interne ── */}
          {step === 7 && (
            <div className="space-y-3">
              <SH title="Poze proprietate" />
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotos} />
              <div onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-5 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition-colors">
                <Upload size={24} className="mx-auto text-gray-400 mb-1" />
                <p className="text-sm text-gray-600">Click pentru a adăuga poze</p>
                <p className="text-xs text-gray-400 mt-0.5">JPG, PNG, WEBP — max 10MB</p>
              </div>
              {previews.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {previews.map((p, i) => (
                    <div key={i} className="relative group">
                      <img src={p} alt="" className="w-full h-20 object-cover rounded-lg border border-gray-200" />
                      <button onClick={() => removePhoto(i)}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <X size={12} />
                      </button>
                      {i === 0 && <span className="absolute bottom-1 left-1 bg-emerald-600 text-white text-xs px-1 rounded">Main</span>}
                    </div>
                  ))}
                  <div onClick={() => fileRef.current?.click()}
                    className="h-20 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-emerald-400">
                    <ImageIcon size={20} className="text-gray-400" />
                  </div>
                </div>
              )}

              <SH title="Descriere" />
              <F label="Descriere (RO)">
                <textarea value={fd.descriere} onChange={e => set('descriere', e.target.value)}
                  placeholder="Descriere detaliată în română..." rows={4} className={ic} />
              </F>

              {/* AI Description Generator */}
              <div className="border border-dashed border-emerald-300 rounded-lg p-3 space-y-2 bg-emerald-50/40">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-emerald-800">Generare automată cu AI</p>
                  <button
                    type="button"
                    disabled={aiLoading}
                    onClick={async () => {
                      setAiLoading(true);
                      setAiError('');
                      setAiDescriptions(null);
                      try {
                        const { data: { session } } = await supabase.auth.getSession();
                        if (!session) throw new Error('Nu ești autentificat');
                        const dotari = [
                          fd.dot_lift && 'lift', fd.dot_interfon && 'interfon',
                          fd.dot_videointerfon && 'videointerfon', fd.dot_alarma && 'alarmă',
                          fd.dot_supraveghere && 'supraveghere', fd.dot_garaj && 'garaj',
                          fd.dot_piscina && 'piscină', fd.dot_gradina && 'grădină',
                          fd.dot_terasa && 'terasă', fd.dot_dressing && 'dressing',
                          fd.dot_boxa && 'boxă',
                        ].filter(Boolean) as string[];
                        const utilitati = [
                          fd.util_curent && 'curent', fd.util_apa && 'apă',
                          fd.util_canal && 'canalizare', fd.util_gaz && 'gaz',
                          fd.util_internet && 'internet', fd.util_fotovoltaice && 'panouri fotovoltaice',
                          fd.util_trifazic && 'curent trifazic',
                        ].filter(Boolean) as string[];
                        const incalzire = [
                          fd.inc_centrala_proprie && 'centrală proprie',
                          fd.inc_pardoseala && 'încălzire pardoseală',
                          fd.aer_conditionat && 'aer condiționat',
                        ].filter(Boolean) as string[];
                        const res = await fetch('/api/properties/generate-description', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                          body: JSON.stringify({
                            tip_proprietate: fd.tip_proprietate,
                            tip_oferta: fd.tip_oferta,
                            price: parseFloat(fd.price) || 0,
                            currency: fd.currency,
                            nr_camere: fd.nr_camere ? +fd.nr_camere : null,
                            sup_utila: fd.sup_utila ? +fd.sup_utila : null,
                            judet: fd.judet,
                            localitate: fd.localitate,
                            cartier: fd.cartier,
                            etaj: fd.etaj ? +fd.etaj : null,
                            nr_etaje: fd.nr_etaje ? +fd.nr_etaje : null,
                            an_constructie: fd.an_constructie ? +fd.an_constructie : null,
                            stare: fd.stare,
                            dotari: dotari,
                            utilitati: utilitati,
                            incalzire: incalzire,
                          }),
                        });
                        const d = await res.json();
                        if (!res.ok) throw new Error(d.error || 'Eroare server');
                        setAiDescriptions(d);
                      } catch (err) {
                        setAiError(err instanceof Error ? err.message : 'Eroare la generare');
                      } finally {
                        setAiLoading(false);
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-white text-xs rounded-lg disabled:opacity-50 hover:opacity-90 transition-colors"
                    style={{ backgroundColor: '#B57514' }}
                  >
                    {aiLoading ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                    {aiLoading ? 'Se generează...' : 'Generează descriere AI'}
                  </button>
                </div>

                {aiError && <p className="text-xs text-red-600">{aiError}</p>}

                {aiDescriptions && (
                  <div className="space-y-2 mt-1">
                    {[
                      { key: 'completa', label: 'Descriere completă' },
                      { key: 'scurta', label: 'Scurtă' },
                      { key: 'facebook', label: 'Facebook' },
                      { key: 'olx', label: 'OLX' },
                      { key: 'imobiliare', label: 'Imobiliare.ro' },
                      { key: 'storia', label: 'Storia' },
                    ].map(({ key, label }) => (
                      <div key={key} className="bg-white border border-gray-200 rounded-lg p-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-gray-600">{label}</span>
                          <div className="flex gap-1">
                            <button type="button"
                              onClick={() => { set('descriere', aiDescriptions[key] || ''); }}
                              className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                              Folosește
                            </button>
                            <button type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(aiDescriptions[key] || '');
                                setCopiedKey(key);
                                setTimeout(() => setCopiedKey(''), 2000);
                              }}
                              className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center gap-1">
                              {copiedKey === key ? <CheckCircle size={11} className="text-green-600" /> : <Copy size={11} />}
                              {copiedKey === key ? 'Copiat!' : 'Copiază'}
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-gray-700 line-clamp-3 whitespace-pre-line">{aiDescriptions[key]}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <F label="Descriere (EN)">
                <textarea value={fd.descriere_en} onChange={e => set('descriere_en', e.target.value)}
                  placeholder="English description..." rows={3} className={ic} />
              </F>
              <div className="grid grid-cols-2 gap-3">
                <F label="Titlu SEO">
                  <input type="text" value={fd.titlu_seo} onChange={e => set('titlu_seo', e.target.value)} placeholder="Titlu pentru motoare de căutare" className={ic} />
                </F>
                <F label="Tags">
                  <input type="text" value={fd.tags} onChange={e => set('tags', e.target.value)} placeholder="ex: piscina, parcare, central" className={ic} />
                </F>
              </div>
              <F label="Meta descriere">
                <input type="text" value={fd.meta_desc} onChange={e => set('meta_desc', e.target.value)} placeholder="Descriere scurtă pentru Google" className={ic} />
              </F>

            </div>
          )}

          {/* ── Step 8: Promovare & Date Interne ── */}
          {step === 8 && (
            <div className="space-y-3">
              <SH title="Publicare (opțional)" />
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700 mb-2">
                Proprietatea se salvează indiferent. Poți publica oricând ulterior.
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'pub_site', label: 'Site Propriu Kira' },
                  { key: 'pub_imobiliare', label: 'Imobiliare.ro' },
                  { key: 'pub_olx', label: 'OLX' },
                  { key: 'pub_storia', label: 'Storia' },
                  { key: 'pub_facebook', label: 'Facebook' },
                ].map(({ key, label }) => (
                  <Chk key={key} label={label} checked={fd[key as keyof FD] as boolean} onChange={v => set(key as keyof FD, v)} />
                ))}
              </div>

              <SH title="Date interne agenție" />
              <div className="grid grid-cols-2 gap-3">
                <F label="Agent responsabil">
                  <select value={fd.agent_id} onChange={e => setFd(prev => ({ ...prev, agent_id: e.target.value }))} className={sc}>
                    <option value="">— Neasignat —</option>
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </F>
                <F label="Sursă lead">
                  <input type="text" value={fd.sursa_lead} onChange={e => set('sursa_lead', e.target.value)} placeholder="ex: Imobiliare.ro, Recomandare" className={ic} />
                </F>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <F label="Data preluării">
                  <input type="date" value={fd.data_preluarii} onChange={e => set('data_preluarii', e.target.value)} className={ic} />
                </F>
                <F label="Data expirare contract">
                  <input type="date" value={fd.data_expirare} onChange={e => set('data_expirare', e.target.value)} className={ic} />
                </F>
              </div>
              <F label="Observații interne">
                <textarea value={fd.obs_interne} onChange={e => set('obs_interne', e.target.value)}
                  placeholder="Note interne (nu se publică)..." rows={3} className={ic} />
              </F>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-200 flex-shrink-0">
          {step > 1 && (
            <button onClick={prev}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1 text-sm transition-colors">
              <ChevronLeft size={16} /> Înapoi
            </button>
          )}
          <div className="flex-1" />
          {/* Salvează — mereu vizibil */}
          <button onClick={handleSave} disabled={loading}
            className="px-5 py-2 border border-emerald-600 text-emerald-700 rounded-lg hover:bg-emerald-50 disabled:opacity-40 text-sm font-medium transition-colors">
            {loading ? (status || 'Se salvează...') : 'Salvează'}
          </button>
          {step < 8 && (
            <button onClick={next}
              className="px-5 py-2 text-white rounded-lg hover:opacity-90 flex items-center gap-1 text-sm font-medium transition-colors"
              style={{ backgroundColor: '#0E6B54' }}>
              Înainte <ChevronRight size={16} />
            </button>
          )}
          {step === 8 && (
            <button onClick={handleSave} disabled={loading}
              className="px-6 py-2 text-white rounded-lg hover:opacity-90 disabled:opacity-50 text-sm font-medium transition-colors"
              style={{ backgroundColor: '#0E6B54' }}>
              {loading ? (status || 'Se salvează...') : 'Salvează Proprietatea'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
