import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { PublicSiteFrame } from '@/components/public/PublicSiteFrame';
import { getPublicProperty, publicPropertyPath, type PublicProperty } from '@/lib/public-properties';

type Props = { params: Promise<{ id: string }> };

const SITE = 'https://www.kiraimobiliare.ro';
const PHONE = '0775 132 969';
const PHONE_INTL = '40775132969';

function photosOf(p: PublicProperty): string[] {
  const photos = p.attributes?.photos;
  return Array.isArray(photos) ? photos.filter((x): x is string => typeof x === 'string') : [];
}

function priceText(p: PublicProperty): string {
  if (!p.price) return 'Preț la cerere';
  return `${new Intl.NumberFormat('ro-RO').format(p.price)} ${p.currency || 'EUR'}${p.transaction === 'inchiriere' ? ' / lună' : ''}`;
}

function summary(p: PublicProperty): string {
  if (p.description) return p.description.replace(/\s+/g, ' ').slice(0, 160);
  const where = [p.zone, p.city].filter(Boolean).join(', ') || 'zona Făgăraș';
  return `${p.title}. ${priceText(p)}. ${where}. Contactează Kira Imobiliare pentru detalii și vizionare.`;
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
  const [cover, ...rest] = photos;
  const ask = `Bună ziua, mă interesează proprietatea ${p.internal_code ? p.internal_code + ': ' : ''}${p.title} (${SITE}${path})`;
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'RealEstateListing',
    name: p.title, description: summary(p), url: SITE + path,
    image: photos.slice(0, 10).map((x) => SITE + x),
    ...(p.updated_at ? { dateModified: new Date(p.updated_at).toISOString() } : {}),
    ...(p.price ? { offers: { '@type': 'Offer', price: p.price, priceCurrency: p.currency || 'EUR', availability: 'https://schema.org/InStock' } } : {}),
  };
  return <PublicSiteFrame><main id="continut" className="kira-content-page mx-auto max-w-6xl px-5 py-12 sm:px-8">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
    <p className="text-sm text-[#617067]">{[p.zone, p.city, p.county].filter(Boolean).join(', ')}{p.type_label ? ` · ${p.type_label}` : ''}{p.internal_code ? ` · Cod ${p.internal_code}` : ''}</p>
    <h1 className="mt-3 max-w-4xl font-[var(--font-playfair)] text-4xl sm:text-5xl">{p.title}</h1>
    <p className="mt-5 text-3xl font-bold text-[#0c7456]">{priceText(p)}</p>
    {cover ? <div className="mt-8">
      <a href={cover} target="_blank" rel="noopener" className="block"><img src={cover} alt={p.title} className="max-h-[36rem] w-full rounded-2xl object-cover" /></a>
      {rest.length ? <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{rest.map((photo, i) => <a key={photo} href={photo} target="_blank" rel="noopener" className="block"><img src={photo} alt={`${p.title}, poza ${i + 2}`} className="aspect-[4/3] w-full rounded-xl object-cover" loading="lazy" /></a>)}</div> : null}
      <p className="mt-2 text-xs text-[#617067]">{photos.length === 1 ? '1 poză' : `${photos.length} poze`} · apasă pe o poză ca s-o vezi mare</p>
    </div> : null}
    <div className="mt-9 grid gap-10 md:grid-cols-[1fr_20rem]">
      <section>
        <h2 className="text-2xl font-semibold">Descriere</h2>
        <p className="mt-4 whitespace-pre-line leading-8 text-[#52635a]">{p.description || 'Pentru informații complete despre această proprietate, contactează echipa Kira Imobiliare.'}</p>
        {p.facts.length ? <>
          <h2 className="mt-9 text-2xl font-semibold">Caracteristici</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">{p.facts.map((f) => <div key={f.label} className="rounded-xl bg-white p-4"><dt className="text-sm text-[#617067]">{f.label}</dt><dd className="mt-1 font-semibold">{f.value}</dd></div>)}</dl>
        </> : null}
        {p.features.length ? <>
          <h2 className="mt-9 text-2xl font-semibold">Dotări</h2>
          <ul className="mt-4 flex flex-wrap gap-2">{p.features.map((f) => <li key={f} className="rounded-full border border-[#e1e6df] bg-white px-3 py-1.5 text-sm">{f}</li>)}</ul>
        </> : null}
        <p className="mt-8 text-sm text-[#617067]">Adresa exactă o primești de la noi, la programarea vizionării. Disponibilitatea și prețul se confirmă înainte de vizionare.</p>
      </section>
      <aside className="h-fit rounded-2xl bg-[#14251d] p-6 text-white md:sticky md:top-6">
        <h2 className="text-xl font-semibold">Solicită detalii sau o vizionare</h2>
        <p className="mt-3 leading-7 text-white/75">Confirmăm disponibilitatea și răspundem la întrebările tale.{p.internal_code ? ` Spune-ne codul ${p.internal_code}.` : ''}</p>
        <a href={`tel:+${PHONE_INTL}`} className="mt-6 block rounded-full bg-white px-5 py-3 text-center font-semibold text-[#14251d]">Sună: {PHONE}</a>
        <a href={`https://wa.me/${PHONE_INTL}?text=${encodeURIComponent(ask)}`} className="mt-3 block rounded-full border border-white/30 px-5 py-3 text-center font-semibold">WhatsApp</a>
      </aside>
    </div>
  </main></PublicSiteFrame>;
}
