'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarClock, ChevronLeft, ChevronRight, Expand, MessageCircle, Phone, X } from 'lucide-react';
import { FavoriteButton, useSiteUi } from './SiteUi';
import { PhotoPlaceholder } from './PropertyCard';
import { SITE, money, waLink, type CardProperty } from './site';

/* ---------- gallery with thumbnails and a full-screen lightbox ---------- */

export function PropertyGallery({ photos, title }: { photos: string[]; title: string }) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const touchX = useRef(0);
  const n = photos.length;
  const go = useCallback((d: number) => setIndex((i) => (i + d + n) % n), [n]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, go]);

  if (!n) return <PhotoPlaceholder className="aspect-[16/10] w-full rounded-[1.6rem]" />;

  const swipe = {
    onTouchStart: (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; },
    onTouchEnd: (e: React.TouchEvent) => { const d = e.changedTouches[0].clientX - touchX.current; if (Math.abs(d) > 40) go(d < 0 ? 1 : -1); },
  };

  return (
    <div>
      <div className="group relative overflow-hidden rounded-[1.6rem] bg-[#121417]" {...swipe}>
        <button type="button" onClick={() => setOpen(true)} className="block w-full" aria-label="Vezi pozele pe tot ecranul">
          <img src={photos[index]} alt={`${title}, poza ${index + 1}`} className="aspect-[16/10] w-full object-cover" fetchPriority={index === 0 ? 'high' : undefined} />
        </button>
        <span className="pointer-events-none absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full bg-[#121417]/75 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur"><Expand size={14} /> {index + 1} / {n}</span>
        {n > 1 && (<>
          <button type="button" onClick={() => go(-1)} aria-label="Poza anterioară" className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-[#121417]/70 text-white opacity-90 backdrop-blur transition hover:bg-[#C8A252] hover:text-[#121417] sm:opacity-0 sm:group-hover:opacity-100"><ChevronLeft /></button>
          <button type="button" onClick={() => go(1)} aria-label="Poza următoare" className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-[#121417]/70 text-white opacity-90 backdrop-blur transition hover:bg-[#C8A252] hover:text-[#121417] sm:opacity-0 sm:group-hover:opacity-100"><ChevronRight /></button>
        </>)}
      </div>
      {n > 1 && (
        <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1">
          {photos.map((src, i) => (
            <button key={src} type="button" onClick={() => setIndex(i)} aria-label={`Poza ${i + 1}`} aria-current={i === index} className={`shrink-0 overflow-hidden rounded-xl border-2 transition ${i === index ? 'border-[#C8A252]' : 'border-transparent opacity-70 hover:opacity-100'}`}>
              <img src={src} alt="" className="h-16 w-24 object-cover sm:h-20 sm:w-28" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {open && createPortal(
        <div className="kira-ui fixed inset-0 z-[95] flex flex-col bg-[#08090b]/95" role="dialog" aria-modal="true" aria-label="Galerie foto" {...swipe}>
          <div className="flex items-center justify-between px-5 py-4 text-sm text-white/70">
            <span>{index + 1} / {n}</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Închide galeria" className="grid h-11 w-11 place-items-center rounded-full border border-white/15 text-white transition hover:border-[#C8A252]"><X /></button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 sm:px-16">
            <img src={photos[index]} alt={`${title}, poza ${index + 1}`} className="max-h-full max-w-full rounded-xl object-contain" />
            {n > 1 && (<>
              <button type="button" onClick={() => go(-1)} aria-label="Poza anterioară" className="absolute left-2 grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white transition hover:bg-[#C8A252] hover:text-[#121417] sm:left-5"><ChevronLeft /></button>
              <button type="button" onClick={() => go(1)} aria-label="Poza următoare" className="absolute right-2 grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white transition hover:bg-[#C8A252] hover:text-[#121417] sm:right-5"><ChevronRight /></button>
            </>)}
          </div>
          <div className="flex justify-center gap-2 overflow-x-auto px-4 py-4">
            {photos.map((src, i) => (
              <button key={src} type="button" onClick={() => setIndex(i)} aria-label={`Poza ${i + 1}`} className={`shrink-0 overflow-hidden rounded-lg border-2 ${i === index ? 'border-[#C8A252]' : 'border-transparent opacity-50 hover:opacity-90'}`}>
                <img src={src} alt="" className="h-14 w-20 object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ---------- mortgage calculator (indicative) ---------- */

export function MortgageCalculator({ price }: { price: number }) {
  const [down, setDown] = useState(15);
  const [years, setYears] = useState(30);
  const [rate, setRate] = useState(6.5);
  const r = useMemo(() => {
    const loan = Math.max(0, price * (1 - down / 100));
    const m = rate / 100 / 12, k = years * 12;
    const monthly = m > 0 ? (loan * m) / (1 - Math.pow(1 + m, -k)) : loan / k;
    return { loan, monthly, total: monthly * k, interest: monthly * k - loan };
  }, [price, down, years, rate]);

  const slider = 'kira-range mt-2 w-full';
  return (
    <div className="rounded-[1.6rem] border border-[#121417]/8 bg-white p-6 shadow-[0_10px_34px_rgba(18,20,23,.05)] sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.24em] text-[#9a7a35]">Calculator rată</p>
          <h2 className="mt-2 font-[var(--font-playfair)] text-3xl">Cât ar fi rata lunară</h2>
        </div>
        <div className="sm:text-right">
          <p className="text-sm text-[#121417]/55">Rată estimată</p>
          <p className="font-[var(--font-playfair)] text-4xl text-[#9a7a35]">{money(r.monthly)} €<span className="text-base text-[#121417]/50"> / lună</span></p>
        </div>
      </div>
      <div className="mt-7 grid gap-6 sm:grid-cols-3">
        <label className="text-sm font-semibold text-[#121417]/80">Avans: {down}% <span className="font-normal text-[#121417]/50">({money(price * down / 100)} €)</span>
          <input type="range" min={5} max={60} step={1} value={down} onChange={(e) => setDown(Number(e.target.value))} className={slider} />
        </label>
        <label className="text-sm font-semibold text-[#121417]/80">Perioadă: {years} ani
          <input type="range" min={5} max={35} step={1} value={years} onChange={(e) => setYears(Number(e.target.value))} className={slider} />
        </label>
        <label className="text-sm font-semibold text-[#121417]/80">Dobândă: {rate.toFixed(1)}% / an
          <input type="range" min={2} max={12} step={0.1} value={rate} onChange={(e) => setRate(Number(e.target.value))} className={slider} />
        </label>
      </div>
      <dl className="mt-7 grid grid-cols-3 gap-3 border-t border-[#121417]/8 pt-5 text-sm">
        <div><dt className="text-[#121417]/55">Credit</dt><dd className="mt-1 font-semibold">{money(r.loan)} €</dd></div>
        <div><dt className="text-[#121417]/55">Dobândă totală</dt><dd className="mt-1 font-semibold">{money(r.interest)} €</dd></div>
        <div><dt className="text-[#121417]/55">Total de plată</dt><dd className="mt-1 font-semibold">{money(r.total)} €</dd></div>
      </dl>
      <p className="mt-4 text-xs leading-5 text-[#121417]/50">Calcul orientativ, cu rată constantă; nu include comisioane, asigurări sau DAE. Oferta exactă o primești de la bancă.</p>
    </div>
  );
}

/* ---------- the sticky "programează o vizionare" card ---------- */

export function ViewingCard({ property, ask }: { property: CardProperty; ask: string }) {
  const { open } = useSiteUi();
  return (
    <div className="rounded-[1.6rem] bg-[#121417] p-2 text-[#F6F3EE] shadow-[0_24px_60px_rgba(18,20,23,.22)]">
      <div className="rounded-[1.25rem] border border-[#C8A252]/45 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[.24em] text-[#C8A252]">Vizionare</p>
            <h2 className="mt-2 font-[var(--font-playfair)] text-2xl leading-tight">Programează o vizionare</h2>
          </div>
          <FavoriteButton property={property} />
        </div>
        <p className="mt-3 text-sm leading-6 text-white/65">Alegi ziua și intervalul; confirmăm disponibilitatea și îți dăm adresa exactă.{property.code ? ` Cod proprietate: ${property.code}.` : ''}</p>
        <button type="button" onClick={() => open({ kind: 'contact', property: { code: property.code, title: property.title } })} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#C8A252] px-5 py-3.5 font-semibold text-[#121417] transition hover:bg-[#D4AF37]">
          <CalendarClock size={18} /> Alege data și ora
        </button>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a href={waLink(ask)} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-4 py-3 text-sm font-semibold transition hover:border-[#C8A252]"><MessageCircle size={16} /> WhatsApp</a>
          <a href={SITE.phoneLink} className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-4 py-3 text-sm font-semibold transition hover:border-[#C8A252]"><Phone size={16} /> Sună</a>
        </div>
      </div>
    </div>
  );
}
