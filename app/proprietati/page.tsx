import type { Metadata } from 'next';
import { PublicSiteFrame } from '@/components/public/PublicSiteFrame';
import { ExplorerProvider, ExplorerResults, SearchBar } from '@/components/public/PropertyExplorer';
import { filtersFromParams } from '@/components/public/filters';
import { PropertyMap } from '@/components/public/PropertyMap';
import { getPublicProperties, toCard } from '@/lib/public-properties';

export const metadata: Metadata = { title: 'Proprietăți de vânzare și închiriat', description: 'Vezi proprietățile Kira Imobiliare publicate în Făgăraș, Brașov și împrejurimi.', alternates: { canonical: '/proprietati' } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PropertiesPage({ searchParams }: Props) {
  const cards = (await getPublicProperties()).map(toCard);
  const initial = filtersFromParams(await searchParams);
  return (
    <PublicSiteFrame>
      <main id="continut" className="bg-[#F6F3EE]">
        <ExplorerProvider properties={cards} initial={initial} syncUrl>
          <section className="relative overflow-hidden bg-[#121417] px-5 pb-28 pt-14 text-[#F6F3EE] sm:px-8 lg:px-10">
            <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[#D4AF37]/15 blur-[100px]" />
            <div className="relative mx-auto max-w-[92rem]">
              <p className="text-[11px] font-bold uppercase tracking-[.24em] text-[#C8A252]">Oferta Kira Imobiliare</p>
              <h1 className="mt-3 max-w-3xl font-[var(--font-playfair)] text-4xl font-medium leading-tight sm:text-6xl">Proprietăți de vânzare și închiriat</h1>
              <p className="mt-4 max-w-2xl leading-7 text-white/65">Ofertele se actualizează pe măsură ce le publică echipa. Disponibilitatea și prețul se confirmă înainte de vizionare.</p>
            </div>
          </section>
          <div className="relative z-10 mx-auto -mt-16 max-w-[92rem] px-5 sm:px-8 lg:px-10">
            <SearchBar variant="page" />
          </div>
          <section id="rezultate" className="scroll-mt-24 px-5 pb-16 pt-12 sm:px-8 lg:px-10">
            <div className="mx-auto max-w-[92rem]"><ExplorerResults /></div>
          </section>
          {cards.length ? (
            <section className="px-5 pb-20 sm:px-8 lg:px-10">
              <div className="mx-auto max-w-[92rem]">
                <h2 className="mb-6 font-[var(--font-playfair)] text-3xl sm:text-4xl">Pe hartă</h2>
                <PropertyMap />
              </div>
            </section>
          ) : null}
        </ExplorerProvider>
      </main>
    </PublicSiteFrame>
  );
}
