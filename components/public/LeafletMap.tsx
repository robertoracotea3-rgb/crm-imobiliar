'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { mapSpot, type MapSpot } from './places';
import { placeLabel, priceLabel, type CardProperty } from './site';

const pin = L.divIcon({ className: 'kira-pin', html: '<span></span>', iconSize: [30, 40], iconAnchor: [15, 38], popupAnchor: [0, -36] });
const CENTER: [number, number] = [45.745, 25.28]; // between Brașov and Făgăraș
const ZONE = { color: '#C8A252', weight: 2, fillColor: '#C8A252', fillOpacity: 0.2 };

function FitTo({ points, onMap }: { points: [number, number][]; onMap: (m: L.Map) => void }) {
  const map = useMap();
  useEffect(() => { onMap(map); }, [map, onMap]);
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 14);
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 14 });
    else map.setView(CENTER, 9);
  }, [map, points]);
  return null;
}

function Card({ p }: { p: CardProperty }) {
  return (
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
  );
}

const hover = {
  mouseover: (e: L.LeafletMouseEvent) => (e.target as L.Circle).setStyle({ fillOpacity: 0.34 }),
  mouseout: (e: L.LeafletMouseEvent) => (e.target as L.Circle).setStyle({ fillOpacity: 0.2 }),
};

/** The CRM pin where the agent placed one; otherwise only a gold circle on the zone, never the address. */
export default function LeafletMap({ properties, onMap }: { properties: CardProperty[]; onMap: (m: L.Map) => void }) {
  const placed = useMemo(() => properties.map((p) => ({ p, spot: mapSpot(p) })).filter((x): x is { p: CardProperty; spot: MapSpot } => !!x.spot), [properties]);
  const points = useMemo(() => placed.map((x) => x.spot.pos), [placed]);

  return (
    <MapContainer center={CENTER} zoom={9} scrollWheelZoom={false} className="h-full w-full" attributionControl>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        subdomains={['a', 'b', 'c']}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={18}
      />
      <FitTo points={points} onMap={onMap} />
      {placed.map(({ p, spot }) => spot.exact ? (
        <Marker key={p.id} position={spot.pos} icon={pin} title={p.title}><Card p={p} /></Marker>
      ) : (
        <Circle key={p.id} center={spot.pos} radius={spot.radius} pathOptions={ZONE} eventHandlers={hover}><Card p={p} /></Circle>
      ))}
    </MapContainer>
  );
}
