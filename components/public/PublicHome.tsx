import Link from 'next/link';
import { PublicSiteFrame } from './PublicSiteFrame';
import { getPublicProperties } from '@/lib/public-properties';
import { PropertyCards } from './PropertyCards';
import { brasovOldTown, brasovPanorama, BrasovPhotoCredit } from './BrasovVisuals';

const phone = '0775 132 969';

export async function PublicHome() {
  const properties = (await getPublicProperties()).slice(0, 6);
  const businessSchema = {
    '@context': 'https://schema.org', '@type': 'RealEstateAgent', name: 'Kira Imobiliare',
    url: 'https://www.kiraimobiliare.ro/', telephone: '+40775132969', email: 'contact@kiraimobiliare.ro',
    address: { '@type': 'PostalAddress', streetAddress: 'Str. Ion Creangă 35', addressLocality: 'Făgăraș', addressRegion: 'Brașov', addressCountry: 'RO' },
    areaServed: [{ '@type': 'City', name: 'Făgăraș' }, { '@type': 'City', name: 'Brașov' }],
  };

  return (
    <PublicSiteFrame>
      <main id="continut" className="kira-homepage">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(businessSchema).replace(/</g, '\\u003c') }} />
        <section className="kira-city-hero relative isolate flex min-h-[34rem] items-center overflow-hidden bg-[#07192b] text-white sm:min-h-[38rem] lg:min-h-[41rem]">
          <img
            src={brasovPanorama.src}
            alt={brasovPanorama.alt}
            className="kira-city-hero-image absolute inset-0 h-full w-full object-cover"
            fetchPriority="high"
          />
          <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,19,34,.92)_0%,rgba(6,22,38,.75)_42%,rgba(6,22,38,.22)_100%)]" />
          <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(0deg,rgba(5,16,28,.76)_0%,transparent_38%,rgba(5,16,28,.14)_100%)]" />
          <div aria-hidden="true" className="kira-city-contour pointer-events-none absolute inset-y-0 right-0 hidden w-[54%] opacity-40 lg:block">
            <svg viewBox="0 0 720 520" fill="none" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
              <path d="M-20 355 88 258l76 36 111-150 86 106 87-76 131 101 84-49 77 72" stroke="white" strokeOpacity=".62" strokeWidth="1.4"/>
              <path d="m-18 389 113-96 75 32 107-143 92 110 83-73 137 98 82-44 71 64" stroke="#f0c263" strokeOpacity=".72" strokeWidth="1"/>
              <path d="m-20 424 118-93 68 29 110-137 85 99 88-64 127 79 90-36 63 48" stroke="white" strokeOpacity=".32" strokeWidth="1"/>
            </svg>
          </div>
          <div className="relative mx-auto grid w-full max-w-7xl items-center gap-10 px-5 pb-20 pt-16 sm:px-8 sm:pb-24 sm:pt-20 lg:grid-cols-[1fr_.58fr]">
            <div className="kira-hero-copy max-w-3xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-[#f0c263]/45 bg-[#07192b]/55 px-4 py-2 text-xs font-semibold uppercase tracking-[.2em] text-[#f3cf7f] backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-[#f3cf7f]" /> Kira Imobiliare · Făgăraș & Brașov
              </p>
              <h1 className="mt-7 max-w-3xl font-[var(--font-playfair)] text-[2.65rem] leading-[1.02] tracking-[-.035em] text-white sm:text-6xl lg:text-[4.65rem]">
                Locul tău. <span className="text-[#f0c263]">Următorul</span> capitol.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-white/85 sm:text-lg">
                Pentru o casă de vânzare, un apartament de cumpărat sau o chirie potrivită, ai alături o echipă care cunoaște piața locală din Făgăraș și Brașov.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/proprietati" className="kira-button inline-flex items-center gap-3 rounded-xl bg-[#f0c263] px-6 py-3.5 font-semibold text-[#111720] shadow-[0_10px_34px_rgba(201,154,72,.25)]">
                  Explorează proprietățile <span aria-hidden="true">↗</span>
                </Link>
                <a href="https://wa.me/40775132969" className="inline-flex items-center gap-2 rounded-xl border border-white/35 bg-white/[.06] px-6 py-3.5 font-semibold text-white backdrop-blur transition hover:border-[#f0c263]/70 hover:bg-white/[.12]">
                  Hai să vorbim <span aria-hidden="true">→</span>
                </a>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium text-white/80">
                <a href="tel:+40775132969" className="text-white">{phone}</a>
                <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[#f0c263]" />
                <span>Vânzare · Cumpărare · Închiriere</span>
              </div>
            </div>
            <Link href="/localitati/brasov" className="kira-hero-location-card group relative hidden max-w-[21rem] justify-self-end rounded-[1.5rem] border border-white/30 bg-[#06182c]/65 p-6 shadow-[0_24px_70px_rgba(2,10,19,.35)] backdrop-blur-xl lg:block">
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-[#f3cf7f]"><span aria-hidden="true">⌖</span> Descoperă zona</span>
              <span className="mt-4 block font-[var(--font-playfair)] text-3xl text-white">Brașov</span>
              <span className="mt-1 block text-sm text-white/75">Centrul Vechi · Tâmpa</span>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#f3cf7f]">Imobiliare în Brașov <span className="transition group-hover:translate-x-1">→</span></span>
            </Link>
          </div>
          <BrasovPhotoCredit photo="panorama" className="absolute bottom-3 right-5 z-10 sm:right-8" />
        </section>

        <section aria-label="Caută după intenție" className="relative z-10 mx-auto -mt-10 max-w-7xl px-5 sm:-mt-12 sm:px-8">
          <div className="kira-intent-panel grid overflow-hidden rounded-2xl border border-[#e5e0d6] bg-white shadow-[0_18px_60px_rgba(21,25,31,.09)] sm:grid-cols-3">
            {[['01', 'Vreau să cumpăr', 'Descoperă proprietățile disponibile', '/proprietati'], ['02', 'Vreau să vând', 'Află pașii și promovarea ofertei', '/servicii'], ['03', 'Caut o chirie', 'Spune-ne zona și ce ți se potrivește', '/proprietati']].map(([number, title, body, href]) => (
              <Link key={number} href={href} className="kira-intent-item group flex items-start gap-4 border-b border-[#eee9df] p-5 transition hover:bg-[#fbf8f2] sm:border-b-0 sm:border-r sm:p-6 last:border-r-0">
                <span className="pt-1 text-xs font-semibold tracking-[.15em] text-[#b58b47]">{number}</span>
                <span><span className="block font-semibold text-[#151a20]">{title}<span className="ml-2 text-[#b58b47] transition group-hover:translate-x-1">↗</span></span><span className="mt-1 block text-sm text-[#73777a]">{body}</span></span>
              </Link>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-[#a27835]">Oferte publicate</p><h2 className="mt-3 font-[var(--font-playfair)] text-3xl tracking-tight text-[#171b20] sm:text-4xl">Proprietăți cu potențial</h2><p className="mt-3 max-w-xl text-[#73777a]">Vezi detaliile ofertelor publicate de echipa Kira Imobiliare.</p></div>
            <Link href="/proprietati" className="rounded-full border border-[#d9d2c5] px-5 py-3 text-sm font-semibold text-[#272b30] transition hover:border-[#b58b47] hover:text-[#8a6428]">Toate proprietățile <span aria-hidden="true">→</span></Link>
          </div>
          <div className="mt-9"><PropertyCards properties={properties} /></div>
        </section>

        <section id="servicii" className="border-y border-[#e8e3d9] bg-[#f7f5ef]">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24">
            <div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[.2em] text-[#a27835]">Servicii imobiliare</p><h2 className="mt-3 font-[var(--font-playfair)] text-3xl leading-tight text-[#171b20] sm:text-4xl">Pași limpezi pentru o mutare importantă.</h2><p className="mt-4 leading-7 text-[#656a6d]">Îți oferim îndrumare directă, de la prima discuție până la următorul pas.</p></div>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {[
                ['01', 'Vânzare', 'Pregătim oferta, prezentarea proprietății și pașii de promovare împreună cu tine.'],
                ['02', 'Cumpărare', 'Clarificăm criteriile, discutăm opțiunile și te ajutăm să compari ofertele.'],
                ['03', 'Închiriere', 'Pornim de la zona, bugetul și tipul de proprietate pe care îl cauți.'],
              ].map(([number, title, body]) => <article key={number} className="rounded-2xl border border-[#e7e1d5] bg-white p-7 shadow-[0_8px_26px_rgba(26,29,32,.035)]"><span className="text-xs font-semibold tracking-[.16em] text-[#b58b47]">{number}</span><h3 className="mt-4 font-[var(--font-playfair)] text-2xl text-[#171b20]">{title}</h3><p className="mt-3 leading-7 text-[#6d7275]">{body}</p></article>)}
            </div>
          </div>
        </section>

        <section id="zone" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24">
          <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-[#a27835]">Unde activăm</p><h2 className="mt-3 font-[var(--font-playfair)] text-3xl text-[#171b20] sm:text-4xl">Două piețe. Aceeași grijă.</h2></div><p className="max-w-md text-sm leading-6 text-[#73777a]">Servicii imobiliare locale în Făgăraș, cu prezență extinsă în Brașov.</p></div>
          <div className="mt-9 grid gap-5 md:grid-cols-2">
            <article className="group relative overflow-hidden rounded-3xl bg-[#10151d] p-8 text-white sm:p-10"><div aria-hidden="true" className="absolute -right-10 -top-14 h-56 w-56 rounded-full border border-[#d5aa5c]/25 transition duration-500 group-hover:scale-110" /><p className="text-xs font-semibold uppercase tracking-[.2em] text-[#e4bd70]">Sediul Kira</p><h3 className="mt-3 font-[var(--font-playfair)] text-3xl">Făgăraș & împrejurimi</h3><p className="mt-4 max-w-lg leading-7 text-white/65">Cunoaștem zona și oferim consultanță pentru vânzare, cumpărare și închiriere.</p><Link href="/localitati/fagaras" className="mt-7 inline-flex font-semibold text-[#f1ce84]">Imobiliare în Făgăraș <span className="ml-2">→</span></Link></article>
            <article className="kira-brasov-card group relative min-h-[24rem] overflow-hidden rounded-3xl bg-[#07192b] text-white shadow-[0_18px_55px_rgba(15,24,34,.16)]">
              <img src={brasovOldTown.src} alt={brasovOldTown.alt} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.035]" loading="lazy" />
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#07192b]/95 via-[#07192b]/35 to-[#07192b]/5" />
              <div className="absolute inset-x-0 bottom-0 p-7 sm:p-9">
                <p className="text-xs font-semibold uppercase tracking-[.2em] text-[#f3cf7f]">Kira Imobiliare</p>
                <h3 className="mt-3 font-[var(--font-playfair)] text-3xl">Brașov</h3>
                <p className="mt-3 max-w-lg leading-7 text-white/85">Cauți să vinzi, să cumperi sau să închiriezi în Brașov? Hai să discutăm despre opțiunile potrivite.</p>
                <Link href="/localitati/brasov" className="mt-5 inline-flex font-semibold text-[#f3cf7f]">Imobiliare în Brașov <span className="ml-2">→</span></Link>
                <BrasovPhotoCredit photo="old-town" className="mt-4" />
              </div>
            </article>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8 sm:pb-24">
          <div className="relative overflow-hidden rounded-[2rem] bg-[#0b1017] px-7 py-10 text-white sm:px-12 sm:py-12">
            <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-32 h-96 w-96 rounded-full bg-[#bd8c3a]/20 blur-[90px]" />
            <div className="relative flex flex-col justify-between gap-8 md:flex-row md:items-center">
              <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-[#e4bd70]">Începe cu un mesaj</p><h2 className="mt-3 font-[var(--font-playfair)] text-3xl sm:text-4xl">Ai un plan imobiliar?</h2><p className="mt-3 text-white/65">Spune-ne ce cauți. Discutăm fără grabă despre următorul pas.</p></div>
              <div className="flex flex-wrap gap-3"><a href="https://wa.me/40775132969" className="rounded-full bg-[#d5aa5c] px-6 py-3.5 font-semibold text-[#111720] transition hover:bg-[#e4bd70]">Scrie pe WhatsApp</a><a href="tel:+40775132969" className="rounded-full border border-white/20 px-6 py-3.5 font-semibold transition hover:border-[#e4bd70]/70">Sună la {phone}</a></div>
            </div>
          </div>
        </section>
      </main>
    </PublicSiteFrame>
  );
}
