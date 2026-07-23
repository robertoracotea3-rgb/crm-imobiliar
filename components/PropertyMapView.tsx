'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import type { Map as LeafletMap } from 'leaflet';

interface Props {
  lat: number;
  lon: number;
  label?: string;
  height?: number;
}

/** Read-only Leaflet map showing a single property pin. CSS is preloaded in layout.tsx. */
export function PropertyMapView({ lat, lon, label, height = 280 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    import('leaflet').then((L) => {
      if (mapRef.current || !containerRef.current) return;

      delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(containerRef.current, {
        center: [lat, lon],
        zoom: 15,
        zoomControl: true,
        scrollWheelZoom: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      const marker = L.marker([lat, lon]).addTo(map);
      if (label) marker.bindPopup(label);

      mapRef.current = map;
      setReady(true);
      setTimeout(() => map.invalidateSize({ animate: false }), 200);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [lat, lon, label]);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return (
    <div className="space-y-1">
      <div
        ref={containerRef}
        style={{ height, zIndex: 0 }}
        className="w-full rounded-lg border border-gray-200 overflow-hidden"
      />
      {!ready && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 size={12} className="animate-spin" /> Se încarcă harta...
        </div>
      )}
      <p className="flex items-center gap-1 text-xs text-gray-400 font-mono">
        <MapPin size={11} className="text-emerald-600" /> {lat.toFixed(6)}, {lon.toFixed(6)}
      </p>
    </div>
  );
}
