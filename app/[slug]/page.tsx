import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicSiteFrame } from '@/components/public/PublicSiteFrame';
import { PropertyCards } from '@/components/public/PropertyCards';
import { getPublicProperties } from '@/lib/public-properties';
const categories: Record<string, { category: string; transaction: string; heading: string }> = {
  'apartamente-de-vanzare-fagaras': { category: 'apartament', transaction: 'vanzare', heading: 'Apartamente de vânzare în Făgăraș' },
  'apartamente-de-inchiriat-fagaras': { category: 'apartament', transaction: 'inchiriere', heading: 'Apartamente de închiriat în Făgăraș' },
  'case-de-vanzare-fagaras': { category: 'casa', transaction: 'vanzare', heading: 'Case de vânzare în Făgăraș' },
  'garsoniere-de-vanzare-fagaras': { category: 'garsoniera', transaction: 'vanzare', heading: 'Garsoniere de vânzare în Făgăraș' },
  'terenuri-de-vanzare-fagaras': { category: 'teren', transaction: 'vanzare', heading: 'Terenuri de vânzare în Făgăraș' },
  'spatii-comerciale-fagaras': { category: 'spatiu_comercial', transaction: 'vanzare', heading: 'Spații comerciale în Făgăraș' },
  'hale-de-vanzare-fagaras': { category: 'hala', transaction: 'vanzare', heading: 'Hale de vânzare în Făgăraș' },
};
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { slug } = await params; const entry = categories[slug]; return entry ? { title: entry.heading, description: `Vezi proprietățile publicate de Kira Imobiliare: ${entry.heading.toLocaleLowerCase('ro')}. Oferta și disponibilitatea se actualizează.` } : { title: 'Pagină indisponibilă' }; }
export default async function CategoryPage({ params }: Props) { const { slug } = await params; const entry = categories[slug]; if (!entry) notFound(); const all = await getPublicProperties('Făgăraș'); const properties = all.filter((p) => (p.category || '').toLocaleLowerCase('ro').includes(entry.category) && (p.transaction || '').toLocaleLowerCase('ro').includes(entry.transaction)); return <PublicSiteFrame><main id="continut" className="mx-auto max-w-7xl px-5 py-12 sm:px-8"><p className="text-sm font-semibold uppercase tracking-wide text-[#0c7456]">Oferta Kira Imobiliare</p><h1 className="mt-3 font-[var(--font-playfair)] text-4xl sm:text-5xl">{entry.heading}</h1><p className="mt-5 max-w-3xl leading-8 text-[#617067]">Ofertele publicate în această categorie apar mai jos. Disponibilitatea, prețul și detaliile proprietății se confirmă cu echipa înainte de programare.</p><div className="mt-9"><PropertyCards properties={properties} /></div><p className="mt-8 text-sm text-[#617067]">Cauți un anumit tip de proprietate? <a href="tel:+40775132969" className="font-semibold text-[#0c7456]">Discută cu noi la 0775 132 969.</a></p></main></PublicSiteFrame>; }
