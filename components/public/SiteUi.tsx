'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, Heart, MessageCircle, Phone, Trash2, X } from 'lucide-react';
import { SITE, TYPE_OPTIONS, num, placeLabel, priceLabel, transactionLabel, waLink, type CardProperty } from './site';

/*
 * Everything on the public site that opens on top of the page: the favourites drawer, the contact /
 * viewing form, the 3-step "Adaugă anunț" form and the phone menu. Forms send nothing to a server:
 * they write a WhatsApp message to the agency that the visitor sends themselves.
 */

type Panel =
  | { kind: 'contact'; topic?: string; property?: { code: string | null; title: string } }
  | { kind: 'listing' }
  | { kind: 'favorites' }
  | { kind: 'menu' }
  | null;

type SiteUi = {
  favorites: CardProperty[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (p: CardProperty) => void;
  removeFavorite: (id: string) => void;
  clearFavorites: () => void;
  open: (panel: Exclude<Panel, null>) => void;
  close: () => void;
};

const Ctx = createContext<SiteUi | null>(null);

export function useSiteUi(): SiteUi {
  const ui = useContext(Ctx);
  if (!ui) throw new Error('useSiteUi outside SiteUiProvider');
  return ui;
}

/* Favourites live in localStorage; this tiny store lets React read them without a hydration mismatch
   (the server and the first render see an empty list) and keeps other open tabs in sync. */
const STORE = 'kira-favorite';
const NONE: CardProperty[] = [];
const listeners = new Set<() => void>();
let cached: CardProperty[] | null = null;

function readFavorites(): CardProperty[] {
  if (cached) return cached;
  try {
    const raw = window.localStorage.getItem(STORE);
    const list: unknown = raw ? JSON.parse(raw) : [];
    cached = Array.isArray(list) ? list.filter((p): p is CardProperty => !!p && typeof p === 'object' && typeof (p as CardProperty).id === 'string').slice(0, 30) : [];
  } catch { cached = []; }
  return cached;
}

function writeFavorites(list: CardProperty[]) {
  cached = list;
  try { window.localStorage.setItem(STORE, JSON.stringify(list)); } catch { /* storage unavailable: kept for this visit */ }
  listeners.forEach((l) => l());
}

function subscribeFavorites(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => { if (e.key === STORE) { cached = null; l(); } };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(l); window.removeEventListener('storage', onStorage); };
}

const noSubscribe = () => () => {};
/** False on the server and during hydration, true afterwards. */
export const useHydrated = () => useSyncExternalStore(noSubscribe, () => true, () => false);

export function SiteUiProvider({ children }: { children: React.ReactNode }) {
  const favorites = useSyncExternalStore(subscribeFavorites, readFavorites, () => NONE);
  const [panel, setPanel] = useState<Panel>(null);
  const mounted = useHydrated();

  const close = useCallback(() => setPanel(null), []);
  const value = useMemo<SiteUi>(() => ({
    favorites,
    isFavorite: (id) => favorites.some((f) => f.id === id),
    toggleFavorite: (p) => { const list = readFavorites(); writeFavorites(list.some((f) => f.id === p.id) ? list.filter((f) => f.id !== p.id) : [p, ...list].slice(0, 30)); },
    removeFavorite: (id) => writeFavorites(readFavorites().filter((f) => f.id !== id)),
    clearFavorites: () => writeFavorites([]),
    open: (next) => setPanel(next),
    close,
  }), [favorites, close]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {mounted && panel && createPortal(
        panel.kind === 'favorites' ? <FavoritesDrawer onClose={close} />
          : panel.kind === 'menu' ? <MobileMenu onClose={close} />
          : panel.kind === 'listing' ? <ListingWizard onClose={close} />
          : <ContactForm onClose={close} topic={panel.topic} property={panel.property} />,
        document.body,
      )}
    </Ctx.Provider>
  );
}

/* ---------- shared shell ---------- */

function useEscapeAndLock(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
}

function Overlay({ onClose, children, side = false, label }: { onClose: () => void; children: React.ReactNode; side?: boolean; label: string }) {
  useEscapeAndLock(onClose);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus(); }, []);
  return (
    <div className="kira-ui fixed inset-0 z-[90] flex" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" aria-label="Închide" tabIndex={-1} onClick={onClose} className="absolute inset-0 cursor-default bg-[#08090b]/70 backdrop-blur-sm" />
      <div
        ref={box}
        className={side
          ? 'kira-slide-in relative ml-auto flex h-full w-full max-w-md flex-col overflow-y-auto bg-[#121417] text-[#F6F3EE] shadow-2xl'
          : 'kira-pop-in relative m-auto max-h-[92vh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-[1.75rem] border border-[#C8A252]/30 bg-[#F6F3EE] text-[#121417] shadow-[0_40px_120px_rgba(0,0,0,.45)]'}
      >
        {children}
      </div>
    </div>
  );
}

function CloseButton({ onClose, dark = false }: { onClose: () => void; dark?: boolean }) {
  return (
    <button type="button" onClick={onClose} aria-label="Închide" className={`absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full border transition ${dark ? 'border-white/15 text-white/80 hover:border-[#C8A252] hover:text-[#E9CF8E]' : 'border-[#121417]/10 text-[#121417]/70 hover:border-[#C8A252] hover:text-[#121417]'}`}>
      <X size={18} />
    </button>
  );
}

const field = 'mt-1.5 w-full rounded-xl border border-[#121417]/12 bg-white px-4 py-3 text-[15px] text-[#121417] outline-none transition focus:border-[#C8A252] focus:ring-2 focus:ring-[#C8A252]/25';
const labelCls = 'block text-[13px] font-semibold text-[#121417]/80';

function Done({ title, text, wa, onClose }: { title: string; text: string; wa: string; onClose: () => void }) {
  return (
    <div className="px-7 pb-8 pt-10 text-center sm:px-10">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#C8A252] text-[#121417]"><Check size={26} /></span>
      <h2 className="mt-5 font-[var(--font-playfair)] text-3xl">{title}</h2>
      <p className="mx-auto mt-3 max-w-sm leading-7 text-[#121417]/70">{text}</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#121417] px-6 py-3 font-semibold text-[#F6F3EE] transition hover:bg-black"><MessageCircle size={18} /> Deschide WhatsApp</a>
        <a href={SITE.phoneLink} className="inline-flex items-center gap-2 rounded-full border border-[#121417]/15 px-6 py-3 font-semibold transition hover:border-[#C8A252]"><Phone size={17} /> {SITE.phone}</a>
      </div>
      <button type="button" onClick={onClose} className="mt-6 text-sm font-semibold text-[#121417]/60 underline-offset-4 hover:underline">Închide</button>
    </div>
  );
}

const phoneOk = (v: string) => v.replace(/\D/g, '').length >= 9;
const today = () => new Date().toISOString().slice(0, 10);
const roDate = (iso: string) => (iso ? iso.split('-').reverse().join('.') : '');

/* ---------- contact / viewing / private discussion ---------- */

const TOPICS = ['Vreau să cumpăr', 'Vreau să vând', 'Caut o chirie', 'Evaluare gratuită', 'Discuție privată (Private Client)', 'Programare vizionare'];
const SLOTS = ['09:00 – 12:00', '12:00 – 15:00', '15:00 – 18:00', 'Sâmbătă 09:00 – 14:00'];

function ContactForm({ onClose, topic, property }: { onClose: () => void; topic?: string; property?: { code: string | null; title: string } }) {
  const [f, setF] = useState({ name: '', phone: '', topic: topic || (property ? 'Programare vizionare' : TOPICS[0]), date: '', slot: SLOTS[0], message: '' });
  const [error, setError] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return setError('Scrie-ne numele tău.');
    if (!phoneOk(f.phone)) return setError('Telefonul pare incomplet.');
    const lines = [
      `Bună ziua! Sunt ${f.name.trim()}.`,
      `Subiect: ${f.topic}${property ? ` – ${property.title}${property.code ? ` (cod ${property.code})` : ''}` : ''}.`,
      f.date ? `Aș prefera ${roDate(f.date)}, ${f.slot}.` : `Interval preferat: ${f.slot}.`,
      f.message.trim() ? f.message.trim() : '',
      `Telefon: ${f.phone.trim()}`,
    ].filter(Boolean);
    const link = waLink(lines.join('\n'));
    setSent(link);
    window.open(link, '_blank', 'noopener');
  }

  return (
    <Overlay onClose={onClose} label="Contactează-ne">
      <CloseButton onClose={onClose} />
      {sent ? (
        <Done onClose={onClose} wa={sent} title="Mesajul e pregătit" text="S-a deschis WhatsApp cu mesajul completat. Apasă Trimite acolo și te contactăm în aceeași zi lucrătoare." />
      ) : (
        <form onSubmit={submit} className="px-7 pb-8 pt-9 sm:px-10" noValidate>
          <p className="text-[11px] font-bold uppercase tracking-[.22em] text-[#9a7a35]">{property ? 'Programează o vizionare' : 'Contactează-ne'}</p>
          <h2 className="mt-3 pr-10 font-[var(--font-playfair)] text-[2rem] leading-tight">{property ? property.title : 'Hai să stabilim o discuție'}</h2>
          <p className="mt-2 text-[15px] leading-6 text-[#121417]/65">Alege ziua și intervalul. Confirmăm telefonic disponibilitatea.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className={labelCls}>Nume<input className={field} value={f.name} onChange={set('name')} autoComplete="name" required /></label>
            <label className={labelCls}>Telefon<input className={field} value={f.phone} onChange={set('phone')} type="tel" autoComplete="tel" inputMode="tel" required /></label>
            {!property && (
              <label className={`${labelCls} sm:col-span-2`}>Ce te interesează<select className={field} value={f.topic} onChange={set('topic')}>{TOPICS.map((t) => <option key={t}>{t}</option>)}</select></label>
            )}
            <label className={labelCls}>Data preferată<input className={field} type="date" min={today()} value={f.date} onChange={set('date')} /></label>
            <label className={labelCls}>Interval orar<select className={field} value={f.slot} onChange={set('slot')}>{SLOTS.map((s) => <option key={s}>{s}</option>)}</select></label>
            <label className={`${labelCls} sm:col-span-2`}>Mesaj (opțional)<textarea className={`${field} min-h-24 resize-y`} value={f.message} onChange={set('message')} /></label>
          </div>
          {error && <p role="alert" className="mt-4 rounded-xl bg-[#7a1d1d]/10 px-4 py-3 text-sm font-semibold text-[#7a1d1d]">{error}</p>}
          <button type="submit" className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#C8A252] px-6 py-3.5 font-semibold text-[#121417] shadow-[0_12px_32px_rgba(200,162,82,.35)] transition hover:bg-[#D4AF37]">
            Trimite pe WhatsApp <ArrowRight size={18} />
          </button>
          <p className="mt-4 text-center text-xs leading-5 text-[#121417]/55">
            Datele tale pleacă doar în mesajul pe care îl trimiți tu. <Link href="/politica-confidentialitate" className="underline underline-offset-2" onClick={onClose}>Confidențialitate</Link>
          </p>
        </form>
      )}
    </Overlay>
  );
}

/* ---------- "Adaugă anunț": 3 steps for owners ---------- */

function ListingWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [f, setF] = useState({ tranzactie: 'Vânzare', tip: TYPE_OPTIONS[0], localitate: '', zona: '', suprafata: '', camere: '', pret: '', detalii: '', name: '', phone: '', email: '', acord: false });
  const [error, setError] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target instanceof HTMLInputElement && e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  function next(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (step === 1 && !f.localitate.trim()) return setError('Scrie localitatea proprietății.');
    if (step === 2 && !f.suprafata.trim()) return setError('Scrie suprafața aproximativă.');
    if (step < 3) return setStep(step + 1);
    if (!f.name.trim()) return setError('Scrie-ne numele tău.');
    if (!phoneOk(f.phone)) return setError('Telefonul pare incomplet.');
    if (!f.acord) return setError('Bifează acordul ca să te putem contacta.');
    const text = [
      'Bună ziua! Vreau să listez o proprietate la Kira Imobiliare.',
      `${f.tranzactie} · ${f.tip} · ${f.localitate.trim()}${f.zona.trim() ? `, ${f.zona.trim()}` : ''}`,
      `Suprafață: ${f.suprafata.trim()} m²${f.camere.trim() ? ` · ${f.camere.trim()} camere` : ''}${f.pret.trim() ? ` · preț dorit: ${f.pret.trim()} €` : ''}`,
      f.detalii.trim(),
      `${f.name.trim()} · ${f.phone.trim()}${f.email.trim() ? ` · ${f.email.trim()}` : ''}`,
    ].filter(Boolean).join('\n');
    const link = waLink(text);
    setSent(link);
    window.open(link, '_blank', 'noopener');
  }

  const steps = ['Proprietate & locație', 'Suprafață & preț', 'Datele tale'];
  return (
    <Overlay onClose={onClose} label="Adaugă anunț">
      <CloseButton onClose={onClose} />
      {sent ? (
        <Done onClose={onClose} wa={sent} title="Mulțumim!" text="Mesajul cu detaliile proprietății e pregătit în WhatsApp. După ce îl trimiți, te sunăm pentru evaluare și pașii de promovare." />
      ) : (
        <form onSubmit={next} className="px-7 pb-8 pt-9 sm:px-10" noValidate>
          <p className="text-[11px] font-bold uppercase tracking-[.22em] text-[#9a7a35]">Adaugă anunț · evaluare gratuită</p>
          <h2 className="mt-3 pr-10 font-[var(--font-playfair)] text-[2rem] leading-tight">Listează-ți proprietatea</h2>
          <ol className="mt-6 grid grid-cols-3 gap-2" aria-label="Pași">
            {steps.map((s, i) => (
              <li key={s} className="text-[11px] font-semibold leading-4 text-[#121417]/55">
                <span className={`mb-2 block h-1 rounded-full transition ${i < step ? 'bg-[#C8A252]' : 'bg-[#121417]/10'}`} />
                <span className={i + 1 === step ? 'text-[#121417]' : ''}>{i + 1}. {s}</span>
              </li>
            ))}
          </ol>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {step === 1 && (<>
              <label className={labelCls}>Tranzacție<select className={field} value={f.tranzactie} onChange={set('tranzactie')}><option>Vânzare</option><option>Închiriere</option></select></label>
              <label className={labelCls}>Tip proprietate<select className={field} value={f.tip} onChange={set('tip')}>{TYPE_OPTIONS.map((t) => <option key={t}>{t}</option>)}</select></label>
              <label className={labelCls}>Localitate<input className={field} value={f.localitate} onChange={set('localitate')} placeholder="ex. Făgăraș" /></label>
              <label className={labelCls}>Zonă / cartier<input className={field} value={f.zona} onChange={set('zona')} placeholder="opțional" /></label>
            </>)}
            {step === 2 && (<>
              <label className={labelCls}>Suprafață (m²)<input className={field} value={f.suprafata} onChange={set('suprafata')} inputMode="decimal" /></label>
              <label className={labelCls}>Camere<input className={field} value={f.camere} onChange={set('camere')} inputMode="numeric" placeholder="opțional" /></label>
              <label className={`${labelCls} sm:col-span-2`}>Preț dorit (€)<input className={field} value={f.pret} onChange={set('pret')} inputMode="numeric" placeholder="opțional – te ajutăm cu evaluarea" /></label>
              <label className={`${labelCls} sm:col-span-2`}>Ce ar trebui să știm<textarea className={`${field} min-h-24 resize-y`} value={f.detalii} onChange={set('detalii')} placeholder="an, etaj, stare, curte, garaj..." /></label>
            </>)}
            {step === 3 && (<>
              <label className={labelCls}>Nume<input className={field} value={f.name} onChange={set('name')} autoComplete="name" /></label>
              <label className={labelCls}>Telefon<input className={field} value={f.phone} onChange={set('phone')} type="tel" autoComplete="tel" inputMode="tel" /></label>
              <label className={`${labelCls} sm:col-span-2`}>Email (opțional)<input className={field} value={f.email} onChange={set('email')} type="email" autoComplete="email" /></label>
              <label className="flex items-start gap-3 text-sm leading-6 text-[#121417]/75 sm:col-span-2">
                <input type="checkbox" checked={f.acord} onChange={set('acord')} className="mt-1 h-4 w-4 accent-[#C8A252]" />
                <span>Sunt de acord să fiu contactat de Kira Imobiliare pentru această proprietate.</span>
              </label>
            </>)}
          </div>
          {error && <p role="alert" className="mt-4 rounded-xl bg-[#7a1d1d]/10 px-4 py-3 text-sm font-semibold text-[#7a1d1d]">{error}</p>}
          <div className="mt-6 flex gap-3">
            {step > 1 && <button type="button" onClick={() => { setError(''); setStep(step - 1); }} className="rounded-full border border-[#121417]/15 px-6 py-3.5 font-semibold transition hover:border-[#C8A252]">Înapoi</button>}
            <button type="submit" className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[#C8A252] px-6 py-3.5 font-semibold text-[#121417] shadow-[0_12px_32px_rgba(200,162,82,.35)] transition hover:bg-[#D4AF37]">
              {step < 3 ? 'Continuă' : 'Trimite pe WhatsApp'} <ArrowRight size={18} />
            </button>
          </div>
        </form>
      )}
    </Overlay>
  );
}

/* ---------- favourites ---------- */

export function FavoriteButton({ property, className = '' }: { property: CardProperty; className?: string }) {
  const { isFavorite, toggleFavorite } = useSiteUi();
  const on = isFavorite(property.id);
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(property); }}
      aria-pressed={on}
      aria-label={on ? 'Scoate de la favorite' : 'Salvează la favorite'}
      className={`grid h-10 w-10 place-items-center rounded-full border backdrop-blur-md transition hover:scale-105 ${on ? 'border-[#C8A252] bg-[#C8A252] text-[#121417]' : 'border-white/30 bg-[#121417]/45 text-white hover:border-[#C8A252]'} ${className}`}
    >
      <Heart size={18} fill={on ? 'currentColor' : 'none'} />
    </button>
  );
}

function FavoritesDrawer({ onClose }: { onClose: () => void }) {
  const { favorites, removeFavorite, clearFavorites } = useSiteUi();
  const rows: [string, (p: CardProperty) => string][] = [
    ['Preț', (p) => priceLabel(p)],
    ['Suprafață', (p) => (p.surface ? `${num(p.surface)} m²` : '–')],
    ['Camere', (p) => (p.rooms != null ? num(p.rooms) : '–')],
    ['Etaj', (p) => p.floor || '–'],
    ['Zonă', (p) => placeLabel(p)],
    ['Tranzacție', (p) => transactionLabel(p.transaction) || '–'],
  ];
  return (
    <Overlay onClose={onClose} side label="Proprietăți salvate">
      <CloseButton onClose={onClose} dark />
      <div className="px-6 pb-4 pt-8">
        <p className="text-[11px] font-bold uppercase tracking-[.22em] text-[#C8A252]">Favorite</p>
        <h2 className="mt-2 font-[var(--font-playfair)] text-3xl">Proprietăți salvate</h2>
        <p className="mt-2 text-sm text-white/55">Rămân salvate pe acest dispozitiv.</p>
      </div>
      {favorites.length === 0 ? (
        <div className="mx-6 mt-4 rounded-2xl border border-white/10 p-6 text-center text-sm leading-6 text-white/65">
          <Heart className="mx-auto mb-3 text-[#C8A252]" />
          Apasă inimioara de pe o proprietate ca s-o salvezi aici și s-o compari cu altele.
          <Link href="/proprietati" onClick={onClose} className="mt-4 block font-semibold text-[#E9CF8E]">Vezi proprietățile →</Link>
        </div>
      ) : (
        <>
          <ul className="space-y-3 px-6">
            {favorites.map((p) => (
              <li key={p.id} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[.03] p-3">
                <Link href={p.path} onClick={onClose} className="h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-white/5">
                  {p.photos[0] ? <img src={p.photos[0]} alt="" className="h-full w-full object-cover" loading="lazy" /> : null}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={p.path} onClick={onClose} className="line-clamp-2 text-sm font-semibold leading-5 hover:text-[#E9CF8E]">{p.title}</Link>
                  <p className="mt-1 text-sm font-semibold text-[#E9CF8E]">{priceLabel(p)}</p>
                  <p className="truncate text-xs text-white/50">{placeLabel(p)}</p>
                </div>
                <button type="button" onClick={() => removeFavorite(p.id)} aria-label={`Scoate ${p.title}`} className="self-start rounded-full p-2 text-white/45 transition hover:text-[#E9CF8E]"><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
          {favorites.length > 1 && (
            <div className="mt-6 px-6">
              <h3 className="text-sm font-semibold uppercase tracking-[.16em] text-[#C8A252]">Comparație</h3>
              <div className="mt-3 overflow-x-auto rounded-2xl border border-white/10">
                <table className="w-full min-w-[28rem] text-left text-xs">
                  <thead><tr className="border-b border-white/10 bg-white/[.04]"><th className="p-3" />{favorites.map((p) => <th key={p.id} className="p-3 font-semibold text-white/85">{p.code || p.title.slice(0, 18)}</th>)}</tr></thead>
                  <tbody>{rows.map(([label, get]) => <tr key={label} className="border-b border-white/5 last:border-0"><th className="p-3 font-medium text-white/45">{label}</th>{favorites.map((p) => <td key={p.id} className="p-3 text-white/85">{get(p)}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
          <div className="mt-auto flex items-center justify-between gap-3 px-6 py-6">
            <button type="button" onClick={clearFavorites} className="text-sm font-semibold text-white/50 hover:text-white">Golește lista</button>
            <a href={waLink(`Bună ziua! Mă interesează: ${favorites.map((p) => p.code || p.title).join(', ')}.`)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#C8A252] px-5 py-3 text-sm font-semibold text-[#121417] transition hover:bg-[#D4AF37]"><MessageCircle size={16} /> Întreabă de ele</a>
          </div>
        </>
      )}
    </Overlay>
  );
}

/* ---------- phone menu ---------- */

export const NAV = [
  { href: '/', label: 'Acasă' },
  { href: '/proprietati', label: 'Proprietăți' },
  { href: '/servicii', label: 'Servicii' },
  { href: '/despre-noi', label: 'Despre noi' },
  { href: '/contact', label: 'Contact' },
];

function MobileMenu({ onClose }: { onClose: () => void }) {
  const { open } = useSiteUi();
  return (
    <Overlay onClose={onClose} side label="Meniu">
      <CloseButton onClose={onClose} dark />
      <nav aria-label="Navigație mobilă" className="flex flex-col gap-1 px-6 pt-20">
        {[...NAV, { href: '/localitati', label: 'Localități' }, { href: '/blog', label: 'Ghiduri' }].map((l) => (
          <Link key={l.href} href={l.href} onClick={onClose} className="border-b border-white/10 py-4 font-[var(--font-playfair)] text-2xl text-white/90 transition hover:text-[#E9CF8E]">{l.label}</Link>
        ))}
      </nav>
      <div className="mt-auto grid gap-3 px-6 py-8">
        <button type="button" onClick={() => open({ kind: 'contact' })} className="rounded-full border border-[#C8A252]/70 px-6 py-3.5 font-semibold text-[#E9CF8E]">Contactează-ne</button>
        <button type="button" onClick={() => open({ kind: 'listing' })} className="rounded-full bg-[#C8A252] px-6 py-3.5 font-semibold text-[#121417]">Adaugă anunț</button>
        <a href={SITE.phoneLink} className="mt-2 text-center text-sm text-white/60">{SITE.phone}</a>
      </div>
    </Overlay>
  );
}

/** A button anywhere on a server-rendered page that opens one of the panels above. */
export function OpenPanelButton({ panel, className, children }: { panel: Exclude<Panel, null>; className?: string; children: React.ReactNode }) {
  const { open } = useSiteUi();
  return <button type="button" onClick={() => open(panel)} className={className}>{children}</button>;
}
