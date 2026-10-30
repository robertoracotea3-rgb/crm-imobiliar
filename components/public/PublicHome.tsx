import Link from 'next/link';
import { PublicSiteFrame } from './PublicSiteFrame';
import { getPublicProperties } from '@/lib/public-properties';
import { PropertyCards } from './PropertyCards';

const phone = '0775 132 969';

export async function PublicHome() {
  const properties = (await getPublicProperties()).slice(0, 6);
  return (
    <PublicSiteFrame>
      <main id="continut">
        <section className="relative overflow-hidden bg-[#e9eee7]">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 sm:px-8 md:grid-cols-[1.1fr_.9fr] md:py-28">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[.16em] text-[#0c7456]">Kira Imobiliare · Făgăraș și Brașov</p>
              <h1 className="mt-5 max-w-3xl font-[var(--font-playfair)] text-4xl leading-tight text-[#14251d] sm:text-5xl lg:text-6xl">
                Găsește locul potrivit pentru următorul tău capitol.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-[#4f6057]">
                Te ajutăm să vinzi, să cumperi sau să închiriezi o proprietate în zona Făgărașului. Pregătim extinderea activității Kira Imobiliare în Brașov.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a href="tel:+40775132969" className="rounded-full bg-[#0c7456] px-6 py-3.5 font-semibold text-white hover:bg-[#095c44]">Vorbește cu un agent</a>
                <Link href="/localitati/brasov" className="rounded-full border border-[#9eafa5] bg-white/70 px-6 py-3.5 font-semibold text-[#18372a] hover:bg-white">Descoperă Brașovul</Link>
              </div>
              <p className="mt-5 text-sm text-[#5d6d64]">{phone} · contact@kiraimobiliare.ro</p>
            </div>
            <div className="rounded-[2rem] bg-[#14251d] p-8 text-white shadow-xl sm:p-10">
              <p className="text-sm font-semibold uppercase tracking-[.14em] text-[#a9d5c1]">O decizie importantă, cu pași clari</p>
              <h2 className="mt-4 font-[var(--font-playfair)] text-3xl leading-snug">Consultanță imobiliară, aproape de tine.</h2>
              <p className="mt-5 leading-7 text-white/75">Discutăm despre nevoile tale, clarificăm opțiunile și stabilim împreună pașii următori.</p>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {['Vânzare', 'Cumpărare', 'Închiriere'].map((service) => <div key={service} className="rounded-xl border border-white/15 px-4 py-3 text-center text-sm font-medium">{service}</div>)}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-sm font-semibold uppercase tracking-[.14em] text-[#0c7456]">Oferte publicate</p><h2 className="mt-2 font-[var(--font-playfair)] text-3xl sm:text-4xl">Proprietăți recomandate</h2></div><Link href="/proprietati" className="font-semibold text-[#0c7456]">Vezi toate proprietățile →</Link></div>
          <div className="mt-8"><PropertyCards properties={properties} /></div>
        </section>

        <section id="servicii" className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <p className="text-sm font-semibold uppercase tracking-[.14em] text-[#0c7456]">Cum te ajutăm</p>
          <h2 className="mt-3 max-w-2xl font-[var(--font-playfair)] text-3xl leading-tight sm:text-4xl">Servicii imobiliare adaptate obiectivului tău</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              ['Vrei să vinzi?', 'Discutăm despre proprietate, stabilim informațiile necesare și planificăm promovarea ofertei.'],
              ['Cauți să cumperi?', 'Spune-ne ce cauți și te ajutăm să analizezi ofertele și să programezi pașii următori.'],
              ['Ai nevoie să închiriezi?', 'Clarificăm zona, bugetul și tipul de proprietate pentru a orienta căutarea.'],
            ].map(([title, body]) => <article key={title} className="rounded-2xl border border-[#e1e6df] bg-white p-7 shadow-sm"><h3 className="text-xl font-semibold">{title}</h3><p className="mt-3 leading-7 text-[#617067]">{body}</p></article>)}
          </div>
        </section>

        <section id="zone" className="bg-white py-20">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <p className="text-sm font-semibold uppercase tracking-[.14em] text-[#0c7456]">Zone</p>
            <h2 className="mt-3 font-[var(--font-playfair)] text-3xl sm:text-4xl">Suntem aproape de piața locală</h2>
            <div className="mt-9 grid gap-5 md:grid-cols-2">
              <article className="rounded-2xl bg-[#f7f6f2] p-7 sm:p-9"><p className="text-sm font-semibold text-[#0c7456]">Activitate locală</p><h3 className="mt-2 text-2xl font-semibold">Făgăraș și împrejurimi</h3><p className="mt-3 max-w-xl leading-7 text-[#617067]">Aici se află sediul Kira Imobiliare. Contactează echipa pentru informații despre serviciile și ofertele curente.</p><a href="tel:+40775132969" className="mt-6 inline-block font-semibold text-[#0c7456]">Sună la {phone} →</a></article>
              <article className="rounded-2xl bg-[#e9eee7] p-7 sm:p-9"><p className="text-sm font-semibold text-[#0c7456]">Extindere în pregătire</p><h3 className="mt-2 text-2xl font-semibold">Brașov</h3><p className="mt-3 max-w-xl leading-7 text-[#617067]">Pregătim extinderea activității în municipiul Brașov. Lasă-ne un mesaj și discutăm despre oferta disponibilă și următorii pași.</p><Link href="/localitati/brasov" className="mt-6 inline-block font-semibold text-[#0c7456]">Vezi pagina Brașov →</Link></article>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-8 md:grid-cols-2">
          <article className="rounded-2xl border border-[#e1e6df] bg-white p-7 sm:p-9"><p className="text-sm font-semibold uppercase tracking-wide text-[#0c7456]">Evaluare proprietate</p><h2 className="mt-3 font-[var(--font-playfair)] text-3xl">Află care sunt pașii pentru vânzare</h2><p className="mt-4 leading-7 text-[#617067]">Trimite-ne câteva informații despre proprietate și discutăm împreună despre evaluare și promovare.</p><a href="mailto:contact@kiraimobiliare.ro?subject=Solicitare%20evaluare%20proprietate" className="mt-6 inline-block rounded-full bg-[#0c7456] px-5 py-3 font-semibold text-white">Solicită o evaluare</a></article>
          <article className="rounded-2xl bg-[#e9eee7] p-7 sm:p-9"><p className="text-sm font-semibold uppercase tracking-wide text-[#0c7456]">Ghiduri imobiliare</p><h2 className="mt-3 font-[var(--font-playfair)] text-3xl">Ia o decizie cu informații clare</h2><p className="mt-4 leading-7 text-[#617067]">Găsești pe site articole despre pregătirea unei vânzări, cumpărarea unei locuințe și documentele tranzacției.</p><Link href="/blog" className="mt-6 inline-block font-semibold text-[#0c7456]">Citește articolele →</Link></article>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="flex flex-col justify-between gap-6 rounded-3xl bg-[#0c7456] p-8 text-white sm:flex-row sm:items-center sm:p-10">
            <div><h2 className="font-[var(--font-playfair)] text-3xl">Ai un plan imobiliar?</h2><p className="mt-2 text-white/80">Discută cu echipa Kira Imobiliare.</p></div>
            <a href="https://wa.me/40775132969" className="w-fit rounded-full bg-white px-6 py-3.5 font-semibold text-[#0c513d] hover:bg-[#eff7f2]">Scrie pe WhatsApp</a>
          </div>
        </section>
      </main>
    </PublicSiteFrame>
  );
}
