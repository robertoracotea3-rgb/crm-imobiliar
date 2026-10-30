import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicSiteFrame } from '@/components/public/PublicSiteFrame';

export const metadata: Metadata = {
  title: 'Servicii imobiliare în Brașov',
  description: 'Kira Imobiliare pregătește extinderea activității în Brașov. Contactează echipa pentru informații despre proprietăți, vânzare, cumpărare și închiriere.',
  alternates: { canonical: 'https://www.kiraimobiliare.ro/localitati/brasov' },
  openGraph: {
    title: 'Kira Imobiliare se extinde în Brașov',
    description: 'Consultanță imobiliară în pregătire pentru piața din Brașov. Discută cu echipa Kira despre cererea ta.',
    url: 'https://www.kiraimobiliare.ro/localitati/brasov',
    siteName: 'Kira Imobiliare',
    locale: 'ro_RO',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

const faqs = [
  {
    question: 'Kira Imobiliare are sediu în municipiul Brașov?',
    answer: 'Sediul firmei este în Făgăraș. Extinderea activității în Brașov este în pregătire; contactează echipa pentru informații actualizate despre servicii și programări.',
  },
  {
    question: 'Cum aflu ce proprietăți sunt disponibile în Brașov?',
    answer: 'Oferta se poate schimba. Sună la 0775 132 969 sau scrie la contact@kiraimobiliare.ro pentru portofoliul disponibil la zi.',
  },
  {
    question: 'Pot solicita ajutor pentru vânzarea sau închirierea unei proprietăți?',
    answer: 'Da. Trimite echipei detaliile proprietății și obiectivul tău, iar un consultant îți va comunica pașii și disponibilitatea serviciului în Brașov.',
  },
];

const agentSchema = {
  '@context': 'https://schema.org',
  '@type': 'RealEstateAgent',
  name: 'Kira Imobiliare',
  url: 'https://www.kiraimobiliare.ro/',
  telephone: '+40775132969',
  email: 'contact@kiraimobiliare.ro',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Str. Ion Creangă 35',
    addressLocality: 'Făgăraș',
    addressRegion: 'Brașov',
    addressCountry: 'RO',
  },
  areaServed: { '@type': 'City', name: 'Brașov' },
};

export default function BrasovPage() {
  return (
    <PublicSiteFrame>
      <main id="continut" className="mx-auto max-w-7xl px-5 pb-20 pt-8 sm:px-8">
        <nav aria-label="Fir de navigare" className="text-sm text-[#65736b]">
          <Link href="/" className="hover:text-[#0c7456]">Acasă</Link><span aria-hidden="true"> / </span><span aria-current="page">Brașov</span>
        </nav>

        <section className="mt-7 overflow-hidden rounded-[2rem] bg-[#e9eee7]">
          <div className="max-w-4xl px-6 py-14 sm:px-12 sm:py-20">
            <p className="text-sm font-semibold uppercase tracking-[.15em] text-[#0c7456]">Piața imobiliară din Brașov</p>
            <h1 className="mt-4 font-[var(--font-playfair)] text-4xl leading-tight text-[#14251d] sm:text-6xl">Kira Imobiliare se extinde în Brașov</h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-[#4f6057]">
              Pregătim extinderea activității în municipiul Brașov. Dacă vrei să vinzi, să cumperi sau să închiriezi o proprietate, spune-ne ce cauți și îți comunicăm informațiile actualizate despre serviciile și ofertele disponibile.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="tel:+40775132969" className="rounded-full bg-[#0c7456] px-6 py-3.5 font-semibold text-white hover:bg-[#095c44]">Sună la 0775 132 969</a>
              <a href="https://wa.me/40775132969" className="rounded-full border border-[#9eafa5] bg-white/70 px-6 py-3.5 font-semibold text-[#18372a] hover:bg-white">Scrie pe WhatsApp</a>
            </div>
          </div>
        </section>

        <section className="grid gap-12 py-16 md:grid-cols-[1fr_.75fr] md:py-20">
          <div>
            <h2 className="font-[var(--font-playfair)] text-3xl sm:text-4xl">Cu ce te putem ajuta</h2>
            <p className="mt-5 leading-8 text-[#58685f]">
              Fiecare tranzacție începe cu o discuție despre obiectiv, buget, termen și tipul de proprietate. Echipa Kira Imobiliare îți poate explica pașii de pregătire a unei oferte sau de căutare a unei proprietăți și îți confirmă disponibilitatea serviciului în Brașov.
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-3">
              {['Vânzare', 'Cumpărare', 'Închiriere'].map((item) => <li key={item} className="rounded-xl border border-[#e1e6df] bg-white p-4 font-medium">{item}</li>)}
            </ul>
          </div>
          <aside className="rounded-2xl bg-[#14251d] p-7 text-white sm:p-9">
            <p className="text-sm font-semibold uppercase tracking-[.14em] text-[#a9d5c1]">Contact direct</p>
            <h2 className="mt-3 text-2xl font-semibold">Spune-ne ce cauți în Brașov</h2>
            <p className="mt-3 leading-7 text-white/75">Îți răspundem cu detalii despre portofoliul și serviciile disponibile la momentul solicitării.</p>
            <a href="mailto:contact@kiraimobiliare.ro" className="mt-6 inline-block font-semibold text-[#b6e2ce] underline underline-offset-4">contact@kiraimobiliare.ro</a>
            <p className="mt-2 text-sm text-white/70">Sediu: Str. Ion Creangă 35, Făgăraș</p>
          </aside>
        </section>

        <section className="border-t border-[#e1e6df] pt-12">
          <h2 className="font-[var(--font-playfair)] text-3xl">Întrebări despre serviciile Kira în Brașov</h2>
          <div className="mt-7 divide-y divide-[#e1e6df]">
            {faqs.map(({ question, answer }) => <article key={question} className="py-5"><h3 className="text-lg font-semibold">{question}</h3><p className="mt-2 max-w-4xl leading-7 text-[#617067]">{answer}</p></article>)}
          </div>
        </section>

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(agentSchema).replace(/</g, '\\u003c') }} />
      </main>
    </PublicSiteFrame>
  );
}
