import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicSiteFrame } from '@/components/public/PublicSiteFrame';
import { getPublicProperty, publicPropertyPath } from '@/lib/public-properties';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const property = await getPublicProperty(id);
  return property ? { title: property.title, description: property.description?.slice(0, 160) || `${property.category || 'Proprietate'} ${property.transaction || ''} în ${property.city || 'zona Făgăraș'}. Contactează Kira Imobiliare.`, alternates: { canonical: publicPropertyPath(property) } } : { title: 'Proprietate indisponibilă' };
}

export default async function PropertyPage({ params }: Props) {
  const { id } = await params;
  const p = await getPublicProperty(id);
  if (!p) notFound();
  const attrs = p.attributes || {};
  const photos = Array.isArray(attrs.photos) ? attrs.photos.filter((x): x is string => typeof x === 'string') : [];
  const price = p.price ? `${new Intl.NumberFormat('ro-RO').format(p.price)} ${p.currency || 'EUR'}` : 'Preț la cerere';
  return <PublicSiteFrame><main id="continut" className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
    <p className="text-sm text-[#617067]">{p.city}{p.county ? `, ${p.county}` : ''} · {p.category}{p.internal_code ? ` · ${p.internal_code}` : ''}</p>
    <h1 className="mt-3 max-w-4xl font-[var(--font-playfair)] text-4xl sm:text-5xl">{p.title}</h1>
    <p className="mt-5 text-3xl font-bold text-[#0c7456]">{price}</p>
    {photos.length ? <div className="mt-8 grid gap-3 sm:grid-cols-2">{photos.slice(0, 8).map((photo) => <img key={photo} src={photo} alt={p.title} className="max-h-[32rem] w-full rounded-2xl object-cover" />)}</div> : null}
    <div className="mt-9 grid gap-10 md:grid-cols-[1fr_20rem]">
      <section><h2 className="text-2xl font-semibold">Descriere</h2><p className="mt-4 whitespace-pre-line leading-8 text-[#52635a]">{p.description || 'Pentru informații complete despre această proprietate, contactează echipa Kira Imobiliare.'}</p>
        <dl className="mt-7 grid grid-cols-2 gap-3">{[['Localitate', p.city], ['Zonă', p.zone], ['Suprafață utilă', p.surface_useful || attrs.sup_utila], ['Suprafață teren', p.surface_land || attrs.sup_teren], ['Camere', attrs.camere]].filter(([, v]) => v).map(([key, value]) => <div key={String(key)} className="rounded-xl bg-white p-4"><dt className="text-sm text-[#617067]">{key}</dt><dd className="mt-1 font-semibold">{String(value)}{key === 'Suprafață utilă' || key === 'Suprafață teren' ? ' m²' : ''}</dd></div>)}</dl>
      </section>
      <aside className="h-fit rounded-2xl bg-[#14251d] p-6 text-white"><h2 className="text-xl font-semibold">Solicită detalii sau o vizionare</h2><p className="mt-3 leading-7 text-white/75">Confirmăm disponibilitatea și răspundem la întrebările tale.</p><a href="tel:+40775132969" className="mt-6 block rounded-full bg-white px-5 py-3 text-center font-semibold text-[#14251d]">Sună: 0775 132 969</a><a href={`https://wa.me/40775132969?text=${encodeURIComponent(`Bună ziua, mă interesează proprietatea: ${p.title}`)}`} className="mt-3 block rounded-full border border-white/30 px-5 py-3 text-center font-semibold">WhatsApp</a></aside>
    </div>
  </main></PublicSiteFrame>;
}
