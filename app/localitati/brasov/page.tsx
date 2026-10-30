import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicSiteFrame } from '@/components/public/PublicSiteFrame';
import { PropertyCards } from '@/components/public/PropertyCards';
import { getPublicProperties } from '@/lib/public-properties';

export const metadata: Metadata = {
  title: 'Imobiliare Brașov | Agenție imobiliară Kira Imobiliare',
  description: 'Cauți imobiliare în Brașov? Kira Imobiliare te ajută cu vânzarea, cumpărarea și închirierea de apartamente, case și terenuri. Contactează-ne pentru o discuție.',
  alternates: { canonical: 'https://www.kiraimobiliare.ro/localitati/brasov' },
  openGraph: {
    title: 'Imobiliare în Brașov | Kira Imobiliare',
    description: 'Consultanță imobiliară pentru vânzarea, cumpărarea și închirierea proprietăților în Brașov.',
    url: 'https://www.kiraimobiliare.ro/localitati/brasov',
    siteName: 'Kira Imobiliare',
    locale: 'ro_RO',
    type: 'website',
  },
};

export default async function BrasovPage() {
  const offers = await getPublicProperties('Brașov');
  const localBusinessSchema = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    name: 'Kira Imobiliare',
    url: 'https://www.kiraimobiliare.ro/localitati/brasov',
    telephone: '+40775132969',
    email: 'contact@kiraimobiliare.ro',
    areaServed: { '@type': 'City', name: 'Brașov' },
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Str. Ion Creangă 35',
      addressLocality: 'Făgăraș',
      addressRegion: 'Brașov',
      addressCountry: 'RO',
    },
  };

  return (
    <PublicSiteFrame>
      <main id="continut" className="bg-[#faf9f6]">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema).replace(/</g, '\\u003c') }} />
        <section className="relative isolate overflow-hidden bg-[#080c13] text-white">
          <div aria-hidden="true" className="absolute -right-32 -top-40 h-[34rem] w-[34rem] rounded-full bg-[#bd8c3a]/20 blur-[110px]" />
          <div className="relative mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
            <p className="inline-flex rounded-full border border-[#d9b368]/35 bg-white/[.04] px-4 py-2 text-xs font-semibold uppercase tracking-[.2em] text-[#e4bd70]">Kira Imobiliare · Brașov</p>
            <h1 className="mt-7 max-w-4xl font-[var(--font-playfair)] text-5xl leading-[1.06] tracking-[-.03em] text-[#fffaf0] sm:text-6xl lg:text-7xl">Imobiliare în <span className="text-[#dfb766]">Brașov</span>, cu oameni de partea ta.</h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-white/70 sm:text-lg">Vrei să vinzi un apartament, cauți o casă sau ai nevoie de o chirie în Brașov? Kira Imobiliare îți oferă îndrumare pentru a găsi pașii potriviți.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a href="tel:+40775132969" className="rounded-full bg-[#d5aa5c] px-6 py-3.5 font-semibold text-[#111720] transition hover:bg-[#e4bd70]">Sună la 0775 132 969</a>
              <a href="https://wa.me/40775132969" className="rounded-full border border-white/20 px-6 py-3.5 font-semibold text-white transition hover:border-[#e4bd70]/70">Scrie pe WhatsApp</a>
            </div>
            <p className="mt-5 text-sm text-white/50">Sediul companiei: Făgăraș · Programările și serviciile în Brașov se stabilesc direct cu echipa.</p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-[#a27835]">Oferte în zonă</p><h2 className="mt-3 font-[var(--font-playfair)] text-3xl text-[#171b20] sm:text-4xl">Proprietăți publicate în Brașov</h2><p className="mt-3 text-[#73777a]">Apartamente, case și alte proprietăți disponibile prin Kira Imobiliare.</p></div>
            <Link href="/proprietati" className="rounded-full border border-[#d9d2c5] px-5 py-3 text-sm font-semibold text-[#272b30] transition hover:border-[#b58b47] hover:text-[#8a6428]">Vezi toate proprietățile →</Link>
          </div>
          <div className="mt-8"><PropertyCards properties={offers} /></div>
        </section>

        <section className="border-y border-[#e8e3d9] bg-[#f5f2eb]">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-[#a27835]">Servicii imobiliare în Brașov</p>
            <h2 className="mt-3 max-w-3xl font-[var(--font-playfair)] text-3xl text-[#171b20] sm:text-4xl">Ce vrei să faci în piața imobiliară din Brașov?</h2>
            <div className="mt-9 grid gap-4 md:grid-cols-3">
              {[
                ['Vând o proprietate', 'Discutăm despre locuință, documentație și prezentarea ofertei către potențialii cumpărători.'],
                ['Cumpăr în Brașov', 'Povestește-ne ce cauți, în ce zonă și care sunt criteriile tale.'],
                ['Caut o chirie', 'Spune-ne ce tip de locuință și ce buget ai în vedere, iar echipa te va îndruma.'],
              ].map(([title, text]) => <article key={title} className="rounded-2xl border border-[#e7e1d5] bg-white p-6 shadow-sm"><h2 className="font-[var(--font-playfair)] text-xl text-[#171b20]">{title}</h2><p className="mt-3 leading-7 text-[#6d7275]">{text}</p></article>)}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="grid gap-6 md:grid-cols-[1.1fr_.9fr]">
            <article className="rounded-3xl bg-[#10151d] p-8 text-white sm:p-10"><p className="text-xs font-semibold uppercase tracking-[.2em] text-[#e4bd70]">Kira Imobiliare în Brașov</p><h2 className="mt-3 font-[var(--font-playfair)] text-3xl">O discuție clară. Un plan potrivit pentru tine.</h2><p className="mt-4 leading-7 text-white/65">Contactează echipa pentru a vorbi despre o proprietate, o evaluare sau o căutare în Brașov. Sediul nostru este în Făgăraș.</p><a href="mailto:contact@kiraimobiliare.ro?subject=Imobiliare%20Bra%C8%99ov" className="mt-7 inline-flex rounded-full bg-[#d5aa5c] px-5 py-3 font-semibold text-[#111720]">Trimite un email</a></article>
            <article className="rounded-3xl border border-[#e2dacb] bg-white p-8 sm:p-10"><p className="text-xs font-semibold uppercase tracking-[.2em] text-[#a27835]">Și în apropiere</p><h2 className="mt-3 font-[var(--font-playfair)] text-3xl text-[#171b20]">Făgăraș și împrejurimi</h2><p className="mt-4 leading-7 text-[#6d7275]">Vezi ofertele și serviciile Kira Imobiliare în zona în care se află sediul agenției.</p><Link href="/localitati/fagaras" className="mt-7 inline-flex font-semibold text-[#8a6428]">Imobiliare în Făgăraș →</Link></article>
          </div>
          <p className="mt-8 text-sm text-[#73777a]">Kira Imobiliare · Str. Ion Creangă 35, Făgăraș, județul Brașov · <a className="underline decoration-[#b58b47] underline-offset-4" href="tel:+40775132969">0775 132 969</a></p>
        </section>
      </main>
    </PublicSiteFrame>
  );
}
