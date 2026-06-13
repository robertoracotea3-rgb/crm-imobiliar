'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';

interface MapPickerProps {
  lat: string;
  lon: string;
  onCoords: (lat: string, lon: string) => void;
}

export function MapPicker({ lat, lon, onCoords }: MapPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const defaultLat = lat ? parseFloat(lat) : 45.9432;
  const defaultLon = lon ? parseFloat(lon) : 24.9668;

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    // Inject Leaflet CSS if not already present
    if (!document.querySelector('link[data-leaflet]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.setAttribute('data-leaflet', '1');
      document.head.appendChild(link);
    }

    // Wait for next frame so container has real dimensions before Leaflet initializes
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (!mapRef.current || mapInstance.current) return;

        import('leaflet').then((L) => {
          delete (L.Icon.Default.prototype as any)._getIconUrl;
          L.Icon.Default.mergeOptions({
            iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
            iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
          });

          const map = L.map(mapRef.current!, {
            center: [defaultLat, defaultLon],
            zoom: 13,
            zoomControl: true,
          });

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19,
          }).addTo(map);

          const marker = L.marker([defaultLat, defaultLon], { draggable: true }).addTo(map);

          marker.on('dragend', () => {
            const pos = marker.getLatLng();
            onCoords(pos.lat.toFixed(6), pos.lng.toFixed(6));
          });

          map.on('click', (e: any) => {
            marker.setLatLng(e.latlng);
            onCoords(e.latlng.lat.toFixed(6), e.latlng.lng.toFixed(6));
          });

          mapInstance.current = map;
          markerRef.current = marker;
          setLoading(false);

          // Multiple invalidateSize calls to ensure tiles fill container
          setTimeout(() => map.invalidateSize(), 50);
          setTimeout(() => map.invalidateSize(), 250);
          setTimeout(() => map.invalidateSize(), 600);
        }).catch(() => {
          setError('Harta nu s-a putut încărca');
          setLoading(false);
        });
      }, 50);
    });

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  // Update marker when lat/lon props change externally
  useEffect(() => {
    if (!mapInstance.current || !markerRef.current) return;
    const newLat = parseFloat(lat);
    const newLon = parseFloat(lon);
    if (!isNaN(newLat) && !isNaN(newLon)) {
      markerRef.current.setLatLng([newLat, newLon]);
      mapInstance.current.setView([newLat, newLon], 14);
    }
  }, [lat, lon]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
        <MapPin size={13} className="text-emerald-600" />
        Localizare pe hartă — click sau trage pinul pentru a ajusta poziția
      </div>
      {error && (
        <div className="h-56 bg-red-50 border border-red-200 rounded-lg flex items-center justify-center text-sm text-red-600">
          {error}
        </div>
      )}
      {/* Container is always visible so Leaflet gets real dimensions on init */}
      <div className="relative rounded-lg border border-gray-200 overflow-hidden" style={{ height: 220 }}>
        {loading && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-gray-100">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        )}
        <div ref={mapRef} className="w-full h-full" />
      </div>
      {lat && lon && (
        <p className="text-xs text-gray-400 font-mono">
          {lat}, {lon}
        </p>
      )}
    </div>
  );
}
