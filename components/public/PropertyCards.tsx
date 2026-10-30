import Link from 'next/link';
import { publicPropertyPath, type PublicProperty } from '@/lib/public-properties';

function categoryLabel(value: string | null) {
  if (!value) return 'Proprietate';
  const labels: Record<string, string> = {
    casa_vila: 'Casă / vilă',
    apartament: 'Apartament',
    teren: 'Teren',
    spatiu_comercial: 'Spațiu comercial',
    garsoniera: 'Garsonieră',
  };
  const normalized = value.toLocaleLowerCase('ro').replace(/[ -]+/g, '_');
  const readable = value.replace(/[_-]+/g, ' ');
  return labels[normalized] || readable.charAt(0).toLocaleUpperCase('ro') + readable.slice(1);
}

function price(value: number | null, currency: string | null) {
  if (!value) return 'Preț la cerere';
  return new Intl.NumberFormat('ro-RO').format(value) + ' ' + (currency || 'EUR');
}

export function PropertyCards({ properties }: { properties: PublicProperty[] }) {
  if (!properties.length) return <div className="rounded-2xl border border-[#e4ded2] bg-white p-8 text-[#686b6c] shadow-sm">Nu sunt proprietăți publicate în această selecție momentan. Sună-ne și îți spunem ce oferte se potrivesc cererii tale.</div>;
  return <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
    {properties.map((p) => {
      const attrs = p.attributes || {};
      const photos = Array.isArray(attrs.photos) ? attrs.photos.filter((x): x is string => typeof x === 'string') : [];
      const surface = p.surface_useful || Number(attrs.sup_utila) || p.surface_land || Number(attrs.sup_teren);
      const rooms = attrs.camere || attrs.dormitoare;
      return <article key={p.id} className="kira-public-property-card group overflow-hidden rounded-[1.35rem] border border-[#e7e1d7] bg-white shadow-[0_8px_28px_rgba(25,28,32,.055)]">
        <Link href={publicPropertyPath(p)} className="block">
          <div className="relative h-56 overflow-hidden bg-[#121820] sm:h-60">
            {photos[0] ? <img src={photos[0]} alt={p.title} className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.045]" loading="lazy" /> : <div className="flex h-full items-center justify-center bg-[radial-gradient(ellipse_at_top_right,#55432a_0%,#20232a_48%,#10151d_100%)] font-[var(--font-playfair)] text-4xl text-[#d5aa5c]" aria-hidden="true">KIRA</div>}
            <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
            <span className="absolute left-4 top-4 rounded-full border border-white/25 bg-[#080c13]/75 px-3 py-1.5 text-[.68rem] font-semibold uppercase tracking-[.14em] text-[#f5d894] backdrop-blur">{p.transaction === 'inchiriere' ? 'Închiriere' : 'Vânzare'}</span>
            <span className="absolute bottom-4 right-4 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-[#24272b] shadow">{categoryLabel(p.category)}</span>
          </div>
          <div className="p-5 sm:p-6">
            <h3 className="line-clamp-2 min-h-14 text-lg font-semibold leading-7 text-[#1a1d22] transition group-hover:text-[#8a6428]">{p.title}</h3>
            <p className="mt-2 text-sm text-[#76787a]">{[p.city, p.county].filter(Boolean).join(', ')}</p>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#686d70]">{surface ? <span>{surface} m²</span> : null}{rooms ? <span>{String(rooms)} camere</span> : null}</div>
            <div className="mt-5 flex items-end justify-between gap-3 border-t border-[#eee9e1] pt-4">
              <p className="text-xl font-bold tracking-tight text-[#171b20]">{price(p.price, p.currency)}</p>
              <span className="text-sm font-semibold text-[#9a712e]">Detalii <span aria-hidden="true">↗</span></span>
            </div>
          </div>
        </Link>
      </article>;
    })}
  </div>;
}
