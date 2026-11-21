import Link from 'next/link';
import { PublicMotion } from './PublicMotion';
import { SiteHeader } from './SiteHeader';
import { SiteUiProvider } from './SiteUi';
import { SITE, waLink } from './site';

export function PublicSiteFrame({ children }: { children: React.ReactNode }) {
  return (
    <SiteUiProvider>
      <div className="kira-public min-h-screen bg-[#F6F3EE] text-[#121417]">
        <PublicMotion />
        <a className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:p-3" href="#continut">
          Sari la conținut
        </a>
        <SiteHeader />
        {children}
        <footer id="contact" className="kira-site-footer relative overflow-hidden border-t border-[#C8A252]/25 bg-[#121417] text-white">
          <div aria-hidden="true" className="pointer-events-none absolute -left-32 -top-40 h-96 w-96 rounded-full bg-[#C8A252]/10 blur-[110px]" />
          <div className="relative mx-auto grid max-w-[92rem] gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.1fr_1fr_1fr_1fr] lg:px-10">
            <div>
              <img src="/images/kira-logo-gold.png" alt="Kira Imobiliare" width={420} height={518} className="h-28 w-auto" loading="lazy" />
              <p className="mt-5 max-w-xs text-sm leading-6 text-white/60">
                Consultanță imobiliară pentru vânzare, cumpărare și închiriere în Făgăraș, împrejurimi și Brașov.
              </p>
            </div>
            <div className="text-sm leading-7 text-white/70">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[.22em] text-[#C8A252]">Contact</p>
              <a href={SITE.phoneLink} className="block text-base font-semibold text-white hover:text-[#E9CF8E]">{SITE.phone}</a>
              <a href={`mailto:${SITE.email}`} className="block hover:text-[#E9CF8E]">{SITE.email}</a>
              <a href={waLink()} className="block hover:text-[#E9CF8E]">Scrie-ne pe WhatsApp</a>
              <p className="mt-2">{SITE.address}</p>
              <p>Luni–Vineri 09:00–18:00 · Sâmbătă 09:00–14:00</p>
            </div>
            <div className="flex flex-col items-start gap-2 text-sm text-white/70">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[.22em] text-[#C8A252]">Explorează</p>
              <Link href="/proprietati" className="hover:text-[#E9CF8E]">Proprietăți</Link>
              <Link href="/localitati/fagaras" className="hover:text-[#E9CF8E]">Imobiliare Făgăraș</Link>
              <Link href="/localitati/brasov" className="hover:text-[#E9CF8E]">Imobiliare Brașov</Link>
              <Link href="/servicii" className="hover:text-[#E9CF8E]">Servicii imobiliare</Link>
              <Link href="/agenti" className="hover:text-[#E9CF8E]">Echipa Kira</Link>
              <Link href="/blog" className="hover:text-[#E9CF8E]">Ghiduri</Link>
            </div>
            <div className="flex flex-col items-start gap-2 text-sm text-white/70">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[.22em] text-[#C8A252]">Urmărește-ne</p>
              <a href="https://www.facebook.com/kiraimobiliare" target="_blank" rel="noreferrer" className="hover:text-[#E9CF8E]">Facebook</a>
              <a href="https://www.instagram.com/kiraimobiliare/" target="_blank" rel="noreferrer" className="hover:text-[#E9CF8E]">Instagram</a>
              <a href="https://www.tiktok.com/@kiraimobiliare.ro" target="_blank" rel="noreferrer" className="hover:text-[#E9CF8E]">TikTok</a>
            </div>
          </div>
          <div className="relative border-t border-white/10">
            <div className="mx-auto flex max-w-[92rem] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-6 text-xs text-white/45 sm:px-8 lg:px-10">
              <p>FORTIS RRA S.R.L. · CUI 54616680 · Reg. Com. J2026029337008 · © {new Date().getFullYear()} Kira Imobiliare</p>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                <Link href="/politica-confidentialitate" className="hover:text-[#E9CF8E]">Confidențialitate</Link>
                <Link href="/politica-cookies" className="hover:text-[#E9CF8E]">Cookies</Link>
                <Link href="/termeni" className="hover:text-[#E9CF8E]">Termeni</Link>
                <Link href="/anpc-sal" className="hover:text-[#E9CF8E]">ANPC/SAL</Link>
                <Link href="/accesibilitate" className="hover:text-[#E9CF8E]">Accesibilitate</Link>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </SiteUiProvider>
  );
}
