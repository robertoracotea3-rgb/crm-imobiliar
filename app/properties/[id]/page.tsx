'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import {
  ChevronLeft, Edit, Trash2, MapPin, DollarSign, Calendar,
  Home, Building2, Ruler, Zap, Paintbrush, Trees, Megaphone, User, FileText,
  Target, CheckCircle, AlertCircle, ExternalLink, ChevronDown,
  Globe, Loader2, Link2Off,
} from 'lucide-react';
import { PropertyMapView } from '@/components/PropertyMapView';
import { PropertyDocuments } from '@/components/PropertyDocuments';
import { PropertyHistory } from '@/components/PropertyHistory';

interface Property {
  id: string;
  internal_code: string;
  title: string;
  city?: string; county?: string; street?: string; street_number?: string;
  currency?: string; price: number | null; description: string;
  category: string; created_at: string; updated_at: string;
  attributes?: Record<string, any>;
  [key: string]: any;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex justify-between items-start py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-500 flex-shrink-0 w-44">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value}</span>
    </div>
  );
}

function BoolRow({ label, value }: { label: string; value?: boolean }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-medium">
      ✓ {label}
    </span>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-emerald-600">{icon}</span>
        <span className="font-semibold text-gray-800 text-sm flex-1">{title}</span>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-5 pb-4 pt-1">{children}</div>}
    </div>
  );
}

// ─── main ────────────────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  facebook: 'Facebook', olx: 'OLX', storia: 'Storia',
  imobiliare: 'Imobiliare.ro', banner: 'Banner',
  site_propriu: 'Site propriu', recomandare: 'Recomandare', altul: 'Altul',
};

const STATUS_LABELS: Record<string, string> = {
  activa: 'Activă', rezervata: 'Rezervată', tranzactionata: 'Tranzacționată',
  vanduta_noi: 'Vândută de noi', vanduta_altii: 'Vândută de alții',
  inchiriata: 'Închiriată', retrasa: 'Retrasă', expirata: 'Expirată',
  draft: 'Draft', arhivata: 'Arhivată',
};
const STATUS_COLORS: Record<string, string> = {
  activa: 'bg-emerald-100 text-emerald-800', rezervata: 'bg-blue-100 text-blue-800',
  tranzactionata: 'bg-purple-100 text-purple-800', vanduta_noi: 'bg-green-100 text-green-800',
  vanduta_altii: 'bg-teal-100 text-teal-800', inchiriata: 'bg-indigo-100 text-indigo-800',
  retrasa: 'bg-gray-100 text-gray-600', expirata: 'bg-orange-100 text-orange-700',
  draft: 'bg-yellow-100 text-yellow-800', arhivata: 'bg-red-100 text-red-700',
};

export default function PropertyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [matchedDemands, setMatchedDemands] = useState<any[] | null>(null);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  // Storia / OLX publishing
  interface StoriaListing { external_id?: string; status: string; advert_url?: string; error_message?: string; last_sync_at?: string }
  const [storiaListing, setStoriaListing] = useState<StoriaListing | null | undefined>(undefined);
  const [storiaConnected, setStoriaConnected] = useState(false);
  const [storiaPublishing, setStoriaPublishing] = useState(false);
  const [storiaUnpublishing, setStoriaUnpublishing] = useState(false);

  useEffect(() => { fetchProperty(); }, [params.id]);

  const fetchProperty = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Nu esti autentificat'); return; }
      const res = await fetch(`/api/properties/get?id=${params.id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setProperty(d.property);
      fetchMatchedDemands(session.access_token);
      fetchStoriaStatus(session.access_token);
    } catch (err) {
      setError('Nu am putut incarca proprietatea');
    } finally {
      setLoading(false);
    }
  };

  const fetchStoriaStatus = async (tok: string) => {
    const res = await fetch(`/api/portals/storia/status?property_id=${params.id}`, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    if (!res.ok) return;
    const d = await res.json();
    setStoriaConnected(d.connected && d.token_valid);
    setStoriaListing(d.listing || null);
  };

  const handleStoriaPublish = async () => {
    setStoriaPublishing(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setStoriaPublishing(false); return; }
    try {
      const res = await fetch('/api/portals/storia/publish', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: params.id }),
      });
      const d = await res.json();
      if (!res.ok) {
        alert('Eroare: ' + (d.error || JSON.stringify(d.details || '')));
      } else {
        fetchStoriaStatus(session.access_token);
      }
    } finally {
      setStoriaPublishing(false);
    }
  };

  const handleStoriaUnpublish = async () => {
    if (!confirm('Ștergi anunțul de pe Storia / OLX?')) return;
    setStoriaUnpublishing(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setStoriaUnpublishing(false); return; }
    try {
      const res = await fetch('/api/portals/storia/unpublish', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: params.id }),
      });
      const d = await res.json();
      if (!res.ok) alert('Eroare: ' + (d.error || ''));
      else fetchStoriaStatus(session.access_token);
    } finally {
      setStoriaUnpublishing(false);
    }
  };

  const handleDelete = async () => {
    if (!property) return;
    const confirmed = window.confirm(`Ești sigur că vrei să ștergi "${property.title}"? Această acțiune nu poate fi anulată.`);
    if (!confirmed) return;
    try {
      setDeleting(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sesiune expirată');
      const res = await fetch(`/api/properties/delete?id=${params.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      router.push('/properties');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Eroare la ștergere');
      setDeleting(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!property) return;
    setShowStatusMenu(false);
    try {
      setStatusChanging(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sesiune expirată');
      const res = await fetch('/api/properties/status', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: params.id, status: newStatus }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setProperty(p => p ? { ...p, status: newStatus } : p);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Eroare la schimbare status');
    } finally {
      setStatusChanging(false);
    }
  };

  const fetchMatchedDemands = async (token: string) => {
    try {
      setLoadingMatches(true);
      const res = await fetch(`/api/demands/match-for-property?property_id=${params.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (res.ok) setMatchedDemands(d.matches || []);
    } catch {
      // non-blocking — just don't show
    } finally {
      setLoadingMatches(false);
    }
  };

  if (loading) return <div className="p-8 text-gray-400">Se incarca...</div>;
  if (error || !property) return (
    <div className="p-8">
      <button onClick={() => router.back()} className="flex items-center gap-2 mb-4 text-gray-600"><ChevronLeft size={18} />Inapoi</button>
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">{error || 'Proprietate negasita'}</div>
    </div>
  );

  const a = property.attributes || {};
  const fmt = (d: string) => new Date(d).toLocaleDateString('ro-RO');
  const yn = (v: boolean | undefined) => v ? 'Da' : undefined;

  // Coordonate pentru hartă: preferă attributes.lat/lon, apoi coloanele latitude/longitude.
  const pickCoord = (...vals: unknown[]): number => {
    for (const v of vals) {
      const n = parseFloat(String(v));
      if (Number.isFinite(n) && n !== 0) return n;
    }
    return NaN;
  };
  const mapLat = pickCoord(a.lat, property.latitude);
  const mapLon = pickCoord(a.lon, property.longitude);

  // Booleans grouped
  const utilitati = [
    a.utilitati?.curent && 'Curent', a.utilitati?.apa && 'Apa',
    a.utilitati?.canalizare && 'Canalizare', a.utilitati?.gaz && 'Gaz',
    a.utilitati?.internet && 'Internet', a.utilitati?.cablu && 'Cablu TV',
    a.utilitati?.fosa && 'Fosa septica', a.utilitati?.put && 'Put',
  ].filter(Boolean) as string[];

  const incalzire = [
    a.incalzire?.centrala_proprie && 'Centrala proprie',
    a.incalzire?.centrala_bloc && 'Centrala de bloc',
    a.incalzire?.termoficare && 'Termoficare',
    a.incalzire?.pardoseala && 'Pardoseala calda',
    a.incalzire?.semineu && 'Semineu',
    a.incalzire?.aer_conditionat && 'Aer conditionat',
  ].filter(Boolean) as string[];

  const dotari = [
    a.dotari?.lift && 'Lift', a.dotari?.interfon && 'Interfon',
    a.dotari?.videointerfon && 'Videointerfon', a.dotari?.alarma && 'Alarma',
    a.dotari?.supraveghere && 'Supraveghere', a.dotari?.curte && 'Curte',
    a.dotari?.gradina && 'Gradina', a.dotari?.piscina && 'Piscina',
    a.dotari?.foisor && 'Foisor', a.dotari?.garaj && 'Garaj',
    a.dotari?.boxa && 'Boxa', a.dotari?.dressing && 'Dressing',
    a.dotari?.debara && 'Debara', a.dotari?.jacuzzi && 'Jacuzzi',
    a.dotari?.sauna && 'Sauna',
  ].filter(Boolean) as string[];

  const publicare = [
    a.publicare?.site && 'Site propriu', a.publicare?.imobiliare && 'Imobiliare.ro',
    a.publicare?.olx && 'OLX', a.publicare?.storia && 'Storia',
    a.publicare?.facebook && 'Facebook',
  ].filter(Boolean) as string[];

  const etajStr = (() => {
    const parts = [];
    if (a.parter) parts.push('Parter');
    if (a.mansarda) parts.push('Mansarda');
    if (a.demisol) parts.push('Demisol');
    if (a.subsol) parts.push('Subsol');
    if (a.ultimul_etaj) parts.push('Ultimul etaj');
    if (a.etaj) parts.push(`Etaj ${a.etaj}${a.nr_etaje ? `/${a.nr_etaje}` : ''}`);
    return parts.join(', ') || undefined;
  })();

  return (
    <ProtectedLayout>
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 text-sm">
          <ChevronLeft size={18} />Inapoi
        </button>
        <div className="flex gap-2 flex-wrap items-center">
          {/* Status badge + change menu */}
          <div className="relative">
            <button
              onClick={() => setShowStatusMenu(s => !s)}
              disabled={statusChanging}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border ${STATUS_COLORS[property.status || 'activa'] || 'bg-gray-100 text-gray-600'} border-transparent`}
            >
              {statusChanging ? 'Se schimbă...' : (STATUS_LABELS[property.status || 'activa'] || property.status)}
              <ChevronDown size={14} />
            </button>
            {showStatusMenu && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[170px]">
                {Object.entries(STATUS_LABELS).filter(([k]) => k !== (property.status || 'activa')).map(([k, v]) => (
                  <button key={k} onClick={() => handleStatusChange(k)}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 text-gray-700 border-b border-gray-50 last:border-0">
                    {v}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => router.push(`/properties/${params.id}/edit`)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 text-gray-700">
            <Edit size={16} />Editare rapida
          </button>
          <button onClick={() => router.push(`/properties/${params.id}/edit/complete`)}
            className="flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium hover:opacity-90"
            style={{ backgroundColor: '#0E6B54' }}>
            <Edit size={16} />Editare completa
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 flex items-center gap-2 text-sm disabled:opacity-50">
            <Trash2 size={16} />{deleting ? 'Se șterge...' : 'Șterge'}
          </button>
        </div>
      </div>

      {/* Hero card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{property.title}</h1>
            <p className="text-xs text-gray-400 font-mono mt-0.5">Cod: {property.internal_code}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900">
              {(property.price ?? 0).toLocaleString('ro-RO')} {property.currency || 'EUR'}
            </p>
            {a.negociabil && <p className="text-xs text-emerald-600 font-medium">Negociabil</p>}
          </div>
        </div>
        {/* Poze */}
        {(a.photos as string[])?.length > 0 && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
            {(a.photos as string[]).map((url: string, i: number) => (
              <div key={i} className="rounded-lg overflow-hidden bg-gray-100 aspect-video">
                <img src={url} alt={`Poza ${i + 1}`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">

        {/* 1 — Date generale */}
        <Section icon={<FileText size={17} />} title="Date generale">
          <div className="space-y-0.5">
            <Row label="Tip ofertă" value={a.tip_oferta} />
            <Row label="Tip proprietate" value={property.category?.replace(/_/g,' ')} />
            <Row label="Stare ofertă" value={a.stare_oferta} />
            <Row label="Moneda" value={property.currency} />
            <Row label="Comision" value={a.comision ? `${a.comision}%` : undefined} />
            <Row label="TVA inclus" value={yn(a.tva_inclus)} />
            <Row label="Negociabil" value={yn(a.negociabil)} />
            <Row label="Exclusivitate" value={yn(a.exclusivitate)} />
            <Row label="Data crearii" value={fmt(property.created_at)} />
            <Row label="Ultima actualizare" value={fmt(property.updated_at)} />
          </div>
        </Section>

        {/* 2 — Localizare */}
        <Section icon={<MapPin size={17} />} title="Localizare">
          <div className="space-y-0.5">
            <Row label="Judet" value={a.judet || property.county} />
            <Row label="Localitate" value={a.localitate || property.city} />
            <Row label="Cartier" value={a.cartier} />
            <Row label="Zona" value={a.zona} />
            <Row label="Strada" value={a.strada || property.street} />
            <Row label="Numar" value={a.numar || property.street_number} />
            <Row label="Bloc" value={a.bloc} />
            <Row label="Apartament" value={a.apartament_nr} />
            <Row label="Cod postal" value={a.cod_postal} />
            <Row label="GPS (lat, lon)" value={a.lat && a.lon ? `${a.lat}, ${a.lon}` : undefined} />
            <Row label="Adresa ascunsa" value={yn(a.ascunde_adresa)} />
          </div>
          {Number.isFinite(mapLat) && Number.isFinite(mapLon) && (
            <div className="mt-3">
              <PropertyMapView lat={mapLat} lon={mapLon} label={property.title} />
            </div>
          )}
        </Section>

        {/* 3 — Proprietar */}
        {(a.prop_nume || a.prop_tel || a.prop_email) && (
          <Section icon={<User size={17} />} title="Proprietar">
            <div className="space-y-0.5">
              <Row label="Nume" value={a.prop_nume} />
              <Row label="Telefon" value={a.prop_tel} />
              <Row label="Telefon 2" value={a.prop_tel2} />
              <Row label="Email" value={a.prop_email} />
              <Row label="CNP" value={a.prop_cnp} />
              <Row label="Adresa" value={a.prop_adresa} />
              <Row label="Observatii" value={a.prop_obs} />
            </div>
          </Section>
        )}

        {/* 4 — Suprafete & Camere */}
        <Section icon={<Ruler size={17} />} title="Suprafete & Camere">
          <div className="grid grid-cols-2 gap-x-8 gap-y-0.5">
            <div className="space-y-0.5">
              <Row label="Sup. utila" value={a.sup_utila ? `${a.sup_utila} mp` : undefined} />
              <Row label="Sup. construita" value={a.sup_construita ? `${a.sup_construita} mp` : undefined} />
              <Row label="Sup. totala" value={a.sup_totala ? `${a.sup_totala} mp` : undefined} />
              <Row label="Sup. teren" value={a.sup_teren ? `${a.sup_teren} mp` : undefined} />
              <Row label="Sup. curte" value={a.sup_curte ? `${a.sup_curte} mp` : undefined} />
              <Row label="Sup. balcon" value={a.sup_balcon ? `${a.sup_balcon} mp` : undefined} />
              <Row label="Sup. terasa" value={a.sup_terasa ? `${a.sup_terasa} mp` : undefined} />
              <Row label="Sup. pivnita" value={a.sup_pivnita ? `${a.sup_pivnita} mp` : undefined} />
              <Row label="Sup. garaj" value={a.sup_garaj_mp ? `${a.sup_garaj_mp} mp` : undefined} />
              <Row label="Front stradal" value={a.front_stradal ? `${a.front_stradal} m` : undefined} />
            </div>
            <div className="space-y-0.5">
              <Row label="Nr. camere" value={a.nr_camere} />
              <Row label="Nr. dormitoare" value={a.nr_dormitoare} />
              <Row label="Nr. bai" value={a.nr_bai} />
              <Row label="Nr. bucatarii" value={a.nr_bucatarii} />
              <Row label="Nr. balcoane" value={a.nr_balcoane} />
              <Row label="Nr. terase" value={a.nr_terase} />
              <Row label="Nr. parcare" value={a.nr_parcare} />
              <Row label="Etaj" value={etajStr} />
              <Row label="Compartimentare" value={a.compartimentare} />
              <Row label="Confort" value={a.confort} />
            </div>
          </div>
        </Section>

        {/* 5 — Constructie & Utilitati */}
        <Section icon={<Building2 size={17} />} title="Constructie & Utilitati">
          <div className="space-y-0.5 mb-3">
            <Row label="An constructie" value={a.an_constructie} />
            <Row label="An renovare" value={a.an_renovare} />
            <Row label="Structura" value={a.structura} />
            <Row label="Regim inaltime" value={a.regim_inaltime} />
            <Row label="Clasa energetica" value={a.clasa_energetica} />
            <Row label="Risc seismic" value={a.risc_seismic} />
            <Row label="Certificat energetic" value={yn(a.certificat_energetic)} />
          </div>
          {utilitati.length > 0 && (
            <div className="mb-2">
              <p className="text-xs text-gray-500 mb-1.5">Utilitati</p>
              <div className="flex flex-wrap gap-1.5">
                {utilitati.map(u => <BoolRow key={u} label={u} value={true} />)}
              </div>
            </div>
          )}
          {incalzire.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1.5">Incalzire</p>
              <div className="flex flex-wrap gap-1.5">
                {incalzire.map(i => <BoolRow key={i} label={i} value={true} />)}
              </div>
              {a.incalzire?.nr_ac && <Row label="Nr. aparate AC" value={a.incalzire.nr_ac} />}
            </div>
          )}
        </Section>

        {/* 6 — Finisaje & Dotari */}
        <Section icon={<Paintbrush size={17} />} title="Finisaje & Dotari">
          <div className="space-y-0.5 mb-3">
            <Row label="Stare" value={a.finisaje?.stare} />
            <Row label="Pereti" value={a.finisaje?.pereti} />
            <Row label="Podele" value={a.finisaje?.podele} />
            <Row label="Tamplarie" value={a.finisaje?.tamplarie} />
            <Row label="Usa intrare" value={a.finisaje?.usa_intrare} />
            <Row label="Acoperis" value={a.finisaje?.acoperis} />
            <Row label="Izolatie exterioara" value={yn(a.finisaje?.izolatie_ext)} />
            <Row label="Izolatie interioara" value={yn(a.finisaje?.izolatie_int)} />
            <Row label="Mobilat" value={a.mobilat} />
            <Row label="Utilat" value={a.utilat} />
          </div>
          {dotari.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1.5">Dotari</p>
              <div className="flex flex-wrap gap-1.5">
                {dotari.map(d => <BoolRow key={d} label={d} value={true} />)}
              </div>
            </div>
          )}
        </Section>

        {/* 7a — Teren */}
        {a.teren && Object.values(a.teren).some(Boolean) && (
          <Section icon={<Trees size={17} />} title="Specificatii Teren">
            <div className="space-y-0.5">
              <Row label="Intravilan" value={a.teren.intravilan} />
              <Row label="POT" value={a.teren.pot ? `${a.teren.pot}%` : undefined} />
              <Row label="CUT" value={a.teren.cut} />
              <Row label="Destinatie" value={a.teren.destinatie} />
              <Row label="Nr. fronturi" value={a.teren.nr_fronturi} />
              <Row label="Deschidere" value={a.teren.deschidere ? `${a.teren.deschidere} m` : undefined} />
              <Row label="Lungime" value={a.teren.lungime ? `${a.teren.lungime} m` : undefined} />
              <Row label="Latime" value={a.teren.latime ? `${a.teren.latime} m` : undefined} />
              <Row label="Forma teren" value={a.teren.forma} />
            </div>
          </Section>
        )}

        {/* 7b — Comercial */}
        {a.comercial && Object.values(a.comercial).some(Boolean) && (
          <Section icon={<Building2 size={17} />} title="Specificatii Comercial / Industrial">
            <div className="space-y-0.5">
              <Row label="Vitrina" value={a.comercial.vitrina ? `${a.comercial.vitrina} m` : undefined} />
              <Row label="Inaltime spatiu" value={a.comercial.inaltime ? `${a.comercial.inaltime} m` : undefined} />
              <Row label="Grupuri sanitare" value={a.comercial.grupuri_sanitare} />
              <Row label="Acces TIR" value={yn(a.comercial.acces_tir)} />
              <Row label="Rampa" value={yn(a.comercial.rampa)} />
              <Row label="Putere instalata" value={a.comercial.putere_instalata ? `${a.comercial.putere_instalata} kW` : undefined} />
            </div>
          </Section>
        )}

        {/* Media & Marketing */}
        {(property.description || a.descriere_en || a.tags || publicare.length > 0) && (
          <Section icon={<Megaphone size={17} />} title="Media & Marketing">
            {property.description && (
              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-1">Descriere (RO)</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{property.description}</p>
              </div>
            )}
            {a.descriere_en && (
              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-1">Descriere (EN)</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{a.descriere_en}</p>
              </div>
            )}
            <div className="space-y-0.5">
              <Row label="Titlu SEO" value={a.titlu_seo} />
              <Row label="Meta descriere" value={a.meta_desc} />
              <Row label="Tags" value={a.tags} />
            </div>
            {publicare.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-gray-500 mb-1.5">Publicat pe</p>
                <div className="flex flex-wrap gap-1.5">
                  {publicare.map(p => <BoolRow key={p} label={p} value={true} />)}
                </div>
              </div>
            )}
          </Section>
        )}

        {/* Date interne */}
        {(a.agent || a.data_preluarii || a.data_expirare || a.sursa_lead || a.obs_interne) && (
          <Section icon={<Zap size={17} />} title="Date interne">
            <div className="space-y-0.5">
              <Row label="Agent" value={a.agent} />
              <Row label="Data preluarii" value={a.data_preluarii} />
              <Row label="Data expirare" value={a.data_expirare} />
              <Row label="Sursa lead" value={a.sursa_lead} />
              <Row label="Observatii interne" value={a.obs_interne} />
            </div>
          </Section>
        )}

        {/* Documente */}
        <PropertyDocuments propertyId={property.id} />

        {/* Istoric modificări */}
        <PropertyHistory propertyId={property.id} />

        {/* Storia / OLX */}
        {storiaListing !== undefined && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100">
              <Globe size={17} className="text-orange-500" />
              <span className="font-semibold text-gray-800 text-sm flex-1">Storia + OLX Imobiliare</span>
              {storiaListing && storiaListing.status !== 'deleted' && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  storiaListing.status === 'active'   ? 'bg-emerald-100 text-emerald-800' :
                  storiaListing.status === 'pending'  ? 'bg-amber-100 text-amber-800' :
                  storiaListing.status === 'rejected' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {storiaListing.status === 'active'   ? 'Activ pe Storia' :
                   storiaListing.status === 'pending'  ? 'În așteptare' :
                   storiaListing.status === 'rejected' ? 'Respins' : storiaListing.status}
                </span>
              )}
            </div>
            <div className="px-5 py-4">
              {!storiaConnected ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Link2Off size={15} className="text-gray-400" />
                  Contul Storia nu este conectat.{' '}
                  <a href="/portals" className="text-emerald-600 hover:underline font-medium">Conectează din Portaluri →</a>
                </div>
              ) : storiaListing && storiaListing.status !== 'deleted' ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>ID Storia: <code className="bg-gray-100 px-1.5 py-0.5 rounded">{storiaListing.external_id || '—'}</code></span>
                    {storiaListing.last_sync_at && (
                      <span>Sincronizat: {new Date(storiaListing.last_sync_at).toLocaleString('ro-RO')}</span>
                    )}
                  </div>
                  {storiaListing.error_message && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                      {storiaListing.error_message}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={handleStoriaPublish} disabled={storiaPublishing}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg font-medium text-white hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: '#0E6B54' }}>
                      {storiaPublishing ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
                      {storiaPublishing ? 'Se actualizează...' : 'Actualizează pe Storia'}
                    </button>
                    {storiaListing.advert_url && (
                      <a href={storiaListing.advert_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">
                        <ExternalLink size={14} /> Vezi anunțul
                      </a>
                    )}
                    <button onClick={handleStoriaUnpublish} disabled={storiaUnpublishing}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40 ml-auto">
                      {storiaUnpublishing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      Șterge din Storia
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">
                    {storiaListing?.status === 'deleted' ? 'Anunțul a fost șters din Storia.' : 'Proprietatea nu este publicată pe Storia / OLX.'}
                  </p>
                  <button onClick={handleStoriaPublish} disabled={storiaPublishing}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg font-medium text-white hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: '#0E6B54' }}>
                    {storiaPublishing ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
                    {storiaPublishing ? 'Se publică...' : 'Publică pe Storia + OLX'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cereri potrivite */}
        <div className="bg-white rounded-xl border-2 border-emerald-200 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3.5 bg-emerald-50 border-b border-emerald-200">
            <Target size={17} className="text-emerald-600" />
            <span className="font-semibold text-emerald-800 text-sm flex-1">Cereri potrivite</span>
            {loadingMatches && <span className="text-xs text-emerald-600 animate-pulse">Se cauta...</span>}
            {!loadingMatches && matchedDemands !== null && (
              <span className="text-xs font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                {matchedDemands.length}
              </span>
            )}
          </div>

          <div className="px-5 py-3">
            {loadingMatches && (
              <p className="text-sm text-gray-400 py-3 text-center">Se cauta cereri compatibile...</p>
            )}
            {!loadingMatches && matchedDemands !== null && matchedDemands.length === 0 && (
              <p className="text-sm text-gray-400 py-3 text-center">Nicio cerere compatibila gasita (scor minim 30%)</p>
            )}
            {!loadingMatches && matchedDemands && matchedDemands.length > 0 && (
              <div className="space-y-2 pt-1">
                {matchedDemands.map((d) => {
                  const c = d.criteria || {};
                  const scoreColor = d.score >= 80
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-300'
                    : d.score >= 55
                    ? 'text-yellow-700 bg-yellow-50 border-yellow-300'
                    : 'text-gray-600 bg-gray-50 border-gray-300';

                  const okDetails = Object.entries(d.details as Record<string, string>)
                    .filter(([, v]) => v.startsWith('✓') || v === 'Nespecificat');
                  const badDetails = Object.entries(d.details as Record<string, string>)
                    .filter(([, v]) => !v.startsWith('✓') && v !== 'Nespecificat');

                  return (
                    <div key={d.id} className={`rounded-lg border p-3 ${scoreColor}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xl font-black">{d.score}%</span>
                            <span className="text-xs opacity-70">compatibilitate</span>
                            {c.source && (
                              <span className="text-xs bg-white/70 px-2 py-0.5 rounded-full border border-current/20">
                                {SOURCE_LABEL[c.source] || c.source}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-semibold text-gray-900 mt-0.5 truncate">{d.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {[c.city, c.county].filter(Boolean).join(', ')}
                            {(d.min_price || d.max_price) && ` · ${d.min_price?.toLocaleString() ?? '0'}–${d.max_price?.toLocaleString() ?? '∞'} ${c.currency || 'EUR'}`}
                            {c.nr_camere_min && ` · ${c.nr_camere_min}${c.nr_camere_max ? `-${c.nr_camere_max}` : '+'} cam`}
                          </p>
                          {c.notes && (
                            <p className="text-xs italic text-gray-600 mt-1 bg-white/60 rounded px-2 py-1">
                              💬 {c.notes}
                            </p>
                          )}
                          {/* Detalii potrivire */}
                          <div className="flex flex-wrap gap-1 mt-2">
                            {okDetails.map(([k, v]) => (
                              <span key={k} className="text-xs flex items-center gap-0.5 bg-white/60 px-1.5 py-0.5 rounded border border-current/10">
                                <CheckCircle size={10} className="text-emerald-600" />
                                {k}
                              </span>
                            ))}
                            {badDetails.map(([k, v]) => (
                              <span key={k} className="text-xs flex items-center gap-0.5 bg-red-50 text-red-700 px-1.5 py-0.5 rounded border border-red-200">
                                <AlertCircle size={10} />
                                {k}: {v}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button
                          onClick={() => router.push('/matches')}
                          className="flex-shrink-0 p-1.5 hover:bg-white/50 rounded-lg transition-colors"
                          title="Vezi in Cereri"
                        >
                          <ExternalLink size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
    </ProtectedLayout>
  );
}
