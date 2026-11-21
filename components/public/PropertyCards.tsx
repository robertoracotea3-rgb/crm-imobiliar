import { toCard, type PublicProperty } from '@/lib/public-properties';
import { PropertyCard } from './PropertyCard';
import { OpenPanelButton } from './SiteUi';

/** A grid of property cards for the category and locality pages (server side: maps the CRM data to cards). */
export function PropertyCards({ properties }: { properties: PublicProperty[] }) {
  if (!properties.length) {
    return (
      <div className="rounded-[1.4rem] border border-[#C8A252]/25 bg-white p-8 text-center shadow-[0_10px_34px_rgba(18,20,23,.05)]">
        <p className="font-[var(--font-playfair)] text-2xl text-[#121417]">Ofertele noi apar aici imediat ce sunt publicate.</p>
        <p className="mx-auto mt-2 max-w-lg text-[#121417]/60">Spune-ne ce cauți și te anunțăm când avem o proprietate potrivită, inclusiv din oferta care nu apare public.</p>
        <OpenPanelButton panel={{ kind: 'contact', topic: 'Vreau să cumpăr' }} className="mt-5 rounded-full bg-[#121417] px-6 py-3 font-semibold text-[#F6F3EE] transition hover:bg-black">
          Spune-ne ce cauți
        </OpenPanelButton>
      </div>
    );
  }
  return (
    <div className="kira-property-grid grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {properties.map((p, i) => <PropertyCard key={p.id} p={toCard(p)} priority={i < 3} />)}
    </div>
  );
}
