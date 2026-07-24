'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { ChevronRight, ChevronLeft, Upload, ImageIcon, Search, Trash2, GripVertical, Star, ArrowLeft, ArrowRight, Copy, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { JUDETE, getCities, filterOptions } from '@/lib/romania-locations';
import { uploadPropertyPhotos } from '@/lib/upload-photos-client';
import {
  PROPERTY_TYPE_DEFINITIONS,
  isPropertyFieldRequired,
  isPropertyFieldVisible,
  propertyCategoryFromLabel,
  propertyCategoryLabel,
} from '@/lib/property-types';
import { MapPicker } from '@/components/MapPicker';

interface Contact {
  id: string; name: string; phone?: string; phone2?: string;
  email?: string; cnp?: string; address?: string; type?: string; notes?: string;
}

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

function TagPicker({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  const selected = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
  const toggle = (opt: string) => {
    const next = selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt];
    onChange(next.join(', '));
  };
  return (
    <div className="flex flex-wrap gap-1.5 p-2 border border-gray-300 rounded-lg min-h-[38px] bg-white">
      {options.map(opt => (
        <button key={opt} type="button" onClick={() => toggle(opt)}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${selected.includes(opt) ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          {opt}
        </button>
      ))}
    </div>
  );
}

async function geocodeAddress(strada: string, numar: string, localitate: string, judet: string): Promise<{ lat: string; lon: string } | null> {
  const enc = encodeURIComponent;
  const tryFetch = async (url: string): Promise<{ lat: string; lon: string } | null> => {
    try {
      const res = await fetch(url, { headers: { 'Accept-Language': 'ro' } });
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.[0]?.lat && data?.[0]?.lon) {
        return { lat: String(parseFloat(data[0].lat).toFixed(6)), lon: String(parseFloat(data[0].lon).toFixed(6)) };
      }
    } catch { /* ignore */ }
    return null;
  };
  const pause = () => new Promise(r => setTimeout(r, 350));

  // 1. Query STRUCTURAT cu stradă (+număr) — cea mai bună precizie pentru adrese RO
  if (strada && localitate) {
    const street = numar ? `${numar} ${strada}` : strada;
    const url = `https://nominatim.openstreetmap.org/search?street=${enc(street)}&city=${enc(localitate)}${judet ? `&county=${enc(judet)}` : ''}&country=Romania&format=json&limit=1`;
    const r = await tryFetch(url);
    if (r) return r;
    await pause();
  }
  // 2. Free-text adresă completă
  if (strada && localitate) {
    const q = [strada, numar, localitate, judet, 'Romania'].filter(Boolean).join(', ');
    const r = await tryFetch(`https://nominatim.openstreetmap.org/search?q=${enc(q)}&format=json&limit=1&countrycodes=ro`);
    if (r) return r;
    await pause();
  }
  // 3. Fallback la nivel de localitate
  if (localitate) {
    const q = [localitate, judet, 'Romania'].filter(Boolean).join(', ');
    const r = await tryFetch(`https://nominatim.openstreetmap.org/search?q=${enc(q)}&format=json&limit=1&countrycodes=ro`);
    if (r) return r;
  }
  return null;
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

const OPT_PERETI   = ['Lavabil', 'Faianță', 'Gresie', 'Rigips', 'Tencuială', 'Vopsea', 'Marmură', 'Cărămidă aparentă', 'Tablă', 'Lambriu'];
const OPT_PODELE   = ['Parchet', 'Gresie', 'Marmură', 'Laminat', 'Covor', 'Beton', 'Ciment', 'Scândură'];
const OPT_TAMPL    = ['PVC termopan', 'Lemn', 'Aluminiu', 'Tâmplărie veche'];
const OPT_USA      = ['Metalică', 'Blindată', 'Lemn', 'PVC'];
const OPT_ACOPERI  = ['Tablă', 'Țiglă', 'Bitum', 'Terasă', 'Șindrilă', 'Eternit'];

const TIP_PROPRIETATE = PROPERTY_TYPE_DEFINITIONS.map((definition) => definition.label);

interface FD {
  title: string; internal_code: string; tip_oferta: string;
  tip_proprietate: string; price: string; currency: string;
  comision: string;
  comision_prop_pct: string; comision_prop_val: string;
  comision_chir_pct: string; comision_chir_val: string;
  tva_inclus: boolean; negociabil: boolean;
  exclusivitate: boolean; stare_oferta: string;
  judet: string; localitate: string; cartier: string; zona: string;
  strada: string; numar: string; bloc: string; apartament_nr: string;
  cod_postal: string; lat: string; lon: string; ascunde_adresa: boolean;
  prop_nume: string; prop_tel: string; prop_tel2: string;
  prop_email: string; prop_cnp: string; prop_adresa: string; prop_obs: string;
  sup_utila: string; sup_construita: string; sup_totala: string;
  sup_teren: string; sup_curte: string; sup_balcon: string;
  sup_terasa: string; sup_pivnita: string; sup_garaj_mp: string;
  front_stradal: string; nr_camere: string; nr_dormitoare: string;
  nr_bai: string; nr_bucatarii: string; nr_balcoane: string;
  nr_terase: string; nr_parcare: string; compartimentare: string;
  confort: string; etaj: string; nr_etaje: string;
  mansarda: boolean; demisol: boolean; subsol: boolean;
  parter: boolean; ultimul_etaj: boolean;
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
  stare: string; pereti: string; podele: string; tamplarie: string;
  usa_intrare: string; acoperis: string;
  izolatie_ext: boolean; izolatie_int: boolean;
  mobilat: string; utilat: string;
  dot_lift: boolean; dot_interfon: boolean; dot_videointerfon: boolean;
  dot_alarma: boolean; dot_supraveghere: boolean; dot_curte: boolean;
  dot_gradina: boolean; dot_piscina: boolean; dot_foisor: boolean;
  dot_garaj: boolean; dot_boxa: boolean; dot_dressing: boolean;
  dot_debara: boolean; dot_jacuzzi: boolean; dot_sauna: boolean; dot_terasa: boolean;
  intravilan: string; pot: string; cut: string; dest_teren: string;
  nr_fronturi: string; deschidere: string; lungime: string;
  latime: string; forma_teren: string;
  vitrina: string; inaltime_spatiu: string; grupuri_sanitare: string;
  acces_tir: boolean; rampa: boolean; putere_instalata: string;
  descriere: string; descriere_en: string; titlu_seo: string;
  meta_desc: string; tags: string;
  pub_site: boolean; pub_imobiliare: boolean; pub_olx: boolean;
  pub_storia: boolean; pub_facebook: boolean;
  agent: string; agent_id: string; data_preluarii: string; data_expirare: string;
  sursa_lead: string; obs_interne: string;
}

const EMPTY: FD = {
  title: '', internal_code: '', tip_oferta: 'Vânzare',
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
  dot_debara: false, dot_jacuzzi: false, dot_sauna: false, dot_terasa: false,
  intravilan: '', pot: '', cut: '', dest_teren: '',
  nr_fronturi: '', deschidere: '', lungime: '', latime: '', forma_teren: '',
  vitrina: '', inaltime_spatiu: '', grupuri_sanitare: '',
  acces_tir: false, rampa: false, putere_instalata: '',
  descriere: '', descriere_en: '', titlu_seo: '',
  meta_desc: '', tags: '',
  pub_site: false, pub_imobiliare: false, pub_olx: false,
  pub_storia: false, pub_facebook: false,
  agent: '', agent_id: '', data_preluarii: '', data_expirare: '',
  sursa_lead: '', obs_interne: '',
};

export default function EditPropertyPage() {
  const params = useParams();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [fd, setFd] = useState<FD>(EMPTY);
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [existingPhotos, setExistingPhotos] = useState<string[]>([]);
  const [photoDetails, setPhotoDetails] = useState<Record<string, { alt_text: string; description: string }>>({});
  const [enhancePhotos, setEnhancePhotos] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [typeChangeNotice, setTypeChangeNotice] = useState('');
  const [agencyId, setAgencyId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Original pub_storia at load time — used to detect user turning it off → auto-unpublish
  const origPubStoriaRef = useRef<boolean>(false);

  // AI photo analysis
  const [photoAnalyzing, setPhotoAnalyzing] = useState(false);
  const [photoAnalyses, setPhotoAnalyses] = useState<{photos: Array<{index: number; room_type: string; description: string; features?: string[]}>; overall_observations?: string} | null>(null);
  const [photoAnalysisError, setPhotoAnalysisError] = useState('');

  // AI description generator
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDescriptions, setAiDescriptions] = useState<Record<string, string> | null>(null);
  const [aiError, setAiError] = useState('');
  const [copiedKey, setCopiedKey] = useState('');

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [contactOpen, setContactOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  const fetchProperty = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Nu esti autentificat'); return; }

      const res = await fetch(`/api/properties/get?id=${params.id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);

      const p = d.property;
      const attrs = p.attributes || {};

      setAgencyId(p.agency_id || null);
      setSelectedContactId(p.owner_contact_id || null);
      setExistingPhotos(attrs.photos || []);
      setPhotoDetails(Object.fromEntries(
        (d.property_media || [])
          .filter((media: { public_url?: string }) => media.public_url)
          .map((media: { public_url: string; alt_text?: string; description?: string }) => [
            media.public_url,
            { alt_text: media.alt_text || '', description: media.description || '' },
          ]),
      ));

      const formData: FD = {
        title: p.title || '',
        internal_code: p.internal_code || '',
        tip_oferta: attrs.tip_oferta || (p.transaction === 'inchiriere' ? 'Închiriere' : 'Vânzare'),
        tip_proprietate: attrs.tip_proprietate || propertyCategoryLabel(p.category),
        price: String(p.price || ''),
        currency: p.currency || 'EUR',
        comision: attrs.comision || '',
        comision_prop_pct: attrs.comision_prop_pct ? String(attrs.comision_prop_pct) : '',
        comision_prop_val: attrs.comision_prop_val ? String(attrs.comision_prop_val) : '',
        comision_chir_pct: attrs.comision_chir_pct ? String(attrs.comision_chir_pct) : '',
        comision_chir_val: attrs.comision_chir_val ? String(attrs.comision_chir_val) : '',
        tva_inclus: attrs.tva_inclus || false,
        negociabil: attrs.negociabil !== false,
        exclusivitate: attrs.exclusivitate || false,
        stare_oferta: attrs.stare_oferta || 'Activă',
        judet: attrs.judet || '',
        localitate: attrs.localitate || '',
        cartier: attrs.cartier || '',
        zona: attrs.zona || attrs.cartier || '',
        strada: attrs.strada || '',
        numar: attrs.numar || '',
        bloc: attrs.bloc || '',
        apartament_nr: attrs.apartament_nr || '',
        cod_postal: attrs.cod_postal || '',
        lat: attrs.lat || '',
        lon: attrs.lon || '',
        ascunde_adresa: attrs.ascunde_adresa || false,
        prop_nume: attrs.prop_nume || '',
        prop_tel: attrs.prop_tel || '',
        prop_tel2: attrs.prop_tel2 || '',
        prop_email: attrs.prop_email || '',
        prop_cnp: attrs.prop_cnp || '',
        prop_adresa: attrs.prop_adresa || '',
        prop_obs: attrs.prop_obs || '',
        sup_utila: attrs.sup_utila ? String(attrs.sup_utila) : '',
        sup_construita: attrs.sup_construita ? String(attrs.sup_construita) : '',
        sup_totala: attrs.sup_totala ? String(attrs.sup_totala) : '',
        sup_teren: attrs.sup_teren ? String(attrs.sup_teren) : '',
        sup_curte: attrs.sup_curte ? String(attrs.sup_curte) : '',
        sup_balcon: attrs.sup_balcon ? String(attrs.sup_balcon) : '',
        sup_terasa: attrs.sup_terasa ? String(attrs.sup_terasa) : '',
        sup_pivnita: attrs.sup_pivnita ? String(attrs.sup_pivnita) : '',
        sup_garaj_mp: attrs.sup_garaj_mp ? String(attrs.sup_garaj_mp) : '',
        front_stradal: attrs.front_stradal ? String(attrs.front_stradal) : '',
        nr_camere: attrs.nr_camere ? String(attrs.nr_camere) : '',
        nr_dormitoare: attrs.nr_dormitoare ? String(attrs.nr_dormitoare) : '',
        nr_bai: attrs.nr_bai ? String(attrs.nr_bai) : '',
        nr_bucatarii: attrs.nr_bucatarii ? String(attrs.nr_bucatarii) : '',
        nr_balcoane: attrs.nr_balcoane ? String(attrs.nr_balcoane) : '',
        nr_terase: attrs.nr_terase ? String(attrs.nr_terase) : '',
        nr_parcare: attrs.nr_parcare ? String(attrs.nr_parcare) : '',
        compartimentare: attrs.compartimentare || '',
        confort: attrs.confort || '',
        etaj: attrs.etaj ? String(attrs.etaj) : '',
        nr_etaje: attrs.nr_etaje ? String(attrs.nr_etaje) : '',
        mansarda: attrs.mansarda || false,
        demisol: attrs.demisol || false,
        subsol: attrs.subsol || false,
        parter: attrs.parter || false,
        ultimul_etaj: attrs.ultimul_etaj || false,
        an_constructie: attrs.an_constructie ? String(attrs.an_constructie) : '',
        an_renovare: attrs.an_renovare ? String(attrs.an_renovare) : '',
        structura: attrs.structura || '',
        regim_inaltime: attrs.regim_inaltime || '',
        clasa_energetica: attrs.clasa_energetica || '',
        risc_seismic: attrs.risc_seismic || '',
        certificat_energetic: attrs.certificat_energetic || false,
        util_curent: attrs.utilitati?.curent || false,
        util_apa: attrs.utilitati?.apa || false,
        util_canal: attrs.utilitati?.canalizare || false,
        util_gaz: attrs.utilitati?.gaz || false,
        util_internet: attrs.utilitati?.internet || false,
        util_cablu: attrs.utilitati?.cablu || false,
        util_fosa: attrs.utilitati?.fosa || false,
        util_put: attrs.utilitati?.put || false,
        util_fotovoltaice: attrs.utilitati?.fotovoltaice || false,
        util_trifazic: attrs.utilitati?.trifazic || false,
        inc_centrala_proprie: attrs.incalzire?.centrala_proprie || false,
        inc_centrala_bloc: attrs.incalzire?.centrala_bloc || false,
        inc_termoficare: attrs.incalzire?.termoficare || false,
        inc_pardoseala: attrs.incalzire?.pardoseala || false,
        inc_semineu: attrs.incalzire?.semineu || false,
        aer_conditionat: attrs.incalzire?.aer_conditionat || false,
        nr_ac: attrs.incalzire?.nr_ac ? String(attrs.incalzire.nr_ac) : '',
        stare: attrs.finisaje?.stare || attrs.stare || '',
        pereti: attrs.finisaje?.pereti || attrs.pereti || '',
        podele: attrs.finisaje?.podele || attrs.podele || '',
        tamplarie: attrs.finisaje?.tamplarie || attrs.tamplarie || '',
        usa_intrare: attrs.finisaje?.usa_intrare || attrs.usa_intrare || '',
        acoperis: attrs.finisaje?.acoperis || attrs.acoperis || '',
        izolatie_ext: attrs.finisaje?.izolatie_ext || false,
        izolatie_int: attrs.finisaje?.izolatie_int || false,
        mobilat: attrs.mobilat || '',
        utilat: attrs.utilat || '',
        dot_lift: attrs.dotari?.lift || false,
        dot_interfon: attrs.dotari?.interfon || false,
        dot_videointerfon: attrs.dotari?.videointerfon || false,
        dot_alarma: attrs.dotari?.alarma || false,
        dot_supraveghere: attrs.dotari?.supraveghere || false,
        dot_curte: attrs.dotari?.curte || false,
        dot_gradina: attrs.dotari?.gradina || false,
        dot_piscina: attrs.dotari?.piscina || false,
        dot_foisor: attrs.dotari?.foisor || false,
        dot_garaj: attrs.dotari?.garaj || false,
        dot_boxa: attrs.dotari?.boxa || false,
        dot_dressing: attrs.dotari?.dressing || false,
        dot_debara: attrs.dotari?.debara || false,
        dot_jacuzzi: attrs.dotari?.jacuzzi || false,
        dot_sauna: attrs.dotari?.sauna || false,
        dot_terasa: attrs.dotari?.terasa || false,
        intravilan: attrs.teren?.intravilan || '',
        pot: attrs.teren?.pot || '',
        cut: attrs.teren?.cut || '',
        dest_teren: attrs.teren?.destinatie || '',
        nr_fronturi: attrs.teren?.nr_fronturi || '',
        deschidere: attrs.teren?.deschidere ? String(attrs.teren.deschidere) : '',
        lungime: attrs.teren?.lungime ? String(attrs.teren.lungime) : '',
        latime: attrs.teren?.latime ? String(attrs.teren.latime) : '',
        forma_teren: attrs.teren?.forma || '',
        vitrina: attrs.comercial?.vitrina ? String(attrs.comercial.vitrina) : '',
        inaltime_spatiu: attrs.comercial?.inaltime ? String(attrs.comercial.inaltime) : '',
        grupuri_sanitare: attrs.comercial?.grupuri_sanitare || '',
        acces_tir: attrs.comercial?.acces_tir || false,
        rampa: attrs.comercial?.rampa || false,
        putere_instalata: attrs.comercial?.putere_instalata || '',
        descriere: attrs.descriere || p.description || '',
        descriere_en: attrs.descriere_en || '',
        titlu_seo: attrs.titlu_seo || '',
        meta_desc: attrs.meta_desc || '',
        tags: attrs.tags || '',
        pub_site: attrs.publicare?.site || false,
        pub_imobiliare: attrs.publicare?.imobiliare || false,
        pub_olx: attrs.publicare?.olx || false,
        pub_storia: attrs.publicare?.storia || false,
        pub_facebook: attrs.publicare?.facebook || false,
        agent: attrs.agent || '',
        agent_id: p.agent_id || '',
        data_preluarii: attrs.data_preluarii || '',
        data_expirare: attrs.data_expirare || '',
        sursa_lead: attrs.sursa_lead || '',
        obs_interne: attrs.obs_interne || '',
      };

      origPubStoriaRef.current = attrs.publicare?.storia || false;
      setFd(formData);

      // Load contacts
      fetch('/api/contacts', { headers: { Authorization: `Bearer ${session.access_token}` } })
        .then(r => r.json()).then(d => setContacts(d.contacts || []));
      // Load agents (pentru dropdown-ul „Agent responsabil")
      fetch('/api/agents/list', { headers: { Authorization: `Bearer ${session.access_token}` } })
        .then(r => r.json()).then(d => setAgents((d.agents || []).map((a: { id: string; email: string; name?: string }) => ({ id: a.id, name: a.name || a.email }))));
    } catch (err) {
      console.error('Eroare:', err);
      setError('Nu am putut incarca proprietatea');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load authenticated property data when the route changes
    void fetchProperty();
  }, [fetchProperty]);

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
  };

  const set = useCallback((name: keyof FD, value: string | boolean) => {
    setFd(prev => ({ ...prev, [name]: value }));
    setError('');
  }, []);

  const category = propertyCategoryFromLabel(fd.tip_proprietate) || 'apartament';
  const isAp = ['apartament', 'studio_apartment'].includes(category);
  const isTeren = ['Teren', 'Fermă'].includes(fd.tip_proprietate);
  const isComercial = ['Spațiu comercial', 'Hală', 'Industrial', 'Birou'].includes(fd.tip_proprietate);
  const hasEtaje = isAp || fd.tip_proprietate === 'Birou' || isComercial;
  const showField = (field: Parameters<typeof isPropertyFieldVisible>[1]) =>
    isPropertyFieldVisible(category, field);
  const requiredField = (field: Parameters<typeof isPropertyFieldRequired>[1]) =>
    isPropertyFieldRequired(category, field);
  const cities = getCities(fd.judet);

  // Coordinates are valid only when both are present, numeric and non-zero
  // (OLX's Mercury geocoder rejects 0,0; an empty string parses to 0).
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
      if (requiredField('rooms') && (!fd.nr_camere || +fd.nr_camere < 1)) { setError('Numărul de camere este obligatoriu pentru acest tip de proprietate'); return false; }
      if (requiredField('surface_land') && (!fd.sup_teren || +fd.sup_teren <= 0)) { setError('Suprafața terenului este obligatorie pentru acest tip de proprietate'); return false; }
      if (requiredField('surface_useful') && (!fd.sup_utila || +fd.sup_utila <= 0)) { setError('Suprafața utilă este obligatorie pentru acest tip de proprietate'); return false; }
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

  const removeExistingPhoto = (url: string) => {
    setExistingPhotos(p => p.filter(ph => ph !== url));
  };

  // ── Reordonare poze existente (drag & drop + butoane fallback) ──
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const reorderExisting = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    setExistingPhotos(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const movePhoto = (i: number, dir: -1 | 1) => {
    setExistingPhotos(prev => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const setAsMain = (i: number) => {
    setExistingPhotos(prev => {
      if (i <= 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(i, 1);
      next.unshift(moved);
      return next;
    });
  };

  const handleSave = async () => {
    // Safety net: the step bar lets users jump steps, bypassing per-step validation.
    // Re-check the OLX-mandatory data fields and jump to the first gap.
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
        teren: {
          intravilan: fd.intravilan, pot: fd.pot, cut: fd.cut,
          destinatie: fd.dest_teren, nr_fronturi: fd.nr_fronturi,
          deschidere: fd.deschidere, lungime: fd.lungime,
          latime: fd.latime, forma: fd.forma_teren,
        },
        comercial: {
          vitrina: fd.vitrina ? +fd.vitrina : null,
          inaltime: fd.inaltime_spatiu ? +fd.inaltime_spatiu : null,
          grupuri_sanitare: fd.grupuri_sanitare,
          acces_tir: fd.acces_tir, rampa: fd.rampa,
          putere_instalata: fd.putere_instalata,
        },
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

      // Update property
      const res = await fetch('/api/properties/update-full', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          id: params.id,
          title: fd.title,
          price: parseFloat(fd.price) || 0,
          currency: fd.currency,
          category,
          transaction: fd.tip_oferta === 'Închiriere' ? 'inchiriere' : 'vanzare',
          description: fd.descriere,
          county: fd.judet,
          city: fd.localitate,
          zone: fd.zona || fd.cartier,
          street: fd.strada,
          street_number: fd.numar,
          latitude: fd.lat ? parseFloat(fd.lat) : null,
          longitude: fd.lon ? parseFloat(fd.lon) : null,
          attributes,
          agent_id: fd.agent_id || null,
          owner_contact_id: selectedContactId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Eroare server');

      // Sincronizarea galeriei rulează și când toate fotografiile au fost șterse.
      const up = await uploadPropertyPhotos({
        propertyId: String(params.id),
        agencyId: agencyId || '',
        photos,
        token: session.access_token,
        replacePhotos: true,
        existingMedia: existingPhotos.map(url => ({
          url,
          alt_text: photoDetails[url]?.alt_text || '',
          description: photoDetails[url]?.description || null,
        })),
        enhance: enhancePhotos,
        onProgress: (done, total) => setStatus(`Se incarca pozele... ${done}/${total}`),
      });
      if (!up.ok) {
        setStatus('');
        setError(`Datele s-au salvat, dar pozele au eșuat: ${up.error}. Reîncearcă din editare.`);
        setLoading(false);
        return;
      }

      // Auto-unpublish from Storia/OLX when user turns off the checkbox
      if (origPubStoriaRef.current === true && !fd.pub_storia) {
        setStatus('Se retrage din Storia / OLX...');
        try {
          await fetch('/api/portals/storia/unpublish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ property_id: params.id }),
          });
        } catch { /* best-effort — user can also retract manually from property page */ }
      }

      // Auto-publish on Storia/OLX if checkbox is checked
      if (fd.pub_storia) {
        setStatus('Se publică pe Storia / OLX...');
        try {
          const pubRes = await fetch('/api/portals/storia/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ property_id: params.id }),
          });
          if (!pubRes.ok) {
            const pd = await pubRes.json().catch(() => ({}));
            alert(pd.error || 'Proprietatea s-a salvat, dar publicarea pe Storia a eșuat. Reîncearcă din pagina proprietății.');
          }
        } catch { alert('Proprietatea s-a salvat, dar publicarea pe Storia a eșuat (rețea). Reîncearcă din pagina proprietății.'); }
      }

      // Auto-publish pe Facebook Page dacă bifa e activă
      if (fd.pub_facebook) {
        setStatus('Se publică pe Facebook...');
        try {
          const fbRes = await fetch('/api/portals/facebook/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ property_id: params.id }),
          });
          if (!fbRes.ok) {
            const fd2 = await fbRes.json().catch(() => ({}));
            alert(fd2.error || 'Proprietatea s-a salvat, dar postarea pe Facebook a eșuat.');
          }
        } catch { alert('Proprietatea s-a salvat, dar postarea pe Facebook a eșuat (rețea).'); }
      }

      router.push(`/properties/${params.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <p className="text-gray-500">Se incarca...</p>
      </div>
    );
  }

  const STEPS = ['Date Generale', 'Localizare', 'Proprietar', 'Suprafețe', 'Construcție', 'Dotări', 'Media', 'Promovare'];

  return (
    <div className="mobile-form-page bg-gray-50 min-h-screen">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex justify-between items-center">
        <h2 className="text-lg font-bold" style={{ color: '#0E6B54' }}>Editeaza Proprietate</h2>
        <button onClick={() => router.back()} className="p-1 hover:bg-gray-100 rounded text-xl">✕</button>
      </div>

      <div className="px-4 sm:px-6 py-3 flex gap-1 border-b border-gray-100 flex-shrink-0 overflow-x-auto bg-white">
        {STEPS.map((label, i) => {
          const s = i + 1;
          return (
            <div key={s} className="flex items-center">
              <button type="button" onClick={() => setStep(s)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${s === step ? 'text-white' : s < step ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100' : 'text-gray-400 bg-gray-100 hover:bg-gray-200'}`}
                style={s === step ? { backgroundColor: '#0E6B54' } : {}}>
                <span className="font-bold">{s}</span>
                <span className="hidden sm:inline">{label}</span>
              </button>
              {s < 8 && <div className={`w-4 h-px mx-0.5 ${s < step ? 'bg-emerald-400' : 'bg-gray-200'}`} />}
            </div>
          );
        })}
      </div>

      <div className="flex-1 px-4 sm:px-6 py-4 max-w-4xl mx-auto pb-24 sm:pb-20">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-sm">{error}</div>
        )}

        {/* ── Step 1: Date Generale ── */}
        {step === 1 && (
          <div className="space-y-3 bg-white rounded-lg p-6">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-medium text-gray-600">Titlu anunț *</label>
                <span className={`text-xs ${fd.title.length > 60 ? 'text-orange-500' : 'text-gray-400'}`}>{fd.title.length}/70</span>
              </div>
              <input type="text" value={fd.title} onChange={e => set('title', e.target.value.slice(0, 70))} maxLength={70}
                placeholder="ex: Apartament 3 camere, decomandat, vedere panoramică"
                className={ic} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <F label="Tip proprietate *">
                <select value={fd.tip_proprietate} onChange={e => {
                  if (e.target.value !== fd.tip_proprietate) {
                    setTypeChangeNotice('Câmpurile vizibile au fost adaptate. Valorile istorice din câmpurile ascunse rămân păstrate și nu se șterg automat.');
                  }
                  set('tip_proprietate', e.target.value);
                }} className={sc}>
                  {TIP_PROPRIETATE.map(t => <option key={t}>{t}</option>)}
                </select>
              </F>
              <F label="Cod intern">
                <input value={fd.internal_code} readOnly className={ic + ' bg-gray-50 text-gray-500 font-mono'} />
              </F>
            </div>
            {typeChangeNotice && (
              <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <span>{typeChangeNotice}</span>
                <button type="button" onClick={() => setTypeChangeNotice('')} className="font-semibold">Am înțeles</button>
              </div>
            )}

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
          <div className="space-y-3 bg-white rounded-lg p-6">
            <div className="grid grid-cols-2 gap-3">
              <F label="Județ *">
                <AutoComplete value={fd.judet} onChange={v => { set('judet', v); set('localitate', ''); }}
                  options={JUDETE} placeholder="ex: Cluj" />
              </F>
              <F label="Localitate *">
                <AutoComplete value={fd.localitate} onChange={v => set('localitate', v)}
                  options={cities.length > 0 ? cities : JUDETE}
                  placeholder={fd.judet ? 'ex: Cluj-Napoca' : 'Selectați județului mai întâi'} />
              </F>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Plasează pin pe hartă (completează automat coordonatele)</p>
              <MapPicker lat={fd.lat} lon={fd.lon} onCoords={(lat, lon) => { set('lat', lat); set('lon', lon); }} />
            </div>

            <F label="Zonă">
              <input type="text" value={fd.zona} onChange={e => set('zona', e.target.value)}
                placeholder="ex: Centru" className={ic} />
            </F>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <F label="Stradă">
                  <input type="text" value={fd.strada} onChange={e => set('strada', e.target.value)}
                    onBlur={async () => {
                      if (!fd.strada || (fd.lat && fd.lon)) return;
                      const coords = await geocodeAddress(fd.strada, fd.numar, fd.localitate, fd.judet);
                      if (coords) { set('lat', coords.lat); set('lon', coords.lon); }
                    }}
                    placeholder="ex: Str. Eroilor" className={ic} />
                </F>
              </div>
              <F label="Număr">
                <input type="text" value={fd.numar} onChange={e => set('numar', e.target.value)}
                  onBlur={async () => {
                    if (!fd.strada) return;
                    const coords = await geocodeAddress(fd.strada, fd.numar, fd.localitate, fd.judet);
                    if (coords) { set('lat', coords.lat); set('lon', coords.lon); }
                  }}
                  placeholder="12" className={ic} />
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
              <F label="Latitudine *">
                <input type="text" value={fd.lat} onChange={e => set('lat', e.target.value)}
                  placeholder="46.7712" className={ic} />
              </F>
              <F label="Longitudine *">
                <input type="text" value={fd.lon} onChange={e => set('lon', e.target.value)}
                  placeholder="23.5236" className={ic} />
              </F>
            </div>

            <Chk label="Ascunde adresa exactă pe anunț" checked={fd.ascunde_adresa} onChange={v => set('ascunde_adresa', v)} />
          </div>
        )}

        {/* ── Step 3: Proprietar ── */}
        {step === 3 && (
          <div className="space-y-3 bg-white rounded-lg p-6">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-2">Caută contact existent</label>
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
          <div className="space-y-3 bg-white rounded-lg p-6">
            <SH title="Suprafețe (m²)" />
            <div className="grid grid-cols-3 gap-3">
              {showField('surface_useful') && <F label={`Suprafață utilă${requiredField('surface_useful') ? ' *' : ''}`}><input type="number" value={fd.sup_utila} onChange={e => set('sup_utila', e.target.value)} placeholder="mp" min="0" className={ic} /></F>}
              {showField('surface_built') && <F label="Suprafață construită"><input type="number" value={fd.sup_construita} onChange={e => set('sup_construita', e.target.value)} placeholder="mp" min="0" className={ic} /></F>}
              {showField('surface_total') && <F label="Suprafață totală"><input type="number" value={fd.sup_totala} onChange={e => set('sup_totala', e.target.value)} placeholder="mp" min="0" className={ic} /></F>}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {showField('surface_land') && <F label={`Suprafață teren${requiredField('surface_land') ? ' *' : ''}`}><input type="number" value={fd.sup_teren} onChange={e => set('sup_teren', e.target.value)} placeholder="mp" min="0" className={ic} /></F>}
              {showField('surface_yard') && <F label="Suprafață curte"><input type="number" value={fd.sup_curte} onChange={e => set('sup_curte', e.target.value)} placeholder="mp" min="0" className={ic} /></F>}
              {showField('surface_balcony') && <F label="Suprafață balcon"><input type="number" value={fd.sup_balcon} onChange={e => set('sup_balcon', e.target.value)} placeholder="mp" min="0" className={ic} /></F>}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {showField('surface_terrace') && <F label="Suprafață terasă"><input type="number" value={fd.sup_terasa} onChange={e => set('sup_terasa', e.target.value)} placeholder="mp" min="0" className={ic} /></F>}
              {showField('surface_cellar') && <F label="Suprafață pivniță"><input type="number" value={fd.sup_pivnita} onChange={e => set('sup_pivnita', e.target.value)} placeholder="mp" min="0" className={ic} /></F>}
              {showField('surface_garage') && <F label="Suprafață garaj (mp)"><input type="number" value={fd.sup_garaj_mp} onChange={e => set('sup_garaj_mp', e.target.value)} placeholder="mp" min="0" className={ic} /></F>}
            </div>
            {showField('street_frontage') && <div className="grid grid-cols-2 gap-3">
              <F label="Front stradal (m)"><input type="number" value={fd.front_stradal} onChange={e => set('front_stradal', e.target.value)} placeholder="m" min="0" className={ic} /></F>
            </div>}

            {showField('rooms') && (
              <>
                <SH title="Compartimentare" />
                <div className="grid grid-cols-3 gap-3">
                  <F label={`Camere${requiredField('rooms') ? ' *' : ''}`}><input type="number" value={fd.nr_camere} onChange={e => set('nr_camere', e.target.value)} placeholder="nr" min="0" className={ic} /></F>
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
          <div className="space-y-3 bg-white rounded-lg p-6">
            {showField('building') && <>
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
            </>}

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

            {showField('heating') && <>
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
            </>}
          </div>
        )}

        {/* ── Step 6: Finisaje & Dotari ── */}
        {step === 6 && (
          <div className="space-y-3 bg-white rounded-lg p-6">
            {showField('finishes') ? <>
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
            <F label="Pereți"><TagPicker value={fd.pereti} onChange={v => set('pereti', v)} options={OPT_PERETI} /></F>
            <F label="Podele"><TagPicker value={fd.podele} onChange={v => set('podele', v)} options={OPT_PODELE} /></F>
            <div className="grid grid-cols-2 gap-3">
              <F label="Tâmplărie"><TagPicker value={fd.tamplarie} onChange={v => set('tamplarie', v)} options={OPT_TAMPL} /></F>
              <F label="Ușă intrare"><TagPicker value={fd.usa_intrare} onChange={v => set('usa_intrare', v)} options={OPT_USA} /></F>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <F label="Acoperiș"><TagPicker value={fd.acoperis} onChange={v => set('acoperis', v)} options={OPT_ACOPERI} /></F>
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
            </> : (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                Pentru acest tip de proprietate nu sunt necesare finisaje interioare. Datele completate anterior rămân păstrate.
              </p>
            )}
          </div>
        )}

        {/* ── Step 7: Media & Marketing & Date interne ── */}
        {step === 7 && (
          <div className="space-y-3 bg-white rounded-lg p-6">
            <SH title="Poze proprietate" />
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotos} />
            <div onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-5 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition-colors">
              <Upload size={24} className="mx-auto text-gray-400 mb-1" />
              <p className="text-sm text-gray-600">Click pentru a adăuga poze</p>
              <p className="text-xs text-gray-400 mt-0.5">JPG, PNG, WEBP — max 10MB</p>
            </div>
            {/* Auto-îmbunătățire — se aplică doar pozelor NOI adăugate */}
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 select-none bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <input type="checkbox" checked={enhancePhotos} onChange={e => setEnhancePhotos(e.target.checked)}
                className="w-4 h-4 accent-amber-600" />
              <span>✨ <span className="font-medium">Îmbunătățește pozele noi</span> — lumini, contrast și claritate optimizate (doar pozele adăugate acum)</span>
            </label>

            {existingPhotos.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <GripVertical size={13} className="text-gray-400" />
                    <p className="text-xs font-medium text-gray-600">
                      Poze existente — trage pentru a reordona. Prima poză este cea principală.
                    </p>
                  </div>
                  <button type="button" disabled={photoAnalyzing}
                    onClick={async () => {
                      setPhotoAnalyzing(true);
                      setPhotoAnalysisError('');
                      try {
                        const { data: { session } } = await supabase.auth.getSession();
                        if (!session) throw new Error('Nu ești autentificat');
                        const res = await fetch('/api/properties/analyze-photos', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                          body: JSON.stringify({ photos: existingPhotos.slice(0, 10).map(url => ({ url })) }),
                        });
                        const d = await res.json();
                        if (!res.ok) throw new Error(d.error || 'Eroare server');
                        setPhotoAnalyses(d);
                      } catch (err) {
                        setPhotoAnalysisError(err instanceof Error ? err.message : 'Eroare la analiză');
                      } finally {
                        setPhotoAnalyzing(false);
                      }
                    }}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors">
                    {photoAnalyzing ? <><span className="animate-spin">⏳</span> Analizez...</> : <><span>✨</span> Analizează cu AI</>}
                  </button>
                </div>
                {photoAnalysisError && <p className="text-xs text-red-600">{photoAnalysisError}</p>}
                {photoAnalyses?.overall_observations && (
                  <p className="text-xs text-violet-800 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
                    <span className="font-semibold">AI: </span>{photoAnalyses.overall_observations}
                  </p>
                )}
                <div className="grid grid-cols-4 gap-2">
                  {existingPhotos.map((url, i) => {
                    const label = photoAnalyses?.photos?.[i]?.room_type;
                    return (
                      <div
                        key={url}
                        draggable
                        onDragStart={() => setDragIndex(i)}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); if (dragIndex !== null) reorderExisting(dragIndex, i); setDragIndex(null); }}
                        onDragEnd={() => setDragIndex(null)}
                        className={`relative group rounded-lg border bg-white cursor-move transition-all ${
                          dragIndex === i ? 'border-emerald-500 ring-2 ring-emerald-300 opacity-60' : 'border-gray-200 hover:border-emerald-300'
                        }`}
                      >
                        <div className="relative">
                        <Image src={url} alt={photoDetails[url]?.alt_text || ''} width={320} height={160}
                          className="w-full h-20 object-cover rounded-t-lg pointer-events-none" />

                        {/* Order index */}
                        <span className="absolute top-1 left-1 bg-black/60 text-white text-[10px] font-semibold w-4 h-4 flex items-center justify-center rounded-full">
                          {i + 1}
                        </span>

                        {/* Room type label or Main badge */}
                        {label ? (
                          <span className="absolute bottom-1 left-1 right-1 bg-black/70 text-white text-[10px] px-1 py-0.5 rounded text-center truncate">{label}</span>
                        ) : i === 0 ? (
                          <span className="absolute bottom-1 left-1 bg-emerald-600 text-white text-[10px] px-1 rounded flex items-center gap-0.5">
                            <Star size={9} /> Principală
                          </span>
                        ) : null}

                        {/* Hover controls */}
                        <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {i > 0 && (
                            <button type="button" title="Setează ca principală" onClick={() => setAsMain(i)}
                              className="bg-emerald-600 text-white rounded-full p-0.5 hover:bg-emerald-700">
                              <Star size={11} />
                            </button>
                          )}
                          <button type="button" title="Șterge" onClick={() => removeExistingPhoto(url)}
                            className="bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600">
                            <Trash2 size={11} />
                          </button>
                        </div>

                        {/* Arrow fallback (mobile / no-drag) */}
                        <div className="absolute bottom-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button type="button" title="Mută stânga" disabled={i === 0} onClick={() => movePhoto(i, -1)}
                            className="bg-white/90 border border-gray-200 text-gray-700 rounded p-0.5 disabled:opacity-30 hover:bg-gray-50">
                            <ArrowLeft size={11} />
                          </button>
                          <button type="button" title="Mută dreapta" disabled={i === existingPhotos.length - 1} onClick={() => movePhoto(i, 1)}
                            className="bg-white/90 border border-gray-200 text-gray-700 rounded p-0.5 disabled:opacity-30 hover:bg-gray-50">
                            <ArrowRight size={11} />
                          </button>
                        </div>
                        </div>
                        <div className="space-y-1 p-1.5" onPointerDown={e => e.stopPropagation()}>
                          <input
                            type="text"
                            maxLength={160}
                            value={photoDetails[url]?.alt_text || ''}
                            onChange={e => setPhotoDetails(current => ({
                              ...current,
                              [url]: { ...current[url], alt_text: e.target.value, description: current[url]?.description || '' },
                            }))}
                            placeholder="Text ALT (ce se vede în fotografie)"
                            className="w-full rounded border border-gray-200 px-1.5 py-1 text-[10px] text-gray-700"
                          />
                          <input
                            type="text"
                            maxLength={500}
                            value={photoDetails[url]?.description || ''}
                            onChange={e => setPhotoDetails(current => ({
                              ...current,
                              [url]: { ...current[url], alt_text: current[url]?.alt_text || '', description: e.target.value },
                            }))}
                            placeholder="Descriere fotografie"
                            className="w-full rounded border border-gray-200 px-1.5 py-1 text-[10px] text-gray-700"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {previews.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Poze noi</p>
                <div className="grid grid-cols-4 gap-2">
                  {previews.map((p, i) => (
                    <div key={i} className="relative group">
                      <Image src={p} alt={`Fotografie nouă ${i + 1}`} width={320} height={160} unoptimized
                        className="w-full h-20 object-cover rounded-lg border border-gray-200" />
                      <button onClick={() => removePhoto(i)}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                  <div onClick={() => fileRef.current?.click()}
                    className="h-20 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-emerald-400">
                    <ImageIcon size={20} className="text-gray-400" />
                  </div>
                </div>
              </div>
            )}

            <SH title="Descriere" />
            <F label="Descriere (RO)">
              <textarea value={fd.descriere} onChange={e => set('descriere', e.target.value)}
                placeholder="Descriere detaliată în română..." rows={4} className={ic} />
            </F>
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

            {/* AI Description Generator */}
            <div className="border border-dashed border-emerald-300 rounded-lg p-3 space-y-2 bg-emerald-50/40">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-emerald-800">Generare automată cu AI</p>
                <button type="button" disabled={aiLoading}
                  onClick={async () => {
                    setAiLoading(true);
                    setAiError('');
                    setAiDescriptions(null);
                    try {
                      const { data: { session } } = await supabase.auth.getSession();
                      if (!session) throw new Error('Nu ești autentificat');
                      const res = await fetch('/api/properties/generate-description', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                        body: JSON.stringify({
                          tip_proprietate: fd.tip_proprietate, tip_oferta: fd.tip_oferta,
                          price: parseFloat(fd.price) || 0, currency: fd.currency,
                          negociabil: fd.negociabil,
                          judet: fd.judet, localitate: fd.localitate,
                          cartier: fd.cartier, zona: fd.zona,
                          strada: fd.strada, numar: fd.numar,
                          nr_camere: fd.nr_camere ? +fd.nr_camere : null,
                          nr_dormitoare: fd.nr_dormitoare ? +fd.nr_dormitoare : null,
                          nr_bai: fd.nr_bai ? +fd.nr_bai : null,
                          nr_balcoane: fd.nr_balcoane ? +fd.nr_balcoane : null,
                          nr_terase: fd.nr_terase ? +fd.nr_terase : null,
                          nr_parcare: fd.nr_parcare ? +fd.nr_parcare : null,
                          sup_utila: fd.sup_utila ? +fd.sup_utila : null,
                          sup_construita: fd.sup_construita ? +fd.sup_construita : null,
                          sup_teren: fd.sup_teren ? +fd.sup_teren : null,
                          sup_curte: fd.sup_curte ? +fd.sup_curte : null,
                          sup_balcon: fd.sup_balcon ? +fd.sup_balcon : null,
                          sup_terasa: fd.sup_terasa ? +fd.sup_terasa : null,
                          etaj: fd.etaj ? +fd.etaj : null,
                          nr_etaje: fd.nr_etaje ? +fd.nr_etaje : null,
                          parter: fd.parter, ultimul_etaj: fd.ultimul_etaj,
                          an_constructie: fd.an_constructie ? +fd.an_constructie : null,
                          an_renovare: fd.an_renovare ? +fd.an_renovare : null,
                          structura: fd.structura, regim_inaltime: fd.regim_inaltime,
                          compartimentare: fd.compartimentare, confort: fd.confort,
                          clasa_energetica: fd.clasa_energetica, risc_seismic: fd.risc_seismic,
                          finisaje: {
                            stare: fd.stare, pereti: fd.pereti, podele: fd.podele,
                            tamplarie: fd.tamplarie, usa_intrare: fd.usa_intrare, acoperis: fd.acoperis,
                          },
                          incalzire: {
                            centrala_proprie: fd.inc_centrala_proprie, centrala_bloc: fd.inc_centrala_bloc,
                            termoficare: fd.inc_termoficare, pardoseala: fd.inc_pardoseala,
                            semineu: fd.inc_semineu, aer_conditionat: fd.aer_conditionat, nr_ac: fd.nr_ac ? +fd.nr_ac : null,
                          },
                          utilitati: {
                            curent: fd.util_curent, apa: fd.util_apa, canalizare: fd.util_canal,
                            gaz: fd.util_gaz, internet: fd.util_internet, cablu: fd.util_cablu,
                            fotovoltaice: fd.util_fotovoltaice, trifazic: fd.util_trifazic,
                          },
                          dotari: {
                            lift: fd.dot_lift, interfon: fd.dot_interfon, videointerfon: fd.dot_videointerfon,
                            alarma: fd.dot_alarma, supraveghere: fd.dot_supraveghere,
                            curte: fd.dot_curte, gradina: fd.dot_gradina, piscina: fd.dot_piscina,
                            foisor: fd.dot_foisor, garaj: fd.dot_garaj, boxa: fd.dot_boxa,
                            dressing: fd.dot_dressing, debara: fd.dot_debara,
                            jacuzzi: fd.dot_jacuzzi, sauna: fd.dot_sauna, terasa: fd.dot_terasa,
                          },
                          mobilat: fd.mobilat, utilat: fd.utilat,
                          descriere: fd.descriere,
                          photo_analyses: photoAnalyses ?? undefined,
                        }),
                      });
                      const d = await res.json();
                      if (!res.ok) throw new Error(d.error || 'Eroare server');
                      if (d.descriptions?.titlu_seo && !fd.titlu_seo) set('titlu_seo', d.descriptions.titlu_seo);
                      if (d.descriptions?.meta_desc && !fd.meta_desc) set('meta_desc', d.descriptions.meta_desc);
                      setAiDescriptions(d.descriptions ?? d);
                    } catch (err) {
                      setAiError(err instanceof Error ? err.message : 'Eroare la generare');
                    } finally {
                      setAiLoading(false);
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-white text-xs rounded-lg disabled:opacity-50 hover:opacity-90 transition-colors"
                  style={{ backgroundColor: '#B57514' }}>
                  {aiLoading ? <><span className="animate-spin inline-block">⏳</span> Generez...</> : <><span>✨</span> Generează descriere AI</>}
                </button>
              </div>
              {aiError && <p className="text-xs text-red-600">{aiError}</p>}
              {aiDescriptions && (
                <div className="space-y-2 mt-1">
                  {aiDescriptions['titlu_seo'] && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-emerald-700">Titlu SEO</span>
                        <div className="flex gap-1">
                          <button type="button" onClick={() => set('titlu_seo', aiDescriptions['titlu_seo'] || '')}
                            className="text-xs px-2 py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-700">Folosește</button>
                          <button type="button" onClick={() => { navigator.clipboard.writeText(aiDescriptions['titlu_seo'] || ''); setCopiedKey('titlu_seo'); setTimeout(() => setCopiedKey(''), 2000); }}
                            className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center gap-1">
                            {copiedKey === 'titlu_seo' ? <CheckCircle size={11} className="text-green-600" /> : <Copy size={11} />}
                            {copiedKey === 'titlu_seo' ? 'Copiat!' : 'Copiază'}
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-800 font-medium">{aiDescriptions['titlu_seo']}</p>
                    </div>
                  )}
                  {aiDescriptions['meta_desc'] && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-blue-700">Meta description (Google)</span>
                        <div className="flex gap-1">
                          <button type="button" onClick={() => set('meta_desc', aiDescriptions['meta_desc'] || '')}
                            className="text-xs px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700">Folosește</button>
                          <button type="button" onClick={() => { navigator.clipboard.writeText(aiDescriptions['meta_desc'] || ''); setCopiedKey('meta_desc'); setTimeout(() => setCopiedKey(''), 2000); }}
                            className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center gap-1">
                            {copiedKey === 'meta_desc' ? <CheckCircle size={11} className="text-green-600" /> : <Copy size={11} />}
                            {copiedKey === 'meta_desc' ? 'Copiat!' : 'Copiază'}
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-700">{aiDescriptions['meta_desc']}</p>
                    </div>
                  )}
                  {aiDescriptions['seo'] && (
                    <div className="bg-white border-2 border-emerald-300 rounded-lg p-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-emerald-800">Descriere SEO completă (700-1200 cuvinte)</span>
                        <div className="flex gap-1">
                          <button type="button" onClick={() => set('descriere', aiDescriptions['seo'] || '')}
                            className="text-xs px-2 py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-700">Folosește</button>
                          <button type="button" onClick={() => { navigator.clipboard.writeText(aiDescriptions['seo'] || ''); setCopiedKey('seo'); setTimeout(() => setCopiedKey(''), 2000); }}
                            className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center gap-1">
                            {copiedKey === 'seo' ? <CheckCircle size={11} className="text-green-600" /> : <Copy size={11} />}
                            {copiedKey === 'seo' ? 'Copiat!' : 'Copiază'}
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-700 line-clamp-4 whitespace-pre-line">{aiDescriptions['seo']}</p>
                    </div>
                  )}
                  {[
                    { key: 'completa', label: 'Descriere completă' },
                    { key: 'scurta', label: 'Scurtă' },
                    { key: 'facebook', label: 'Facebook' },
                    { key: 'olx', label: 'OLX' },
                    { key: 'storia', label: 'Storia' },
                  ].filter(({ key }) => aiDescriptions[key]).map(({ key, label }) => (
                    <div key={key} className="bg-white border border-gray-200 rounded-lg p-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-gray-600">{label}</span>
                        <div className="flex gap-1">
                          <button type="button" onClick={() => set('descriere', aiDescriptions[key] || '')}
                            className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200">Folosește</button>
                          <button type="button" onClick={() => { navigator.clipboard.writeText(aiDescriptions[key] || ''); setCopiedKey(key); setTimeout(() => setCopiedKey(''), 2000); }}
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

          </div>
        )}

        {/* ── Step 8: Promovare ── */}
        {step === 8 && (
          <div className="space-y-3 bg-white rounded-lg p-6">
            <SH title="Publicare (opțional)" />
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700 mb-2">
              Proprietatea se salvează indiferent. Poți publica oricând ulterior.
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'pub_site', label: 'Site Propriu' },
                { key: 'pub_imobiliare', label: 'Imobiliare.ro' },
                { key: 'pub_facebook', label: 'Facebook' },
              ].map(({ key, label }) => (
                <Chk key={key} label={label} checked={fd[key as keyof FD] as boolean} onChange={v => set(key as keyof FD, v)} />
              ))}
              <Chk
                label="Storia / OLX"
                checked={fd.pub_storia}
                onChange={v => { set('pub_storia', v); set('pub_olx', v); }}
              />
            </div>

            <SH title="Date interne agenție" />
            <div className="grid grid-cols-2 gap-3">
              <F label="Agent responsabil">
                <select value={fd.agent_id} onChange={e => set('agent_id', e.target.value)} className={sc}>
                  <option value="">— Neasignat —</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
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

      <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-0 right-0 z-30 flex gap-2 border-t border-gray-200 bg-white px-4 py-3 sm:gap-3 sm:px-6 sm:py-4 md:bottom-0 md:left-64">
        {step > 1 && (
          <button onClick={prev}
            className="mobile-touch-target flex flex-1 items-center justify-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors hover:bg-gray-50 sm:flex-none sm:px-4">
            <ChevronLeft size={16} /> Înapoi
          </button>
        )}
        <div className="hidden flex-1 sm:block" />
        <button onClick={handleSave} disabled={loading}
          className="mobile-touch-target flex-1 rounded-lg border border-emerald-700 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50 sm:flex-none sm:px-5">
          {loading ? (status || 'Se salvează...') : 'Salvează'}
        </button>
        {step < 8 ? (
          <button onClick={next}
            className="mobile-touch-target flex flex-1 items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 sm:flex-none sm:px-5"
            style={{ backgroundColor: '#0E6B54' }}>
            Înainte <ChevronRight size={16} />
          </button>
        ) : (
          <button onClick={handleSave} disabled={loading}
            className="mobile-touch-target flex-1 rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50 sm:flex-none sm:px-6"
            style={{ backgroundColor: '#0E6B54' }}>
            {loading ? (status || 'Se salvează...') : 'Salvează Proprietatea'}
          </button>
        )}
      </div>

      <div className="h-20" />
    </div>
  );
}
