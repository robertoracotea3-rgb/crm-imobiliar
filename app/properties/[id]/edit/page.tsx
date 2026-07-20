'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ChevronLeft, Loader2, Upload, X } from 'lucide-react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { uploadPropertyPhotos } from '@/lib/upload-photos-client';
import { JUDETE, ORASE_BY_JUDET } from '@/lib/romania-locations';

const ic = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900 text-sm bg-white';
const sh = 'text-xs font-semibold text-gray-600 uppercase tracking-wider mt-6 mb-3 border-b border-gray-200 pb-2';

interface EditForm {
  title: string;
  price: string;
  currency: string;
  description: string;
  judet: string;
  localitate: string;
  cartier: string;
  strada: string;
  numar: string;
  bloc: string;
  apartament_nr: string;
  lat: string;
  lon: string;
  sup_utila: string;
  sup_construita: string;
  nr_camere: string;
  an_constructie: string;
  agent_id: string;
  [key: string]: any;
}

export default function EditPropertyPage() {
  const params = useParams();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [property, setProperty] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<EditForm>({
    title: '', price: '', currency: 'EUR', description: '',
    judet: '', localitate: '', cartier: '', strada: '', numar: '', bloc: '', apartament_nr: '',
    lat: '', lon: '', sup_utila: '', sup_construita: '', nr_camere: '', an_constructie: '',
    agent_id: '',
  });
  const [photos, setPhotos] = useState<File[]>([]);
  const [existingPhotos, setExistingPhotos] = useState<string[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [agents, setAgents] = useState<{ id: string; email: string }[]>([]);

  useEffect(() => {
    fetchProperty();
    loadAgents();
  }, [params.id]);

  const loadAgents = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/agents/list', { headers: { Authorization: `Bearer ${session.access_token}` } });
    if (res.ok) { const d = await res.json(); setAgents(d.agents || []); }
  };

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

      const p = d.property;
      const attrs = p.attributes || {};
      setProperty(p);
      setForm({
        title: p.title,
        price: String(p.price || ''),
        currency: p.currency || 'EUR',
        description: p.description || '',
        judet: attrs.judet || '',
        localitate: attrs.localitate || '',
        cartier: attrs.cartier || '',
        strada: attrs.strada || '',
        numar: attrs.numar || '',
        bloc: attrs.bloc || '',
        apartament_nr: attrs.apartament_nr || '',
        lat: attrs.lat || '',
        lon: attrs.lon || '',
        sup_utila: attrs.sup_utila || '',
        sup_construita: attrs.sup_construita || '',
        nr_camere: attrs.nr_camere || '',
        an_constructie: attrs.an_constructie || '',
        agent_id: p.agent_id || '',
      });
      setExistingPhotos(attrs.photos || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare la încărcare');
    } finally {
      setLoading(false);
    }
  };

  const set = (key: keyof EditForm, value: string) => {
    setForm(p => ({ ...p, [key]: value }));
  };

  const handlePhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/') && f.size <= 10_000_000);
    setPhotos(p => [...p, ...files]);
    files.forEach(f => {
      const r = new FileReader();
      r.onload = ev => setPhotoPreviews(p => [...p, ev.target?.result as string]);
      r.readAsDataURL(f);
    });
  };

  const removeNewPhoto = (i: number) => {
    setPhotos(p => p.filter((_, idx) => idx !== i));
    setPhotoPreviews(p => p.filter((_, idx) => idx !== i));
  };

  const removeExistingPhoto = (url: string) => {
    setExistingPhotos(p => p.filter(ph => ph !== url));
  };

  const handleSave = async () => {
    if (!form.title.trim()) { setError('Titlul e obligatoriu'); return; }

    try {
      setSaving(true);
      setError('');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Nu esti autentificat');

      const attributes = { ...property.attributes, ...form };
      const payload = {
        id: params.id,
        title: form.title,
        price: form.price ? parseFloat(form.price) : null,
        currency: form.currency,
        description: form.description,
        county: form.judet,
        city: form.localitate,
        zone: form.cartier,
        street: form.strada,
        street_number: form.numar,
        latitude: form.lat ? parseFloat(form.lat) : null,
        longitude: form.lon ? parseFloat(form.lon) : null,
        agent_id: form.agent_id || null,
        attributes,
      };

      const res = await fetch('/api/properties/update-full', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const d = await res.json();
      if (!res.ok) throw new Error(d.error);

      // Upload new photos (redimensionate + în loturi, cu verificare)
      if (photos.length > 0) {
        const up = await uploadPropertyPhotos({
          propertyId: String(params.id),
          agencyId: property.agency_id,
          photos,
          token: session.access_token,
          replacePhotos: true,
          existingPhotos,
        });
        if (!up.ok) {
          setError(`Modificările s-au salvat, dar pozele au eșuat: ${up.error}. Reîncearcă.`);
          setSaving(false);
          return;
        }
      }

      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare la salvare');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center"><p className="text-gray-500">Se încarcă...</p></div>;

  const cities = ORASE_BY_JUDET[form.judet] || [];

  return (
    <ProtectedLayout module="properties" action="edit">
    <div className="p-8 max-w-3xl mx-auto pb-20">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-700 mb-6 hover:text-gray-900">
        <ChevronLeft size={20} /> Inapoi
      </button>

      <h1 className="text-2xl font-bold mb-6" style={{ color: '#0E6B54' }}>Editeaza proprietate</h1>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-800 text-sm">{error}</div>}

      <div className="bg-white rounded-lg p-6 shadow-sm space-y-6">
        {/* DATE GENERALE */}
        <div>
          <p className={sh}>📋 Date Generale</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Titlu *</label>
              <input type="text" value={form.title} onChange={e => set('title', e.target.value)} className={ic} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Preț</label>
                <input type="number" value={form.price} onChange={e => set('price', e.target.value)} className={ic} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Monedă</label>
                <select value={form.currency} onChange={e => set('currency', e.target.value)} className={ic}>
                  <option>EUR</option><option>RON</option><option>USD</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Descriere</label>
              <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={4} className={ic} />
            </div>
          </div>
        </div>

        {/* LOCALIZARE */}
        <div>
          <p className={sh}>📍 Localizare</p>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Județ</label>
                <select value={form.judet} onChange={e => { set('judet', e.target.value); set('localitate', ''); }} className={ic}>
                  <option value="">-</option>
                  {JUDETE.map(j => <option key={j}>{j}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Localitate</label>
                <select value={form.localitate} onChange={e => set('localitate', e.target.value)} className={ic} disabled={!form.judet}>
                  <option value="">-</option>
                  {cities.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Stradă</label>
                <input type="text" value={form.strada} onChange={e => set('strada', e.target.value)} className={ic} placeholder="Str. Lungă" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Număr</label>
                <input type="text" value={form.numar} onChange={e => set('numar', e.target.value)} className={ic} placeholder="24" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Bloc</label>
                <input type="text" value={form.bloc} onChange={e => set('bloc', e.target.value)} className={ic} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Apt</label>
                <input type="text" value={form.apartament_nr} onChange={e => set('apartament_nr', e.target.value)} className={ic} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Cartier</label>
                <input type="text" value={form.cartier} onChange={e => set('cartier', e.target.value)} className={ic} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Latitude</label>
                <input type="text" value={form.lat} onChange={e => set('lat', e.target.value)} className={ic} placeholder="45.65" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Longitudine</label>
                <input type="text" value={form.lon} onChange={e => set('lon', e.target.value)} className={ic} placeholder="25.6" />
              </div>
            </div>
          </div>
        </div>

        {/* SUPRAFEȚE */}
        <div>
          <p className={sh}>📐 Suprafețe & Camere</p>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Suprafață utilă (m²)</label>
                <input type="number" value={form.sup_utila} onChange={e => set('sup_utila', e.target.value)} className={ic} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Suprafață construită (m²)</label>
                <input type="number" value={form.sup_construita} onChange={e => set('sup_construita', e.target.value)} className={ic} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Camere</label>
                <input type="number" value={form.nr_camere} onChange={e => set('nr_camere', e.target.value)} className={ic} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">An construcție</label>
              <input type="number" value={form.an_constructie} onChange={e => set('an_constructie', e.target.value)} className={ic} />
            </div>
          </div>
        </div>

        {/* POZE */}
        <div>
          <p className={sh}>📸 Poze</p>
          {existingPhotos.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-600 mb-2">Poze existente</p>
              <div className="grid grid-cols-3 gap-3">
                {existingPhotos.map((url, i) => (
                  <div key={i} className="relative group rounded-lg overflow-hidden bg-gray-100">
                    <img src={url} alt={`Poza ${i + 1}`} className="w-full h-24 object-cover" />
                    <button
                      onClick={() => removeExistingPhoto(url)}
                      className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {photoPreviews.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-600 mb-2">Poze noi</p>
              <div className="grid grid-cols-3 gap-3">
                {photoPreviews.map((url, i) => (
                  <div key={i} className="relative group rounded-lg overflow-hidden bg-gray-100">
                    <img src={url} alt={`Poza nouă ${i + 1}`} className="w-full h-24 object-cover" />
                    <button
                      onClick={() => removeNewPhoto(i)}
                      className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium">
            <Upload size={16} /> Adaugă poze
          </button>
          <input ref={fileRef} type="file" multiple accept="image/*" onChange={handlePhotos} className="hidden" />
        </div>

        {/* AGENT */}
        <div>
          <p className={sh}>👤 Agent responsabil</p>
          <select value={form.agent_id} onChange={e => set('agent_id', e.target.value)} className={ic}>
            <option value="">— Neasignat —</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.email}</option>)}
          </select>
        </div>

        {/* BUTOANE */}
        <div className="flex gap-3 pt-6 border-t border-gray-200">
          <button
            onClick={handleSave}
            disabled={saving || !form.title}
            className="flex items-center gap-2 px-6 py-2 text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: '#0E6B54' }}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
            {saving ? 'Se salvează...' : 'Salvează'}
          </button>
          <button
            onClick={() => router.back()}
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
            Anulare
          </button>
        </div>
      </div>
    </div>
    </ProtectedLayout>
  );
}
