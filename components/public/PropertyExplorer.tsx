'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { PropertyCard } from './PropertyCard';
import { OpenPanelButton } from './SiteUi';
import { EMPTY, PRICES, SORTS, type Filters, type Sort } from './filters';
import { TYPE_OPTIONS, norm, type CardProperty } from './site';

/*
 * The live search: one state shared by the search bar (in the hero or on /proprietati), the results,
 * the map and the "recomandate" rail. Filters apply as you change them; CAUTĂ scrolls to the results.
 */

/** Featured order: with photos first, then the most recently updated. */
export const featuredOrder = (a: CardProperty, b: CardProperty) =>
  Number(b.photoCount > 0) - Number(a.photoCount > 0) || (b.updatedAt || 0) - (a.updatedAt || 0);

function apply(all: CardProperty[], f: Filters): CardProperty[] {
  const q = norm(f.loc);
  const [pt, range] = f.pret ? f.pret.split(':') : ['', ''];
  const [min, max] = range ? range.split('-').map((v) => (v ? Number(v) : NaN)) : [NaN, NaN];
  const out = all.filter((p) => {
    if (f.tranzactie && p.transaction !== f.tranzactie) return false;
    if (q && !norm([p.city, p.zone, p.county, p.title].filter(Boolean).join(' ')).includes(q)) return false;
    if (f.tip && p.typeLabel !== f.tip) return false;
    if (pt) {
      if (p.transaction !== pt || p.price == null) return false;
      if (!Number.isNaN(min) && p.price < min) return false;
      if (!Number.isNaN(max) && p.price > max) return false;
    }
    return true;
  });
  const by = (get: (p: CardProperty) => number | null, dir: 1 | -1) => (a: CardProperty, b: CardProperty) => {
    const x = get(a), y = get(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (x - y) * dir;
  };
  if (f.sort === 'pret-asc') return out.sort(by((p) => p.price, 1));
  if (f.sort === 'pret-desc') return out.sort(by((p) => p.price, -1));
  if (f.sort === 'suprafata') return out.sort(by((p) => p.surface, -1));
  return out.sort(featuredOrder);
}

type Explorer = { all: CardProperty[]; results: CardProperty[]; filters: Filters; set: (patch: Partial<Filters>) => void; reset: () => void; active: boolean; go: () => void };
const Ctx = createContext<Explorer | null>(null);
export const useExplorer = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useExplorer outside ExplorerProvider');
  return c;
};

export function ExplorerProvider({ properties, initial, syncUrl = false, children }: { properties: CardProperty[]; initial?: Partial<Filters>; syncUrl?: boolean; children: React.ReactNode }) {
  const [filters, setFilters] = useState<Filters>({ ...EMPTY, ...initial });
  const results = useMemo(() => apply(properties, filters), [properties, filters]);
  const first = useRef(true);

  useEffect(() => {
    if (!syncUrl) return;
    if (first.current) { first.current = false; return; }
    const qs = new URLSearchParams();
    if (filters.tranzactie) qs.set('tranzactie', filters.tranzactie);
    if (filters.loc.trim()) qs.set('loc', filters.loc.trim());
    if (filters.tip) qs.set('tip', filters.tip);
    if (filters.pret) qs.set('pret', filters.pret);
    if (filters.sort !== 'recomandate') qs.set('sort', filters.sort);
    const url = `${window.location.pathname}${qs.toString() ? `?${qs}` : ''}`;
    window.history.replaceState(window.history.state, '', url);
  }, [filters, syncUrl]);

  const value = useMemo<Explorer>(() => ({
    all: properties,
    results,
    filters,
    set: (patch) => setFilters((f) => {
      const next = { ...f, ...patch };
      // A price range belongs to one transaction: changing the transaction clears a range of the other one.
      if (patch.tranzactie !== undefined && next.pret && patch.tranzactie && !next.pret.startsWith(`${patch.tranzactie}:`)) next.pret = '';
      if (patch.pret && !next.tranzactie) next.tranzactie = patch.pret.split(':')[0] as Filters['tranzactie'];
      return next;
    }),
    reset: () => setFilters(EMPTY),
    active: !!(filters.tranzactie || filters.loc.trim() || filters.tip || filters.pret),
    go: () => document.getElementById('rezultate')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
  }), [properties, results, filters]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const selectCls = 'h-12 w-full appearance-none rounded-xl border bg-no-repeat pl-4 pr-9 text-[14px] font-medium outline-none transition focus:border-[#C8A252] focus:ring-2 focus:ring-[#C8A252]/25 kira-select';

export function SearchBar({ variant = 'hero' }: { variant?: 'hero' | 'page' }) {
  const { all, filters, set, go } = useExplorer();
  const places = useMemo(() => Array.from(new Set(all.flatMap((p) => [p.city, p.zone && p.city ? `${p.zone}, ${p.city}` : null]).filter((x): x is string => !!x))).sort((a, b) => a.localeCompare(b, 'ro')), [all]);
  const priceGroups: ['vanzare' | 'inchiriere', [string, string][]][] = filters.tranzactie
    ? [[filters.tranzactie, PRICES[filters.tranzactie]]]
    : [['vanzare', PRICES.vanzare], ['inchiriere', PRICES.inchiriere]];
  const hero = variant === 'hero';
  const box = hero
    ? 'border-white/40 bg-[#F6F3EE]/80 shadow-[0_24px_70px_rgba(0,0,0,.35)] backdrop-blur-md'
    : 'border-[#121417]/8 bg-white shadow-[0_16px_50px_rgba(18,20,23,.08)]';
  const input = `${selectCls} border-[#121417]/10 bg-white/95 text-[#121417]`;

  // In the hero (65% column) one row is too tight on laptops, so it wraps into two even rows there.
  const span = (n: 2 | 4) => (hero ? (n === 2 ? 'lg:col-span-2' : 'lg:col-span-4') : '');

  return (
    <form
      role="search"
      aria-label="Caută proprietăți"
      onSubmit={(e) => { e.preventDefault(); go(); }}
      className={`grid gap-2.5 rounded-2xl border p-2.5 sm:grid-cols-2 ${hero ? 'lg:grid-cols-6' : 'lg:grid-cols-[1fr_1.4fr_1.2fr_1.2fr_auto]'} ${box}`}
    >
      <label className={`relative ${span(2)}`}>
        <span className="sr-only">Tip tranzacție</span>
        <select className={input} value={filters.tranzactie} onChange={(e) => set({ tranzactie: e.target.value as Filters['tranzactie'] })}>
          <option value="">Cumpără / Închiriază</option>
          <option value="vanzare">Cumpără</option>
          <option value="inchiriere">Închiriază</option>
        </select>
      </label>
      <label className={`relative ${span(4)}`}>
        <span className="sr-only">Locație</span>
        <input className={`${input} pr-4`} value={filters.loc} onChange={(e) => set({ loc: e.target.value })} list="kira-places" placeholder="Oraș sau zonă (ex. Făgăraș, Schei)" autoComplete="off" />
        <datalist id="kira-places">{places.map((p) => <option key={p} value={p} />)}</datalist>
      </label>
      <label className={`relative ${span(2)}`}>
        <span className="sr-only">Tip proprietate</span>
        <select className={input} value={filters.tip} onChange={(e) => set({ tip: e.target.value })}>
          <option value="">Tip proprietate</option>
          {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label className={`relative ${span(2)}`}>
        <span className="sr-only">Preț</span>
        <select className={input} value={filters.pret} onChange={(e) => set({ pret: e.target.value })}>
          <option value="">Preț</option>
          {priceGroups.map(([t, list]) => (
            <optgroup key={t} label={t === 'vanzare' ? 'Vânzare' : 'Închiriere'}>
              {list.map(([v, l]) => <option key={v} value={`${t}:${v}`}>{l}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <button type="submit" className={`inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#C8A252] px-6 text-sm font-bold tracking-[.14em] text-[#121417] shadow-[0_10px_28px_rgba(200,162,82,.35)] transition hover:bg-[#D4AF37] sm:col-span-2 ${hero ? 'lg:col-span-2' : 'lg:col-span-1'}`}>
        CAUTĂ <Search size={17} />
      </button>
    </form>
  );
}

export function ExplorerResults({ pageSize = 9 }: { pageSize?: number }) {
  const { all, results, filters, set, reset, active } = useExplorer();
  // "Mai multe" grows the list; a new search starts again from the first page.
  const key = JSON.stringify(filters);
  const [more, setMore] = useState({ key, shown: pageSize });
  const shown = more.key === key ? more.shown : pageSize;
  const setShown = (n: number) => setMore({ key, shown: n });

  if (!all.length) {
    return (
      <div className="rounded-[1.4rem] border border-[#C8A252]/25 bg-white p-10 text-center">
        <p className="font-[var(--font-playfair)] text-3xl">Ofertele noi apar aici imediat ce sunt publicate.</p>
        <p className="mx-auto mt-3 max-w-lg text-[#121417]/60">Între timp, spune-ne ce cauți: avem și proprietăți care nu apar public.</p>
        <OpenPanelButton panel={{ kind: 'contact', topic: 'Vreau să cumpăr' }} className="mt-6 rounded-full bg-[#121417] px-6 py-3 font-semibold text-[#F6F3EE] transition hover:bg-black">Spune-ne ce cauți</OpenPanelButton>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#121417]/10 pb-4">
        <p className="text-sm text-[#121417]/65" aria-live="polite">
          <strong className="text-[#121417]">{results.length}</strong> {results.length === 1 ? 'proprietate găsită' : 'proprietăți găsite'}
          {active && <> din {all.length}</>}
        </p>
        <div className="flex items-center gap-2">
          {active && (
            <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-full border border-[#121417]/12 px-4 py-2 text-sm font-semibold transition hover:border-[#C8A252]">
              <RotateCcw size={14} /> Resetează filtrele
            </button>
          )}
          <label className="relative inline-flex items-center gap-2 text-sm text-[#121417]/60">
            <SlidersHorizontal size={15} className="text-[#C8A252]" />
            <span className="sr-only">Sortează</span>
            <select className={`${selectCls} h-10 w-auto border-[#121417]/12 bg-white text-[#121417]`} value={filters.sort} onChange={(e) => set({ sort: e.target.value as Sort })}>
              {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
        </div>
      </div>
      {results.length === 0 ? (
        <div className="mt-8 rounded-[1.4rem] border border-dashed border-[#C8A252]/45 p-10 text-center">
          <p className="font-[var(--font-playfair)] text-2xl">Nicio proprietate nu se potrivește acum.</p>
          <p className="mx-auto mt-2 max-w-md text-[#121417]/60">Lărgește căutarea sau spune-ne exact ce cauți și te anunțăm.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={reset} className="rounded-full border border-[#121417]/15 px-5 py-2.5 font-semibold transition hover:border-[#C8A252]">Resetează filtrele</button>
            <OpenPanelButton panel={{ kind: 'contact' }} className="rounded-full bg-[#121417] px-5 py-2.5 font-semibold text-[#F6F3EE]">Spune-ne ce cauți</OpenPanelButton>
          </div>
        </div>
      ) : (
        <>
          <div className="kira-property-grid mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {results.slice(0, shown).map((p, i) => <PropertyCard key={p.id} p={p} priority={i < 3} />)}
          </div>
          {shown < results.length && (
            <div className="mt-10 text-center">
              <button type="button" onClick={() => setShown(shown + pageSize)} className="rounded-full border border-[#121417]/15 bg-white px-7 py-3 font-semibold transition hover:border-[#C8A252]">
                Mai multe proprietăți ({results.length - shown})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** "Proprietăți recomandate": 2×2 pages of compact cards with arrows. */
export function FeaturedRail() {
  const { all } = useExplorer();
  const list = useMemo(() => [...all].sort(featuredOrder).slice(0, 12), [all]);
  const pages = Math.max(1, Math.ceil(list.length / 4));
  const [page, setPage] = useState(0);
  const shown = list.slice(page * 4, page * 4 + 4);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-[var(--font-playfair)] text-[1.6rem] text-[#F6F3EE]">Proprietăți recomandate</h2>
        {pages > 1 && (
          <div className="flex gap-2">
            <button type="button" aria-label="Înapoi" onClick={() => setPage((page - 1 + pages) % pages)} className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-white/80 transition hover:border-[#C8A252] hover:text-[#E9CF8E]"><ChevronLeft size={18} /></button>
            <button type="button" aria-label="Înainte" onClick={() => setPage((page + 1) % pages)} className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-white/80 transition hover:border-[#C8A252] hover:text-[#E9CF8E]"><ChevronRight size={18} /></button>
          </div>
        )}
      </div>
      {shown.length ? (
        <div key={page} className="kira-fade mt-5 grid flex-1 grid-cols-1 gap-3 min-[480px]:grid-cols-2">
          {shown.map((p, i) => <PropertyCard key={p.id} p={p} variant="compact" priority={page === 0 && i < 2} />)}
        </div>
      ) : (
        <div className="mt-5 flex flex-1 flex-col justify-center rounded-2xl border border-[#C8A252]/30 p-7 text-white/75">
          <p className="font-[var(--font-playfair)] text-2xl text-[#F6F3EE]">Ofertele noi apar aici.</p>
          <p className="mt-2 text-sm leading-6">Proprietățile publicate de echipa Kira se actualizează automat.</p>
          <OpenPanelButton panel={{ kind: 'contact' }} className="mt-5 self-start rounded-full bg-[#C8A252] px-5 py-2.5 text-sm font-semibold text-[#121417]">Spune-ne ce cauți</OpenPanelButton>
        </div>
      )}
      {pages > 1 && (
        <div className="mt-4 flex justify-center gap-1.5" aria-hidden="true">
          {Array.from({ length: pages }, (_, i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === page ? 'w-6 bg-[#C8A252]' : 'w-1.5 bg-white/25'}`} />)}
        </div>
      )}
    </div>
  );
}
