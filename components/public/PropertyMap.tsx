'use client';

import dynamic from 'next/dynamic';
import type L from 'leaflet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useExplorer } from './PropertyExplorer';
import { mapSpot } from './places';

const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => <div className="grid h-full w-full place-items-center text-sm text-white/40">Se încarcă harta…</div>,
});

/** The dark map with the search results: a gold pin where the CRM has one, otherwise only a circle on the zone. */
export function PropertyMap() {
  const { results } = useExplorer();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const [full, setFull] = useState(false);
  const { pinned, zones } = useMemo(() => {
    const spots = results.map((p) => mapSpot(p)).filter((s) => !!s);
    return { pinned: spots.length, zones: spots.filter((s) => !s.exact).length };
  }, [results]);
  const onMap = useCallback((m: L.Map) => { map.current = m; }, []);

  useEffect(() => {
    const onChange = () => {
      setFull(document.fullscreenElement === box.current);
      window.setTimeout(() => map.current?.invalidateSize(), 120);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  async function toggle() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await box.current?.requestFullscreen();
    } catch { /* fullscreen not allowed: the map stays in the page */ }
  }

  return (
    <div ref={box} className="kira-map relative h-[26rem] overflow-hidden rounded-[1.6rem] border border-[#121417]/10 bg-[#16181c] shadow-[0_24px_60px_rgba(18,20,23,.18)] sm:h-[30rem] lg:h-full lg:min-h-[30rem]">
      <LeafletMap properties={results} onMap={onMap} />
      <button type="button" onClick={toggle} aria-label={full ? 'Ieși din ecran complet' : 'Hartă pe tot ecranul'} className="absolute right-3 top-3 z-[500] grid h-10 w-10 place-items-center rounded-xl border border-white/15 bg-[#121417]/85 text-white/85 backdrop-blur transition hover:border-[#C8A252] hover:text-[#E9CF8E]">
        {full ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
      </button>
      <p className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-lg bg-[#121417]/80 px-3 py-1.5 text-[11px] text-white/70 backdrop-blur">
        {pinned ? `${pinned} ${pinned === 1 ? 'proprietate' : 'proprietăți'} pe hartă${zones ? ' · cercul arată doar zona' : ''}` : 'Proprietățile apar pe hartă imediat ce sunt publicate'}
      </p>
    </div>
  );
}
