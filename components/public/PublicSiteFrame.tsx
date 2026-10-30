import { KiraLogo } from './KiraLogo';
import Link from 'next/link';
import { PublicMotion } from './PublicMotion';

const phone = '0775 132 969';
const phoneLink = 'tel:+40775132969';
const whatsappLink = 'https://wa.me/40775132969';

export function PublicSiteFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="kira-public min-h-screen bg-[#f7f6f2] text-[#172820]">
      <PublicMotion />
      <a className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-3" href="#continut">
        Sari la conținut
      </a>
      <header className="sticky top-0 z-40 border-b border-[#d7ae63]/25 bg-[#070b12]/95 text-[#fbf4e7] shadow-[0_8px_30px_rgba(0,0,0,.18)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-2 sm:gap-6 sm:px-8">
          <Link href="/" aria-label="Kira Imobiliare — pagina principală" className="kira-brand shrink-0" prefetch={false}>
            <KiraLogo className="h-11 w-[11.25rem] sm:h-[3.15rem] sm:w-[12.5rem]" />
          </Link>
          <nav aria-label="Navigație principală" className="hidden items-center gap-4 text-sm font-medium xl:flex">
            <Link href="/proprietati">Proprietăți</Link>
            <Link href="/#zone">Localități</Link>
            <Link href="/servicii">Servicii</Link>
            <Link href="/despre-noi">Despre noi</Link>
            <Link href="/blog">Blog</Link>
            <Link href="/#contact">Contact</Link>
          </nav>
          <a href={phoneLink} aria-label={`Sună la ${phone}`} className="kira-button whitespace-nowrap rounded-full bg-[#c99a48] px-3 py-2 text-xs font-semibold text-[#101722] shadow-[0_4px_20px_rgba(201,154,72,.2)] sm:px-4 sm:py-2.5 sm:text-sm">
            <span className="sm:hidden">Sună</span><span className="hidden sm:inline">Sună: {phone}</span>
          </a>
        </div>
        <details className="border-t border-white/10 px-5 py-3 xl:hidden">
          <summary className="cursor-pointer text-sm font-semibold text-[#e4bd70]">Meniu</summary>
          <nav aria-label="Navigație mobilă" className="grid grid-cols-2 gap-3 pt-3 text-sm text-white/85">
            <Link href="/proprietati">Proprietăți</Link>
            <Link href="/localitati">Localități</Link>
            <Link href="/servicii">Servicii</Link>
            <Link href="/agenti">Agenți</Link>
            <Link href="/despre-noi">Despre noi</Link>
            <Link href="/blog">Blog</Link>
            <Link href="/contact">Contact</Link>
          </nav>
        </details>
      </header>
      {children}
      <footer id="contact" className="border-t border-[#d7ae63]/20 bg-[#080d14] text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:px-8 md:grid-cols-3">
          <div>
            <KiraLogo className="h-14 w-[14rem] sm:h-16 sm:w-[16rem]" />
            <p className="mt-3 max-w-sm text-sm leading-6 text-white/75">
              Consultanță imobiliară pentru vânzare, cumpărare și închiriere în Făgăraș, împrejurimi și Brașov.
            </p>
          </div>
          <div className="text-sm leading-7 text-white/80">
            <p className="font-semibold text-white">Contact</p>
            <a href={phoneLink} className="block hover:text-[#e4bd70]">{phone}</a>
            <a href="mailto:contact@kiraimobiliare.ro" className="block hover:text-[#e4bd70]">contact@kiraimobiliare.ro</a>
            <p>Str. Ion Creangă 35, Făgăraș, jud. Brașov</p>
          </div>
          <div className="flex flex-col items-start gap-3 text-sm">
            <Link href="/localitati/brasov">Imobiliare Brașov</Link>
            <Link href="/servicii">Servicii imobiliare</Link>
            <Link href="/agenti">Echipa Kira</Link>
            <a href={whatsappLink}>Scrie-ne pe WhatsApp</a>
            <div className="flex gap-4 text-white/80"><a href="https://www.facebook.com/kiraimobiliare" target="_blank" rel="noreferrer">Facebook</a><a href="https://www.instagram.com/kiraimobiliare/" target="_blank" rel="noreferrer">Instagram</a><a href="https://www.tiktok.com/@kiraimobiliare.ro" target="_blank" rel="noreferrer">TikTok</a></div>
            <p className="pt-4 text-xs text-white/55">FORTIS RRA S.R.L. · CUI 54616680 · Reg. Com. J2026029337008</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-white/60"><Link href="/politica-confidentialitate">Confidențialitate</Link><Link href="/politica-cookies">Cookies</Link><Link href="/termeni">Termeni</Link><Link href="/anpc-sal">ANPC/SAL</Link></div>
            <p className="pt-2 text-xs text-white/55">© {new Date().getFullYear()} Kira Imobiliare. Toate drepturile rezervate.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
