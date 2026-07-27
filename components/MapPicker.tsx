'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import type { LeafletMouseEvent, Map as LeafletMap, Marker } from 'leaflet';

interface MapPickerProps {
  lat: string;
  lon: string;
  onCoords: (lat: string, lon: string) => void;
}

export function MapPicker({ lat, lon, onCoords }: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onCoordsRef = useRef(onCoords);
  const [ready, setReady] = useState(false);

  const defaultLat = lat ? parseFloat(lat) : 45.8416;
  const defaultLon = lon ? parseFloat(lon) : 24.9731;
  const initialCoordsRef = useRef({ lat: defaultLat, lon: defaultLon });

  useEffect(() => {
    onCoordsRef.current = onCoords;
  }, [onCoords]);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    // CSS is loaded via layout.tsx — no injection needed
    import('leaflet').then((L) => {
      if (mapRef.current || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        center: [initialCoordsRef.current.lat, initialCoordsRef.current.lon],
        zoom: 13,
        zoomControl: true,
        preferCanvas: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      const marker = L.marker([initialCoordsRef.current.lat, initialCoordsRef.current.lon], { draggable: true }).addTo(map);

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        onCoordsRef.current(pos.lat.toFixed(6), pos.lng.toFixed(6));
      });

      map.on('click', (e: LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        onCoordsRef.current(e.latlng.lat.toFixed(6), e.latlng.lng.toFixed(6));
      });

      mapRef.current = map;
      markerRef.current = marker;
      setReady(true);

      // Force full tile reload after container is guaranteed visible
      setTimeout(() => { map.invalidateSize({ animate: false }); }, 200);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  // Sync marker with external lat/lon changes
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    const la = parseFloat(lat);
    const lo = parseFloat(lon);
    if (!isNaN(la) && !isNaN(lo)) {
      markerRef.current.setLatLng([la, lo]);
      mapRef.current.setView([la, lo], 14, { animate: false });
    }
  }, [lat, lon]);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
        <MapPin size={13} className="text-emerald-600" />
        Localizare pe hartă — click sau trage pinul pentru a ajusta poziția
      </div>

      <div
        ref={containerRef}
        style={{ height: 220, zIndex: 0 }}
        className="w-full rounded-lg border border-gray-200 overflow-hidden"
      />

      {!ready && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 size={12} className="animate-spin" /> Se încarcă harta...
        </div>
      )}

      {lat && lon && (
        <p className="text-xs text-gray-400 font-mono">{lat}, {lon}</p>
      )}
    </div>
  );
}
