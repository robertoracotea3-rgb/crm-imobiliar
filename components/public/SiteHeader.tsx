'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { Heart, Menu } from 'lucide-react';
import { NAV, useSiteUi } from './SiteUi';

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <img src="/images/kira-mark-gold.png" alt="" width={240} height={234} className={`${compact ? 'h-10' : 'h-11 sm:h-12'} w-auto drop-shadow-[0_0_14px_rgba(200,162,82,.25)]`} />
      <span className="leading-none">
        <span className="block font-[var(--font-playfair)] text-[1.32rem] font-semibold tracking-[.2em] text-[#E9CF8E] sm:text-[1.45rem]">KIRA</span>
        <span className="mt-1 block text-[.55rem] font-semibold tracking-[.46em] text-[#C8A252] sm:text-[.6rem]">IMOBILIARE</span>
      </span>
    </span>
  );
}

const onScrollChange = (l: () => void) => {
  window.addEventListener('scroll', l, { passive: true });
  return () => window.removeEventListener('scroll', l);
};

export function SiteHeader() {
  const pathname = usePathname() || '/';
  const { favorites, open } = useSiteUi();
  const scrolled = useSyncExternalStore(onScrollChange, () => window.scrollY > 12, () => false);

  const active = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));
  const count = favorites.length;

  return (
    <header className={`kira-site-header sticky top-0 z-50 border-b text-[#F6F3EE] backdrop-blur-xl transition-[background-color,box-shadow,border-color] duration-300 ${scrolled ? 'border-[#C8A252]/25 bg-[#121417]/92 shadow-[0_10px_40px_rgba(0,0,0,.35)]' : 'border-white/10 bg-[#121417]/78'}`}>
      <div className="mx-auto flex h-[4.5rem] max-w-[92rem] items-center gap-3 px-4 sm:px-6 lg:px-10">
        <Link href="/" aria-label="Kira Imobiliare — pagina principală" className="kira-brand shrink-0" prefetch={false}>
          <BrandMark />
        </Link>
        <nav aria-label="Navigație principală" className="kira-main-nav mx-auto hidden items-center gap-8 text-[.92rem] font-medium lg:flex">
          {NAV.map((l) => (
            <Link key={l.href} href={l.href} aria-current={active(l.href) ? 'page' : undefined} className={`kira-nav-link py-2 transition-colors ${active(l.href) ? 'text-[#E9CF8E]' : 'text-white/80 hover:text-[#E9CF8E]'}`}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <button type="button" onClick={() => open({ kind: 'favorites' })} aria-label={`Proprietăți salvate${count ? ` (${count})` : ''}`} className="relative grid h-11 w-11 place-items-center rounded-full border border-white/12 text-white/85 transition hover:border-[#C8A252] hover:text-[#E9CF8E]">
            <Heart size={19} />
            {count > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-[#C8A252] px-1 text-[11px] font-bold text-[#121417]">{count}</span>}
          </button>
          <button type="button" onClick={() => open({ kind: 'contact' })} className="hidden rounded-full border border-[#C8A252]/75 px-5 py-2.5 text-sm font-semibold text-[#E9CF8E] transition hover:bg-[#C8A252]/10 md:inline-flex">
            Contactează-ne
          </button>
          <button type="button" onClick={() => open({ kind: 'listing' })} className="kira-button hidden rounded-full bg-[#C8A252] px-5 py-2.5 text-sm font-semibold text-[#121417] shadow-[0_8px_26px_rgba(200,162,82,.28)] transition hover:bg-[#D4AF37] sm:inline-flex">
            Adaugă anunț
          </button>
          <button type="button" onClick={() => open({ kind: 'menu' })} aria-label="Deschide meniul" className="grid h-11 w-11 place-items-center rounded-full border border-white/12 text-white/90 transition hover:border-[#C8A252] lg:hidden">
            <Menu size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}
