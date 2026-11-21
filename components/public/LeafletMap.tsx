'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { approxPosition } from './places';
import { placeLabel, priceLabel, type CardProperty } from './site';

const pin = L.divIcon({ className: 'kira-pin', html: '<span></span>', iconSize: [30, 40], iconAnchor: [15, 38], popupAnchor: [0, -36] });
const CENTER: [number, number] = [45.745, 25.28]; // between Făgăraș and Brașov

function FitTo({ points, onMap }: { points: [number, number][]; onMap: (m: L.Map) => void }) {
  const map = useMap();
  useEffect(() => { onMap(map); }, [map, onMap]);
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 13);
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 14 });
    else map.setView(CENTER, 9);
  }, [map, points]);
  return null;
}

export default function LeafletMap({ properties, onMap }: { properties: CardProperty[]; onMap: (m: L.Map) => void }) {
  const placed = useMemo(() => properties.map((p) => ({ p, pos: approxPosition(p) })).filter((x): x is { p: CardProperty; pos: [number, number] } => !!x.pos), [properties]);
  const points = useMemo(() => placed.map((x) => x.pos), [placed]);

  return (
    <MapContainer center={CENTER} zoom={9} scrollWheelZoom={false} className="h-full w-full" attributionControl>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        subdomains={['a', 'b', 'c']}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={18}
      />
      <FitTo points={points} onMap={onMap} />
      {placed.map(({ p, pos }) => (
        <Marker key={p.id} position={pos} icon={pin} title={p.title}>
          <Popup className="kira-popup" closeButton={false} maxWidth={260} minWidth={240}>
            <Link href={p.path} className="block overflow-hidden rounded-xl">
              {p.photos[0] ? <img src={p.photos[0]} alt="" className="h-32 w-full object-cover" loading="lazy" /> : <span className="block h-2" />}
            </Link>
            <div className="p-3">
              <p className="text-base font-semibold text-[#C8A252]">{priceLabel(p)}</p>
              <p className="mt-1 line-clamp-2 text-[13px] font-semibold leading-5 text-[#F6F3EE]">{p.title}</p>
              <p className="mt-0.5 text-xs text-white/55">{placeLabel(p)}</p>
              <Link href={p.path} className="mt-3 inline-flex rounded-full bg-[#C8A252] px-4 py-1.5 text-xs font-bold text-[#121417]">Vezi detalii</Link>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
