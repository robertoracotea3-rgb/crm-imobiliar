'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MapPinned } from 'lucide-react';
import type { LayerGroup, Map as LeafletMap } from 'leaflet';

interface Prop {
  id: string;
  title?: string;
  internal_code?: string;
  price?: number | null;
  currency?: string;
  city?: string;
  county?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  attributes?: Record<string, unknown> | null;
}

interface Props {
  properties: Prop[];
  height?: number;
}

const coord = (...vals: unknown[]): number => {
  for (const v of vals) {
    const n = parseFloat(String(v));
    if (Number.isFinite(n) && n !== 0) return n;
  }
  return NaN;
};

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Leaflet map showing every property with valid coordinates as a clickable pin. */
export function PropertiesMapView({ properties, height = 560 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const [ready, setReady] = useState(false);

  const located = useMemo(() => properties
    .map(p => ({ p, lat: coord(p.attributes?.lat, p.latitude), lon: coord(p.attributes?.lon, p.longitude) }))
    .filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lon)), [properties]);

  // Init map once
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    import('leaflet').then((L) => {
      if (mapRef.current || !containerRef.current) return;
      delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
      const map = L.map(containerRef.current, { center: [45.84, 24.97], zoom: 8, zoomControl: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
      setTimeout(() => map.invalidateSize({ animate: false }), 200);
    });
    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; layerRef.current = null; }
    };
  }, []);

  // (Re)draw markers whenever the located set changes
  useEffect(() => {
    if (!ready || !mapRef.current || !layerRef.current) return;
    const map = mapRef.current;
    const layer = layerRef.current;
    import('leaflet').then((L) => {
      layer.clearLayers();
      if (located.length === 0) return;
      const latlngs: [number, number][] = [];
      for (const { p, lat, lon } of located) {
        const price = p.price ? `${Number(p.price).toLocaleString('ro-RO')} ${p.currency || 'EUR'}` : 'Preț la cerere';
        const loc = [p.city, p.county].filter(Boolean).join(', ');
        const popup =
          `<div style="min-width:160px">
             <strong>${esc(p.title || p.internal_code || 'Proprietate')}</strong><br/>
             <span style="color:#0E6B54;font-weight:700">${esc(price)}</span><br/>
             <span style="color:#666;font-size:11px">${esc(loc)}</span><br/>
             <a href="/properties/${p.id}" style="color:#0E6B54;font-size:12px;font-weight:600">Vezi detalii →</a>
           </div>`;
        L.marker([lat, lon]).addTo(layer).bindPopup(popup);
        latlngs.push([lat, lon]);
      }
      if (latlngs.length === 1) {
        map.setView(latlngs[0], 14);
      } else {
        map.fitBounds(latlngs, { padding: [40, 40], maxZoom: 14 });
      }
    });
  }, [ready, located]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <MapPinned size={15} className="text-emerald-600" />
        {located.length} din {properties.length} proprietăți au coordonate pe hartă
      </div>
      <div className="relative">
        <div
          ref={containerRef}
          style={{ height, zIndex: 0 }}
          className="w-full rounded-xl border border-gray-200 overflow-hidden"
        />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 gap-2">
            <Loader2 size={16} className="animate-spin" /> Se încarcă harta...
          </div>
        )}
      </div>
      {located.length === 0 && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Nicio proprietate nu are coordonate. Adaugă locația pe hartă din formularul de editare (pasul Localizare).
        </p>
      )}
    </div>
  );
}
