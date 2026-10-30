import Link from 'next/link';
import { publicPropertyPath, type PublicProperty } from '@/lib/public-properties';

function price(value: number | null, currency: string | null) {
  if (!value) return 'Preț la cerere';
  return new Intl.NumberFormat('ro-RO').format(value) + ' ' + (currency || 'EUR');
}

export function PropertyCards({ properties }: { properties: PublicProperty[] }) {
  if (!properties.length) return <div className="rounded-2xl border border-[#e1e6df] bg-white p-8 text-[#617067]">Nu sunt proprietăți publicate în această selecție momentan. Sună-ne și îți spunem ce oferte se potrivesc cererii tale.</div>;
  return <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
    {properties.map((p) => {
      const attrs = p.attributes || {};
      const photos = Array.isArray(attrs.photos) ? attrs.photos.filter((x): x is string => typeof x === 'string') : [];
      const surface = p.surface_useful || Number(attrs.sup_utila) || p.surface_land || Number(attrs.sup_teren);
      const rooms = attrs.camere || attrs.dormitoare;
      return <article key={p.id} className="overflow-hidden rounded-2xl border border-[#e1e6df] bg-white shadow-sm">
        {photos[0] ? <img src={photos[0]} alt={p.title} className="h-52 w-full object-cover" loading="lazy" /> : <div className="flex h-52 items-center justify-center bg-[#e9eee7] text-4xl text-[#0c7456]" aria-hidden="true">⌂</div>}
        <div className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-[#0c7456]">{p.transaction === 'inchiriere' ? 'Închiriere' : 'Vânzare'} · {p.category || 'Proprietate'}</p>
          <h3 className="mt-2 line-clamp-2 min-h-14 text-lg font-semibold">{p.title}</h3>
          <p className="mt-2 text-sm text-[#617067]">{[p.city, p.county].filter(Boolean).join(', ')}</p>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#617067]">{surface ? <span>{surface} m²</span> : null}{rooms ? <span>{String(rooms)} camere</span> : null}</div>
          <p className="mt-4 text-xl font-bold text-[#14251d]">{price(p.price, p.currency)}</p>
          <Link href={publicPropertyPath(p)} className="mt-4 inline-flex font-semibold text-[#0c7456]">Vezi detaliile →</Link>
        </div>
      </article>;
    })}
  </div>;
}
