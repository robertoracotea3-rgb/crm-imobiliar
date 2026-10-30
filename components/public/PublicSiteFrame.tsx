import Image from 'next/image';
import Link from 'next/link';

const phone = '0775 132 969';
const phoneLink = 'tel:+40775132969';
const whatsappLink = 'https://wa.me/40775132969';

export function PublicSiteFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7f6f2] text-[#172820]">
      <a className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-3" href="#continut">
        Sari la conținut
      </a>
      <header className="border-b border-[#e5e7e1] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-3 sm:px-8">
          <Link href="/" aria-label="Kira Imobiliare — pagina principală" className="shrink-0">
            <Image src="/images/logo-kira.png" alt="Kira Imobiliare" width={160} height={72} priority className="h-14 w-auto object-contain" />
          </Link>
          <nav aria-label="Navigație principală" className="hidden items-center gap-5 text-sm font-medium lg:flex">
            <Link href="/proprietati" className="hover:text-[#0c7456]">Proprietăți</Link>
            <Link href="/#zone" className="hover:text-[#0c7456]">Localități</Link>
            <Link href="/servicii" className="hover:text-[#0c7456]">Servicii</Link>
            <Link href="/despre-noi" className="hover:text-[#0c7456]">Despre noi</Link>
            <Link href="/blog" className="hover:text-[#0c7456]">Blog</Link>
            <Link href="/#contact" className="hover:text-[#0c7456]">Contact</Link>
          </nav>
          <a href={phoneLink} className="rounded-full bg-[#0c7456] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#095c44]">
            Sună: {phone}
          </a>
        </div>
        <details className="border-t border-[#e5e7e1] px-5 py-3 lg:hidden"><summary className="cursor-pointer text-sm font-semibold text-[#0c7456]">Meniu</summary><nav aria-label="Navigație mobilă" className="grid grid-cols-2 gap-3 pt-3 text-sm"><Link href="/proprietati">Proprietăți</Link><Link href="/localitati">Localități</Link><Link href="/servicii">Servicii</Link><Link href="/agenti">Agenți</Link><Link href="/despre-noi">Despre noi</Link><Link href="/blog">Blog</Link><Link href="/contact">Contact</Link></nav></details>
      </header>
      {children}
      <footer id="contact" className="border-t border-[#e5e7e1] bg-[#14251d] text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:px-8 md:grid-cols-3">
          <div>
            <p className="font-semibold tracking-wide">KIRA IMOBILIARE</p>
            <p className="mt-3 max-w-sm text-sm leading-6 text-white/75">
              Consultanță imobiliară pentru vânzare, cumpărare și închiriere în Făgăraș, împrejurimi și Brașov.
            </p>
          </div>
          <div className="text-sm leading-7 text-white/80">
            <p className="font-semibold text-white">Contact</p>
            <a href={phoneLink} className="block hover:text-white">{phone}</a>
            <a href="mailto:contact@kiraimobiliare.ro" className="block hover:text-white">contact@kiraimobiliare.ro</a>
            <p>Str. Ion Creangă 35, Făgăraș, jud. Brașov</p>
          </div>
          <div className="flex flex-col items-start gap-3 text-sm">
            <Link href="/localitati/brasov" className="text-white/80 underline-offset-4 hover:text-white hover:underline">Imobiliare Brașov</Link>
            <Link href="/servicii" className="text-white/80 underline-offset-4 hover:text-white hover:underline">Servicii imobiliare</Link>
            <Link href="/agenti" className="text-white/80 underline-offset-4 hover:text-white hover:underline">Echipa Kira</Link>
            <a href={whatsappLink} className="text-white/80 underline-offset-4 hover:text-white hover:underline">Scrie-ne pe WhatsApp</a>
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
