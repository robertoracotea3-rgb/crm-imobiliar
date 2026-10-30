import type { Metadata } from 'next';
import { PublicSiteFrame } from '@/components/public/PublicSiteFrame';
import { PropertyCards } from '@/components/public/PropertyCards';
import { getPublicProperties } from '@/lib/public-properties';

export const metadata: Metadata = { title: 'Proprietăți de vânzare și închiriat', description: 'Vezi proprietățile Kira Imobiliare publicate în Făgăraș, Brașov și împrejurimi.', alternates: { canonical: '/proprietati' } };

export default async function PropertiesPage() {
  const properties = await getPublicProperties();
  return <PublicSiteFrame><main id="continut" className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
    <p className="text-sm font-semibold uppercase tracking-[.14em] text-[#0c7456]">Oferta Kira Imobiliare</p>
    <h1 className="mt-3 font-[var(--font-playfair)] text-4xl sm:text-5xl">Proprietăți de vânzare și închiriat</h1>
    <p className="mt-4 max-w-3xl leading-7 text-[#617067]">Ofertele se actualizează pe măsură ce sunt publicate de echipă. Pentru disponibilitate și detalii la zi, contactează-ne direct.</p>
    <div className="mt-9"><PropertyCards properties={properties} /></div>
    <p className="mt-8 text-sm text-[#617067]">Nu ai găsit ce cauți? <a className="font-semibold text-[#0c7456]" href="tel:+40775132969">Sună la 0775 132 969</a> și spune-ne ce proprietate cauți.</p>
  </main></PublicSiteFrame>;
}
