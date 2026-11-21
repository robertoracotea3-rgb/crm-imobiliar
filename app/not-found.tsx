import Link from 'next/link';
import { PublicSiteFrame } from '@/components/public/PublicSiteFrame';

export default function NotFound() {
  return (
    <PublicSiteFrame>
      <main id="continut" className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center px-5 py-20 text-center sm:px-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9a7a35]">Eroare 404</p>
        <h1 className="mt-4 font-[var(--font-playfair)] text-4xl sm:text-5xl">Pagina nu a fost găsită</h1>
        <p className="mt-5 max-w-xl leading-8 text-[#5d5a55]">Adresa nu mai există sau a fost scrisă greșit. Ofertele actuale sunt la Proprietăți.</p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link href="/proprietati" className="rounded-full bg-[#121417] px-6 py-3 font-semibold text-white hover:bg-[#2a2d33]">Vezi proprietățile</Link>
          <Link href="/" className="rounded-full border border-[#C8A252] px-6 py-3 font-semibold text-[#121417] hover:bg-[#C8A252]/10">Înapoi la prima pagină</Link>
        </div>
      </main>
    </PublicSiteFrame>
  );
}
