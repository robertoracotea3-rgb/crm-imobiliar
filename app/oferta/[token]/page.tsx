import type { Metadata } from 'next';
import Link from 'next/link';
import { OfferView, type OfferItem } from '@/components/public/OfferView';
import { PublicSiteFrame } from '@/components/public/PublicSiteFrame';
import { num, placeLabel, priceLabel, roomsLabel, SITE, transactionLabel, waLink } from '@/components/public/site';
import { getOffer } from '@/lib/offers';
import { toCard, type PublicProperty } from '@/lib/public-properties';

/* An offer sent to a client on WhatsApp from the CRM (lib/offers.ts). Only for who has the link: search engines skip it. */

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ token: string }> };

export const metadata: Metadata = {
  title: 'Oferta pregătită pentru dumneavoastră',
  description: 'Proprietățile alese de Kira Imobiliare, cu poze și detalii.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
  openGraph: { type: 'website', title: 'Oferta pregătită pentru dumneavoastră', description: 'Proprietățile alese de Kira Imobiliare, cu poze și detalii.', images: [{ url: '/images/kira-logo-gold.png', alt: 'Kira Imobiliare' }] },
};

function toItem(p: PublicProperty): OfferItem {
  const c = toCard(p);
  return {
    id: p.id, code: p.internal_code, title: p.title, price: priceLabel(c), place: placeLabel(c), type: p.type_label,
    transaction: transactionLabel(c.transaction),
    meta: [c.rooms != null ? roomsLabel(c.rooms) : '', c.surface != null ? `${num(c.surface)} m²${c.land ? ' teren' : ''}` : '', c.floor || '', c.year ? `an ${c.year}` : ''].filter(Boolean),
    description: p.description, facts: p.facts, features: p.features,
    photos: Array.isArray(p.attributes.photos) ? (p.attributes.photos as string[]) : [],
  };
}

export default async function OfferPage({ params }: Props) {
  const { token } = await params;
  const offer = await getOffer(token);
  const items = (offer?.properties || []).map(toItem);
  const gone = offer ? offer.total - items.length : 0;
  return (
    <PublicSiteFrame>
      <main id="continut" className="bg-[#F6F3EE]">
        <div className="mx-auto max-w-5xl px-5 pb-20 pt-10 sm:px-8">
          <p className="text-[11px] font-bold uppercase tracking-[.24em] text-[#9a7a35]">Kira Imobiliare</p>
          {items.length ? (
            <>
              <h1 className="mt-3 font-[var(--font-playfair)] text-3xl leading-tight sm:text-5xl">
                {items.length === 1 ? 'O proprietate aleasă pentru dumneavoastră' : `${items.length} proprietăți alese pentru dumneavoastră`}
              </h1>
              <p className="mt-4 max-w-2xl leading-7 text-[#121417]/70">Apăsați pe „Vezi detalii” pentru toate pozele și caracteristicile. Dacă vă place ceva, scrieți-ne pe WhatsApp și stabilim vizionarea.</p>
              <OfferView token={token} items={items} />
              {gone > 0 && <p className="mt-6 text-sm text-[#121417]/60">{gone === 1 ? 'O proprietate din ofertă nu mai este disponibilă.' : `${gone} proprietăți din ofertă nu mai sunt disponibile.`}</p>}
              <p className="mt-8 text-sm leading-6 text-[#121417]/60">Adresa exactă o primiți de la noi, la programarea vizionării. Disponibilitatea și prețul se confirmă înainte de vizionare.</p>
            </>
          ) : (
            <>
              <h1 className="mt-3 font-[var(--font-playfair)] text-3xl leading-tight sm:text-5xl">
                {offer === undefined ? 'Oferta nu se poate încărca acum' : offer ? 'Proprietățile din ofertă nu mai sunt disponibile' : 'Oferta nu mai este activă'}
              </h1>
              <p className="mt-4 max-w-2xl leading-7 text-[#121417]/70">
                {offer === undefined ? 'Reîncărcați pagina peste câteva momente sau scrieți-ne pe WhatsApp.' : 'Scrieți-ne pe WhatsApp și vă trimitem o ofertă nouă, după ce căutați.'}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href={waLink('Bună ziua, am primit o ofertă care nu se mai deschide.')} target="_blank" rel="noreferrer" className="rounded-full bg-[#C8A252] px-6 py-3 font-semibold text-[#121417] hover:bg-[#D4AF37]">Scrieți-ne pe WhatsApp</a>
                <a href={SITE.phoneLink} className="rounded-full border border-[#121417]/15 px-6 py-3 font-semibold hover:border-[#C8A252]">{SITE.phone}</a>
                <Link href="/proprietati" className="rounded-full border border-[#121417]/15 px-6 py-3 font-semibold hover:border-[#C8A252]">Vedeți proprietățile</Link>
              </div>
            </>
          )}
        </div>
      </main>
    </PublicSiteFrame>
  );
}
