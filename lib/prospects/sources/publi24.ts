// Adaptor Publi24 — a doua sursă de particulari. Publi24 are un filtru real de
// persoane fizice: parametrul `commercial=false` (commercial=true = agenții).
// Parsăm HTML-ul listei (blocuri .article-title) — telefonul NU e în listă (ca la
// OLX → best-effort). Paginare cu `pag`. Limităm nr. de pagini ca refresh-ul total
// (OLX + Publi24) să rămână sub timeout-ul funcției serverless.
import { fetchHtml } from '../http';
import { guessCategory, type RawProspect, type SourceAdapter } from '../types';

const BASE = 'https://www.publi24.ro/anunturi/imobiliare';
const MAX_PAGES = 12;      // per tip de tranzacție (~288 anunțuri/tranzacție)
const PAGE_DELAY_MS = 150;

function pageUrl(transaction: 'de-vanzare' | 'de-inchiriere', page: number): string {
  const p = page > 1 ? `&pag=${page}` : '';
  return `${BASE}/${transaction}/brasov/?commercial=false${p}`;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ');
}

function catFromUrl(url: string): string {
  if (/\/terenuri\//.test(url)) return 'teren';
  if (/\/case/.test(url)) return 'casa';
  if (/\/apartamente/.test(url)) return 'apartament';
  if (/\/spatii-comerciale|\/birouri/.test(url)) return 'comercial';
  return '';
}

function priceOf(block: string): { price?: number; currency: string } {
  const matches = [...block.matchAll(/([\d][\d.,\s]{1,12})\s*(EUR|€|lei|RON)\b(\s*\/?\s*m)?/gi)];
  for (const m of matches) {
    if (m[3]) continue; // sare peste „EUR/m²"
    const val = Number(m[1].replace(/[.\s,]/g, ''));
    if (Number.isFinite(val) && val >= 100) return { price: val, currency: /lei|ron/i.test(m[2]) ? 'RON' : 'EUR' };
  }
  return { price: undefined, currency: 'EUR' };
}

function parseListings(html: string, transaction: 'de-vanzare' | 'de-inchiriere'): RawProspect[] {
  const out: RawProspect[] = [];
  const blocks = html.split('<h2 class="article-title">').slice(1);
  for (const b of blocks) {
    const linkM = b.match(/^\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!linkM) continue;
    const url = linkM[1];
    if (!/publi24\.ro\/anunturi\//.test(url)) continue;
    const title = decodeEntities(linkM[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    if (!title) continue;
    const idM = b.match(/data-id="([^"]+)"/);
    const locM = b.match(/class="article-location"[^>]*>([\s\S]*?)<\/p>/);
    const city = locM ? decodeEntities(locM[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()).split(',')[0].trim() : 'Brașov';
    const { price, currency } = priceOf(b);
    out.push({
      source: 'publi24',
      external_id: idM ? idM[1] : url,
      url,
      title,
      price,
      currency,
      category: catFromUrl(url) || guessCategory(title),
      transaction: transaction === 'de-inchiriere' ? 'inchiriere' : 'vanzare',
      city: city || 'Brașov',
      phone: undefined, // nu apare în listă — agentul dă clic pe link
    });
  }
  return out;
}

export const publi24Adapter: SourceAdapter = {
  key: 'publi24',
  label: 'Publi24',
  async fetchBrasov(): Promise<RawProspect[]> {
    const out: RawProspect[] = [];
    const seen = new Set<string>();
    let firstOk = false;

    for (const tx of ['de-vanzare', 'de-inchiriere'] as const) {
      for (let page = 1; page <= MAX_PAGES; page++) {
        let html: string;
        try {
          html = await fetchHtml(pageUrl(tx, page));
          firstOk = true;
        } catch (e) {
          if (!firstOk) throw new Error('Publi24 inaccesibil (posibil blocat) — ' + (e instanceof Error ? e.message : ''));
          break; // pagini ulterioare eșuate: păstrăm ce am adunat
        }
        const rows = parseListings(html, tx);
        if (!rows.length) break;
        let added = 0;
        for (const r of rows) {
          if (seen.has(r.external_id)) continue;
          seen.add(r.external_id);
          out.push(r);
          added++;
        }
        if (added === 0) break; // pagină repetată / capăt
        await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
      }
    }
    return out;
  },
};
