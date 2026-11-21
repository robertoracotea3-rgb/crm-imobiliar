import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { MapPin } from 'lucide-react';
import { PublicSiteFrame } from '@/components/public/PublicSiteFrame';
import { PropertyCard } from '@/components/public/PropertyCard';
import { MortgageCalculator, PropertyGallery, ViewingCard } from '@/components/public/PropertyDetail';
import { getPublicProperties, getPublicProperty, publicPropertyPath, toCard, type PublicProperty } from '@/lib/public-properties';
import { money, placeLabel, priceLabel, transactionLabel } from '@/components/public/site';

type Props = { params: Promise<{ id: string }> };

const SITE_URL = 'https://www.kiraimobiliare.ro';

function photosOf(p: PublicProperty): string[] {
  const photos = p.attributes?.photos;
  return Array.isArray(photos) ? photos.filter((x): x is string => typeof x === 'string') : [];
}

function summary(p: PublicProperty): string {
  if (p.description) return p.description.replace(/\s+/g, ' ').slice(0, 160);
  const where = [p.zone, p.city].filter(Boolean).join(', ') || 'zona Făgăraș';
  return `${p.title}. ${priceLabel(toCard(p))}. ${where}. Contactează Kira Imobiliare pentru detalii și vizionare.`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const p = await getPublicProperty(id);
  if (!p) return { title: 'Proprietate indisponibilă', robots: { index: false } };
  const path = publicPropertyPath(p), photo = photosOf(p)[0];
  return {
    title: p.title,
    description: summary(p),
    alternates: { canonical: path },
    openGraph: { type: 'website', title: p.title, description: summary(p), url: path, images: photo ? [{ url: photo, alt: p.title }] : undefined },
    twitter: { card: photo ? 'summary_large_image' : 'summary', title: p.title, description: summary(p), images: photo ? [photo] : undefined },
  };
}

export default async function PropertyPage({ params }: Props) {
  const { id } = await params;
  const p = await getPublicProperty(id);
  if (!p) notFound();
  const path = publicPropertyPath(p);
  // An older link (the title changed in the CRM): go to the current one.
  if (`/proprietati/${id}` !== path) permanentRedirect(path);
  const photos = photosOf(p);
  const card = toCard(p);
  const ask = `Bună ziua, mă interesează proprietatea ${p.internal_code ? p.internal_code + ': ' : ''}${p.title} (${SITE_URL}${path})`;
  const all = await getPublicProperties();
  const similar = all
    .filter((x) => x.id !== p.id && (x.category === p.category || (x.city && x.city === p.city)))
    .sort((a, b) => Number(b.category === p.category) - Number(a.category === p.category))
    .slice(0, 3)
    .map(toCard);
  const perSqm = p.transaction === 'vanzare' && p.price && card.surface ? `${money(p.price / card.surface)} €/m²` : null;
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'RealEstateListing',
    name: p.title, description: summary(p), url: SITE_URL + path,
    image: photos.slice(0, 10).map((x) => SITE_URL + x),
    ...(p.updated_at ? { dateModified: new Date(p.updated_at).toISOString() } : {}),
    ...(p.price ? { offers: { '@type': 'Offer', price: p.price, priceCurrency: p.currency || 'EUR', availability: 'https://schema.org/InStock' } } : {}),
  };

  return (
    <PublicSiteFrame>
      <main id="continut" className="kira-property-page bg-[#F6F3EE]">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
        <div className="mx-auto max-w-[92rem] px-5 pb-20 pt-8 sm:px-8 lg:px-10">
          <nav aria-label="Ești aici" className="text-sm text-[#121417]/55">
            <Link href="/" className="hover:text-[#9a7a35]">Acasă</Link> <span aria-hidden="true">/</span>{' '}
            <Link href="/proprietati" className="hover:text-[#9a7a35]">Proprietăți</Link> <span aria-hidden="true">/</span>{' '}
            <span className="text-[#121417]/80">{p.internal_code || p.title}</span>
          </nav>

          <header className="mt-6 flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-4xl">
              <div className="flex flex-wrap gap-2">
                {transactionLabel(card.transaction) && <span className="rounded-md bg-[#121417] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.14em] text-[#E9CF8E]">{transactionLabel(card.transaction)}</span>}
                {p.type_label && <span className="rounded-md border border-[#121417]/12 bg-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.14em] text-[#121417]/70">{p.type_label}</span>}
                {p.internal_code && <span className="rounded-md bg-[#C8A252] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.14em] text-[#121417]">Cod {p.internal_code}</span>}
              </div>
              <h1 className="mt-4 font-[var(--font-playfair)] text-4xl font-medium leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">{p.title}</h1>
              <p className="mt-3 inline-flex items-center gap-1.5 text-[#121417]/65"><MapPin size={17} className="text-[#C8A252]" /> {placeLabel(card)}{p.county && p.county !== p.city ? `, jud. ${p.county}` : ''}</p>
            </div>
            <div className="text-left sm:text-right">
              <p className="font-[var(--font-playfair)] text-4xl font-semibold text-[#9a7a35] sm:text-5xl">{priceLabel(card)}</p>
              {perSqm && <p className="mt-1 text-sm text-[#121417]/55">{perSqm}</p>}
            </div>
          </header>

          <div className="mt-8"><PropertyGallery photos={photos} title={p.title} /></div>

          <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_23rem]">
            <div className="space-y-10">
              <section>
                <h2 className="font-[var(--font-playfair)] text-3xl">Descriere</h2>
                <p className="mt-4 whitespace-pre-line text-[1.02rem] leading-8 text-[#121417]/75">{p.description || 'Pentru informații complete despre această proprietate, contactează echipa Kira Imobiliare.'}</p>
              </section>
              {p.facts.length ? (
                <section>
                  <h2 className="font-[var(--font-playfair)] text-3xl">Caracteristici</h2>
                  <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {p.facts.map((f) => (
                      <div key={f.label} className="rounded-2xl border border-[#121417]/8 bg-white p-4">
                        <dt className="text-[13px] text-[#121417]/55">{f.label}</dt>
                        <dd className="mt-1 font-semibold">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ) : null}
              {p.features.length ? (
                <section>
                  <h2 className="font-[var(--font-playfair)] text-3xl">Dotări</h2>
                  <ul className="mt-5 flex flex-wrap gap-2">
                    {p.features.map((f) => <li key={f} className="rounded-full border border-[#C8A252]/35 bg-white px-3.5 py-1.5 text-sm">{f}</li>)}
                  </ul>
                </section>
              ) : null}
              {p.transaction === 'vanzare' && p.price ? <MortgageCalculator price={p.price} /> : null}
              <p className="text-sm leading-6 text-[#121417]/55">Adresa exactă o primești de la noi, la programarea vizionării. Disponibilitatea și prețul se confirmă înainte de vizionare.</p>
            </div>
            <aside className="lg:sticky lg:top-24 lg:h-fit">
              <ViewingCard property={card} ask={ask} />
            </aside>
          </div>

          {similar.length ? (
            <section className="mt-20">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <h2 className="font-[var(--font-playfair)] text-3xl sm:text-4xl">Proprietăți asemănătoare</h2>
                <Link href="/proprietati" className="text-sm font-semibold text-[#9a7a35] hover:text-[#121417]">Toate proprietățile →</Link>
              </div>
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {similar.map((s) => <PropertyCard key={s.id} p={s} />)}
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </PublicSiteFrame>
  );
}
