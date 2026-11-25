'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, MapPin, MessageCircle, Phone } from 'lucide-react';
import { PropertyGallery } from './PropertyDetail';
import { PhotoPlaceholder } from './PropertyCard';
import { SITE, waLink } from './site';

export type OfferItem = {
  id: string; code: string | null; title: string; price: string; place: string; type: string | null; transaction: string | null;
  meta: string[]; description: string | null; facts: { label: string; value: string }[]; features: string[]; photos: string[];
};

// Opened by the agent from the CRM ("Vezi ce primește"): that browser is never counted as the client.
const AGENT_KEY = 'kira-oferta-agent';
function counted(): boolean {
  try {
    if (new URLSearchParams(location.search).has('previzualizare')) { localStorage.setItem(AGENT_KEY, '1'); return false; }
    return localStorage.getItem(AGENT_KEY) !== '1';
  } catch { return !location.search.includes('previzualizare'); }
}
function tell(token: string, prop?: string) {
  fetch('/api/site/oferta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(prop ? { t: token, p: prop } : { t: token }), keepalive: true }).catch(() => undefined);
}

export function OfferView({ token, items }: { token: string; items: OfferItem[] }) {
  const single = items.length === 1;
  const [open, setOpen] = useState<string | null>(single ? items[0].id : null);
  const on = useRef(false);

  // An opening is counted once the page is really on screen (not while it loads in the background).
  useEffect(() => {
    if (on.current) return;
    const start = () => {
      if (on.current || document.visibilityState !== 'visible') return;
      on.current = true;
      document.removeEventListener('visibilitychange', start);
      if (!counted()) return;
      tell(token);
      if (single) tell(token, items[0].id);
    };
    document.addEventListener('visibilitychange', start);
    start();
    return () => document.removeEventListener('visibilitychange', start);
  }, [token, items, single]);

  const toggle = (id: string) => {
    if (open !== id && counted()) tell(token, id);
    setOpen(open === id ? null : id);
  };

  return (
    <div className="mt-8 space-y-6">
      {items.map((p, i) => {
        const shown = open === p.id;
        const ask = `Bună ziua, mă interesează proprietatea ${p.code ? p.code + ': ' : ''}${p.title}, din oferta primită.`;
        return (
          <article key={p.id} id={`p-${i + 1}`} className="overflow-hidden rounded-[1.4rem] border border-[#121417]/10 bg-white shadow-[0_10px_30px_rgba(18,20,23,.06)]">
            <div className={shown ? '' : 'md:grid md:grid-cols-[22rem_minmax(0,1fr)]'}>
              {shown ? (
                <div className="p-3 sm:p-4"><PropertyGallery photos={p.photos} title={p.title} /></div>
              ) : (
                <button type="button" onClick={() => toggle(p.id)} className="relative block aspect-[4/3] w-full overflow-hidden bg-[#ece7de]" aria-label={`Vezi detalii: ${p.title}`}>
                  {p.photos[0] ? <img src={p.photos[0]} alt={p.title} className="h-full w-full object-cover" loading={i < 2 ? 'eager' : 'lazy'} /> : <PhotoPlaceholder />}
                  {p.photos.length > 1 && <span className="absolute bottom-3 right-3 rounded-full bg-[#121417]/75 px-2.5 py-1 text-xs font-semibold text-white">{p.photos.length} poze</span>}
                </button>
              )}
              <div className="flex flex-col p-5 sm:p-6">
                <div className="flex flex-wrap gap-2">
                  {p.transaction && <span className="rounded-md bg-[#121417] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.14em] text-[#E9CF8E]">{p.transaction}</span>}
                  {p.type && <span className="rounded-md border border-[#121417]/12 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.14em] text-[#121417]/70">{p.type}</span>}
                  {p.code && <span className="rounded-md bg-[#C8A252] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.14em] text-[#121417]">Cod {p.code}</span>}
                </div>
                <h2 className="mt-3 font-[var(--font-playfair)] text-2xl leading-tight sm:text-[1.75rem]">{p.title}</h2>
                <p className="mt-2 text-2xl font-semibold text-[#9a7a35]">{p.price}</p>
                <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-[#121417]/65"><MapPin size={15} className="text-[#C8A252]" /> {p.place}</p>
                {p.meta.length > 0 && <p className="mt-2 text-sm font-semibold text-[#121417]/80">{p.meta.join(' · ')}</p>}
                <div className="mt-auto flex flex-wrap gap-2 pt-5">
                  <button type="button" onClick={() => toggle(p.id)} aria-expanded={shown} className="inline-flex items-center gap-2 rounded-full bg-[#121417] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#2a2d33]">
                    {shown ? 'Ascunde detaliile' : 'Vezi detalii'} <ChevronDown size={16} className={shown ? 'rotate-180' : ''} />
                  </button>
                  <a href={waLink(ask)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#C8A252] px-5 py-3 text-sm font-semibold text-[#121417] transition hover:bg-[#D4AF37]"><MessageCircle size={16} /> Mă interesează</a>
                  <a href={SITE.phoneLink} className="inline-flex items-center gap-2 rounded-full border border-[#121417]/15 px-5 py-3 text-sm font-semibold transition hover:border-[#C8A252]"><Phone size={16} /> Sună</a>
                </div>
              </div>
            </div>
            {shown && (
              <div className="space-y-8 border-t border-[#121417]/8 p-5 sm:p-6">
                {p.description && (
                  <section>
                    <h3 className="font-[var(--font-playfair)] text-xl">Descriere</h3>
                    <p className="mt-3 whitespace-pre-line leading-7 text-[#121417]/75">{p.description}</p>
                  </section>
                )}
                {p.facts.length > 0 && (
                  <section>
                    <h3 className="font-[var(--font-playfair)] text-xl">Caracteristici</h3>
                    <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                      {p.facts.map((f) => (
                        <div key={f.label} className="rounded-xl border border-[#121417]/8 bg-[#F6F3EE] p-3">
                          <dt className="text-[12px] text-[#121417]/60">{f.label}</dt>
                          <dd className="mt-0.5 text-sm font-semibold">{f.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )}
                {p.features.length > 0 && (
                  <section>
                    <h3 className="font-[var(--font-playfair)] text-xl">Dotări</h3>
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {p.features.map((f) => <li key={f} className="rounded-full border border-[#C8A252]/35 px-3 py-1.5 text-sm">{f}</li>)}
                    </ul>
                  </section>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
