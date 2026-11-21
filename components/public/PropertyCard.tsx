'use client';

import Link from 'next/link';
import { BedDouble, CalendarDays, Layers, MapPin, Ruler } from 'lucide-react';
import { FavoriteButton } from './SiteUi';
import { num, placeLabel, priceLabel, roomsLabel, transactionLabel, type CardProperty } from './site';

function Specs({ p, dark }: { p: CardProperty; dark: boolean }) {
  const items: [React.ReactNode, string][] = [];
  if (p.rooms != null) items.push([<BedDouble key="r" size={15} />, roomsLabel(p.rooms)]);
  if (p.surface != null) items.push([<Ruler key="s" size={15} />, `${num(p.surface)} m²${p.land ? ' teren' : ''}`]);
  if (p.floor) items.push([<Layers key="f" size={15} />, p.floor]);
  else if (p.year != null) items.push([<CalendarDays key="y" size={15} />, `an ${p.year}`]);
  if (!items.length && p.typeLabel) items.push([<Layers key="t" size={15} />, p.typeLabel]);
  return (
    <ul className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] ${dark ? 'text-white/65' : 'text-[#121417]/65'}`}>
      {items.slice(0, 3).map(([icon, text]) => (
        <li key={text} className="inline-flex items-center gap-1.5"><span className="text-[#C8A252]">{icon}</span>{text}</li>
      ))}
    </ul>
  );
}

export function PhotoPlaceholder({ className = '' }: { className?: string }) {
  return (
    <div className={`grid place-items-center bg-[radial-gradient(circle_at_30%_20%,#2a2d33,#121417)] ${className}`}>
      <img src="/images/kira-mark-gold.png" alt="" className="h-16 w-auto opacity-40" />
    </div>
  );
}

/** The property card used in the results, the category pages and the "recomandate" rail (variant compact). */
export function PropertyCard({ p, variant = 'grid', priority = false }: { p: CardProperty; variant?: 'grid' | 'compact'; priority?: boolean }) {
  const compact = variant === 'compact';
  const badge = transactionLabel(p.transaction);
  return (
    <div className={`kira-card group relative flex h-full flex-col overflow-hidden transition duration-300 ${compact
      ? 'rounded-2xl border border-white/10 bg-[#1a1d22] hover:border-[#C8A252]/60'
      : 'rounded-[1.4rem] border border-[#121417]/8 bg-white shadow-[0_10px_34px_rgba(18,20,23,.06)] hover:-translate-y-1 hover:border-[#C8A252]/45 hover:shadow-[0_22px_50px_rgba(18,20,23,.12)]'}`}>
      <Link href={p.path} className="relative block overflow-hidden" aria-label={p.title}>
        {p.photos[0] ? (
          <img
            src={p.photos[0]}
            alt={p.title}
            className={`${compact ? 'aspect-[4/3]' : 'aspect-[4/3]'} w-full object-cover transition duration-700 group-hover:scale-[1.05]`}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
          />
        ) : (
          <PhotoPlaceholder className="aspect-[4/3] w-full" />
        )}
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/45 to-transparent" />
        <span className="absolute left-3 top-3 flex gap-1.5">
          {badge && <span className="rounded-md border border-[#C8A252]/50 bg-[#121417]/80 px-2 py-1 text-[10px] font-bold uppercase tracking-[.14em] text-[#E9CF8E] backdrop-blur">{badge}</span>}
        </span>
        {p.code && <span className="absolute bottom-3 left-3 rounded-md bg-[#C8A252] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.12em] text-[#121417]">{p.code}</span>}
        {p.photoCount > 1 && !compact && <span className="absolute bottom-3 right-3 rounded-md bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">{p.photoCount} poze</span>}
      </Link>
      <FavoriteButton property={p} className={`absolute right-3 top-3 ${compact ? 'h-9 w-9' : ''}`} />
      <div className={`flex flex-1 flex-col ${compact ? 'gap-1.5 p-3.5' : 'gap-2.5 p-5'}`}>
        <p className={`font-semibold tracking-tight text-[#C8A252] ${compact ? 'text-lg' : 'text-[1.35rem]'}`}>{priceLabel(p)}</p>
        <Link href={p.path} className={`line-clamp-2 font-semibold leading-snug transition-colors ${compact ? 'text-[13px] text-white/90 hover:text-[#E9CF8E]' : 'text-[1.02rem] text-[#121417] hover:text-[#9a7a35]'}`}>
          {p.title}
        </Link>
        <p className={`inline-flex items-center gap-1.5 text-[13px] ${compact ? 'text-white/55' : 'text-[#121417]/60'}`}>
          <MapPin size={14} className="shrink-0 text-[#C8A252]" /> <span className="truncate">{placeLabel(p)}</span>
        </p>
        {!compact && <div className="mt-auto border-t border-[#121417]/8 pt-3"><Specs p={p} dark={false} /></div>}
        {compact && <Specs p={p} dark />}
      </div>
    </div>
  );
}
