import Link from 'next/link';
import { ArrowUpRight, KeyRound, ShieldCheck, Sparkles } from 'lucide-react';
import { PublicSiteFrame } from './PublicSiteFrame';
import { getPublicProperties, toCard } from '@/lib/public-properties';
import { ExplorerProvider, ExplorerResults, FeaturedRail, SearchBar } from './PropertyExplorer';
import { PropertyMap } from './PropertyMap';
import { OpenPanelButton } from './SiteUi';
import { brasovOldTown, BrasovPhotoCredit } from './BrasovVisuals';
import { SITE, waLink } from './site';

// Illustrative hero photo (Unsplash License). Listing photos always come from the CRM.
const HERO = 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&q=78';

export async function PublicHome() {
  const cards = (await getPublicProperties()).map(toCard);
  const businessSchema = {
    '@context': 'https://schema.org', '@type': 'RealEstateAgent', name: 'Kira Imobiliare',
    url: 'https://www.kiraimobiliare.ro/', telephone: '+40775132969', email: SITE.email,
    address: { '@type': 'PostalAddress', streetAddress: 'Str. Ion Creangă 35', addressLocality: 'Făgăraș', addressRegion: 'Brașov', addressCountry: 'RO' },
    areaServed: [{ '@type': 'City', name: 'Făgăraș' }, { '@type': 'City', name: 'Brașov' }],
  };

  return (
    <PublicSiteFrame>
      <main id="continut" className="kira-homepage">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(businessSchema).replace(/</g, '\\u003c') }} />
        <ExplorerProvider properties={cards}>
          {/* Hero (65%) + "Proprietăți recomandate" (35%) */}
          <section className="grid bg-[#121417] lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)]">
            <div className="relative isolate flex min-h-[38rem] flex-col justify-between overflow-hidden lg:min-h-[calc(100svh-4.5rem)] lg:max-h-[56rem]">
              <img
                src={`${HERO}&w=2000`}
                srcSet={`${HERO}&w=900 900w, ${HERO}&w=1400 1400w, ${HERO}&w=2000 2000w`}
                sizes="(min-width: 1024px) 65vw, 100vw"
                alt="Vilă modernă cu piscină, la apus"
                className="kira-hero-photo absolute inset-0 -z-10 h-full w-full object-cover"
                fetchPriority="high"
              />
              <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(135deg,rgba(18,20,23,.92)_0%,rgba(18,20,23,.55)_42%,rgba(18,20,23,.15)_70%,rgba(18,20,23,.55)_100%)]" />
              <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_75%_35%,rgba(212,175,55,.22),transparent_55%)] mix-blend-screen" />
              <div aria-hidden="true" className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-gradient-to-t from-[#121417]/85 to-transparent" />

              <div className="kira-hero-copy px-5 pt-14 sm:px-10 sm:pt-20 lg:px-14 lg:pt-24">
                <p className="inline-flex items-center gap-2 rounded-full border border-[#C8A252]/45 bg-[#121417]/45 px-4 py-2 text-[11px] font-bold uppercase tracking-[.24em] text-[#E9CF8E] backdrop-blur">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37]" /> Făgăraș · Brașov · împrejurimi
                </p>
                <h1 className="mt-7 max-w-3xl font-[var(--font-playfair)] text-[2.6rem] font-medium leading-[1.04] tracking-[-.02em] text-[#F6F3EE] sm:text-6xl lg:text-[4.4rem]">
                  Găsește-ți căminul de vis cu{' '}
                  <span className="kira-gold-text block font-semibold">KIRA IMOBILIARE</span>
                </h1>
                <p className="mt-6 max-w-xl text-lg leading-8 text-white/80 sm:text-xl">Proprietăți exclusive, servicii de încredere.</p>
                <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-white/75">
                  <a href={SITE.phoneLink} className="font-semibold text-white hover:text-[#E9CF8E]">{SITE.phone}</a>
                  <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[#C8A252]" />
                  <span>Vânzare · Cumpărare · Închiriere</span>
                </div>
              </div>

              <div className="px-4 pb-6 pt-10 sm:px-10 sm:pb-10 lg:px-14">
                <SearchBar />
                <p className="kira-photo-credit mt-3 text-right">Fotografie ilustrativă · <a href="https://unsplash.com/license" target="_blank" rel="noreferrer">Unsplash License</a></p>
              </div>
            </div>

            <aside aria-label="Proprietăți recomandate" className="border-t border-[#C8A252]/15 bg-[#121417] px-5 py-8 sm:px-8 lg:border-l lg:border-t-0 lg:px-7 lg:py-10 xl:px-9">
              <FeaturedRail />
            </aside>
          </section>

          {/* Map (65%) + Private Client Concierge (35%) on warm ivory */}
          <section className="bg-[#F6F3EE] px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
            <div className="mx-auto max-w-[92rem]">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[.24em] text-[#9a7a35]">Harta ofertelor</p>
                  <h2 className="mt-3 font-[var(--font-playfair)] text-4xl font-medium tracking-tight sm:text-5xl">Unde sunt proprietățile</h2>
                </div>
                <p className="max-w-md text-[15px] leading-7 text-[#121417]/60">Apasă pe un pin auriu ca să vezi oferta. Harta urmează căutarea de mai sus.</p>
              </div>
              <div className="mt-9 grid gap-6 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)]">
                <PropertyMap />
                <div className="kira-concierge relative overflow-hidden rounded-[1.6rem] bg-[#121417] p-2 text-[#F6F3EE] shadow-[0_24px_60px_rgba(18,20,23,.25)]">
                  <div className="relative flex h-full flex-col rounded-[1.25rem] border border-[#C8A252]/55 p-7 outline outline-1 outline-offset-[-10px] outline-[#C8A252]/25 sm:p-9">
                    <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#D4AF37]/15 blur-[80px]" />
                    <img src="/images/kira-mark-gold.png" alt="" className="h-14 w-auto self-start opacity-90" loading="lazy" />
                    <p className="mt-6 text-[11px] font-bold uppercase tracking-[.26em] text-[#C8A252]">Consultanță dedicată</p>
                    <h2 className="mt-3 font-[var(--font-playfair)] text-[2.4rem] font-medium leading-[1.05]">
                      Private Client<br /><span className="kira-gold-text">Concierge</span>
                    </h2>
                    <p className="mt-4 leading-7 text-white/70">Un consultant care se ocupă doar de tine, de la prima discuție până la notar.</p>
                    <ul className="mt-6 space-y-3 text-[15px] text-white/85">
                      <li className="flex gap-3"><Sparkles size={18} className="mt-0.5 shrink-0 text-[#C8A252]" /> Acces la proprietăți off-market, care nu apar public</li>
                      <li className="flex gap-3"><KeyRound size={18} className="mt-0.5 shrink-0 text-[#C8A252]" /> Evaluare gratuită a proprietății tale</li>
                      <li className="flex gap-3"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#C8A252]" /> Discreție și acte verificate pas cu pas</li>
                    </ul>
                    <OpenPanelButton panel={{ kind: 'contact', topic: 'Discuție privată (Private Client)' }} className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-[#C8A252] px-6 py-3.5 font-semibold text-[#121417] shadow-[0_12px_32px_rgba(200,162,82,.3)] transition hover:bg-[#D4AF37] lg:mt-auto">
                      Programează o discuție privată
                    </OpenPanelButton>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Results of the search */}
          <section id="rezultate" className="scroll-mt-24 bg-[#F6F3EE] px-5 pb-20 sm:px-8 lg:px-10">
            <div className="mx-auto max-w-[92rem]">
              <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[.24em] text-[#9a7a35]">Oferta Kira</p>
                  <h2 className="mt-3 font-[var(--font-playfair)] text-4xl font-medium tracking-tight sm:text-5xl">Proprietăți disponibile</h2>
                </div>
                <Link href="/proprietati" className="inline-flex items-center gap-1.5 rounded-full border border-[#121417]/15 px-5 py-2.5 text-sm font-semibold transition hover:border-[#C8A252]">Toate proprietățile <ArrowUpRight size={15} /></Link>
              </div>
              <ExplorerResults pageSize={6} />
            </div>
          </section>
        </ExplorerProvider>

        <section id="servicii" className="bg-[#121417] px-5 py-20 text-[#F6F3EE] sm:px-8 sm:py-24 lg:px-10">
          <div className="mx-auto max-w-[92rem]">
            <div className="max-w-2xl">
              <p className="text-[11px] font-bold uppercase tracking-[.24em] text-[#C8A252]">Servicii imobiliare</p>
              <h2 className="mt-3 font-[var(--font-playfair)] text-4xl font-medium leading-tight sm:text-5xl">Pași limpezi pentru o mutare importantă.</h2>
            </div>
            <div className="mt-12 grid gap-px overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/10 md:grid-cols-3">
              {[
                ['01', 'Vânzare', 'Evaluăm proprietatea, pregătim prezentarea și o promovăm pe site și pe platformele potrivite.', 'listing'],
                ['02', 'Cumpărare', 'Clarificăm criteriile, filtrăm ofertele și te însoțim la vizionări, negociere și acte.', 'contact'],
                ['03', 'Închiriere', 'Pornim de la zonă, buget și termen și verificăm contractul înainte de semnare.', 'contact'],
              ].map(([n, title, body, kind]) => (
                <div key={n} className="group bg-[#121417] p-8 transition hover:bg-[#171a1f] sm:p-10">
                  <span className="font-[var(--font-playfair)] text-5xl text-[#C8A252]/40 transition group-hover:text-[#C8A252]">{n}</span>
                  <h3 className="mt-6 font-[var(--font-playfair)] text-3xl">{title}</h3>
                  <p className="mt-3 leading-7 text-white/60">{body}</p>
                  <OpenPanelButton panel={kind === 'listing' ? { kind: 'listing' } : { kind: 'contact', topic: title === 'Cumpărare' ? 'Vreau să cumpăr' : 'Caut o chirie' }} className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[#E9CF8E] hover:text-white">
                    {kind === 'listing' ? 'Adaugă anunț' : 'Discută cu noi'} <ArrowUpRight size={15} />
                  </OpenPanelButton>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="zone" className="bg-[#F6F3EE] px-5 py-20 sm:px-8 sm:py-24 lg:px-10">
          <div className="mx-auto max-w-[92rem]">
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[.24em] text-[#9a7a35]">Unde activăm</p>
                <h2 className="mt-3 font-[var(--font-playfair)] text-4xl font-medium sm:text-5xl">Două piețe. Aceeași grijă.</h2>
              </div>
              <p className="max-w-md text-[15px] leading-7 text-[#121417]/60">Sediul nostru e în Făgăraș; lucrăm și în localitățile din jur și în Brașov.</p>
            </div>
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              <Link href="/localitati/fagaras" className="group relative flex min-h-[22rem] flex-col justify-end overflow-hidden rounded-[1.6rem] bg-[#121417] p-8 text-white sm:p-10">
                <div aria-hidden="true" className="absolute -right-16 -top-16 h-72 w-72 rounded-full border border-[#C8A252]/25 transition duration-700 group-hover:scale-110" />
                <div aria-hidden="true" className="absolute -right-4 -top-4 h-48 w-48 rounded-full border border-[#C8A252]/15 transition duration-700 group-hover:scale-110" />
                <p className="text-[11px] font-bold uppercase tracking-[.24em] text-[#C8A252]">Sediul Kira</p>
                <h3 className="mt-3 font-[var(--font-playfair)] text-4xl">Făgăraș & împrejurimi</h3>
                <p className="mt-3 max-w-md leading-7 text-white/65">Victoria, Șercaia, Hârseni, Voila, Recea, Drăguș, Ucea și satele din jur.</p>
                <span className="mt-6 inline-flex items-center gap-1.5 font-semibold text-[#E9CF8E]">Imobiliare în Făgăraș <ArrowUpRight size={16} className="transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></span>
              </Link>
              {/* Card is a div with a stretched link, so the photo credit can stay its own link (no <a> inside <a>). */}
              <div className="group relative flex min-h-[22rem] flex-col justify-end overflow-hidden rounded-[1.6rem] bg-[#121417] p-8 text-white sm:p-10">
                <img src={brasovOldTown.src} alt={brasovOldTown.alt} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]" loading="lazy" />
                <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#121417] via-[#121417]/45 to-transparent" />
                <Link href="/localitati/brasov" aria-label="Imobiliare în Brașov" className="absolute inset-0 z-[1] rounded-[1.6rem]" />
                <div className="pointer-events-none relative">
                  <p className="text-[11px] font-bold uppercase tracking-[.24em] text-[#E9CF8E]">Kira Imobiliare</p>
                  <h3 className="mt-3 font-[var(--font-playfair)] text-4xl">Brașov</h3>
                  <p className="mt-3 max-w-md leading-7 text-white/80">Centrul Vechi, Schei, Tractorul, Coresi, Astra și celelalte cartiere.</p>
                  <span className="mt-6 inline-flex items-center gap-1.5 font-semibold text-[#E9CF8E]">Imobiliare în Brașov <ArrowUpRight size={16} className="transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></span>
                </div>
                <BrasovPhotoCredit photo="old-town" className="relative z-10 mt-4" />
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#F6F3EE] px-5 pb-20 sm:px-8 sm:pb-24 lg:px-10">
          <div className="relative mx-auto max-w-[92rem] overflow-hidden rounded-[1.8rem] bg-[#121417] px-7 py-12 text-white sm:px-14 sm:py-14">
            <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-32 h-96 w-96 rounded-full bg-[#D4AF37]/20 blur-[90px]" />
            <div className="relative flex flex-col justify-between gap-8 md:flex-row md:items-center">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[.24em] text-[#C8A252]">Începe cu un mesaj</p>
                <h2 className="mt-3 font-[var(--font-playfair)] text-4xl font-medium sm:text-5xl">Ai un plan imobiliar?</h2>
                <p className="mt-3 text-white/65">Spune-ne ce cauți. Discutăm fără grabă despre următorul pas.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <a href={waLink()} className="rounded-full bg-[#C8A252] px-6 py-3.5 font-semibold text-[#121417] transition hover:bg-[#D4AF37]">Scrie pe WhatsApp</a>
                <a href={SITE.phoneLink} className="rounded-full border border-white/20 px-6 py-3.5 font-semibold transition hover:border-[#C8A252]">Sună la {SITE.phone}</a>
              </div>
            </div>
          </div>
        </section>
      </main>
    </PublicSiteFrame>
  );
}
