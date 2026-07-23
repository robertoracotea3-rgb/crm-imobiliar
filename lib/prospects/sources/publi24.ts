import { fetchHtml } from '../http';
import { guessCategory, type RawProspect, type SourceAdapter, type SourceFetchResult } from '../types';

const BASE = 'https://www.publi24.ro/anunturi/imobiliare';
const MAX_PAGES = 12;
const PAGE_DELAY_MS = 300;

function pageUrl(transaction: 'de-vanzare' | 'de-inchiriere', page: number): string {
  return `${BASE}/${transaction}/brasov/?commercial=false${page > 1 ? `&pag=${page}` : ''}`;
}

function decodeEntities(value: string): string {
  return value.replace(/&#(\d+);/g, (_, number) => String.fromCharCode(Number(number)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ');
}

function categoryFromUrl(url: string): string {
  if (/\/terenuri\//.test(url)) return 'teren';
  if (/\/case/.test(url)) return 'casa';
  if (/\/apartamente/.test(url)) return 'apartament';
  if (/\/spatii-comerciale|\/birouri/.test(url)) return 'comercial';
  return '';
}

function parsePrice(block: string): { price?: number; currency: string } {
  const matches = [...block.matchAll(/([\d][\d.,\s]{1,12})\s*(EUR|€|lei|RON)\b(\s*\/?\s*m)?/gi)];
  for (const match of matches) {
    if (match[3]) continue;
    const value = Number(match[1].replace(/[.\s,]/g, ''));
    if (Number.isFinite(value) && value >= 100) {
      return { price: value, currency: /lei|ron/i.test(match[2]) ? 'RON' : 'EUR' };
    }
  }
  return { currency: 'EUR' };
}

function parseListings(html: string, transaction: 'de-vanzare' | 'de-inchiriere'): RawProspect[] {
  const items: RawProspect[] = [];
  for (const block of html.split('<h2 class="article-title">').slice(1)) {
    const link = block.match(/^\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link || !/publi24\.ro\/anunturi\//.test(link[1])) continue;
    const title = decodeEntities(link[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    if (!title) continue;
    const id = block.match(/data-id="([^"]+)"/);
    const location = block.match(/class="article-location"[^>]*>([\s\S]*?)<\/p>/);
    const city = location
      ? decodeEntities(location[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()).split(',')[0].trim()
      : 'Brașov';
    const { price, currency } = parsePrice(block);
    items.push({
      source: 'publi24', external_id: id?.[1] || link[1], url: link[1], title, price, currency,
      category: categoryFromUrl(link[1]) || guessCategory(title),
      transaction: transaction === 'de-inchiriere' ? 'inchiriere' : 'vanzare',
      county: 'Brașov', city: city || 'Brașov',
    });
  }
  return items;
}

export const publi24Adapter: SourceAdapter = {
  key: 'publi24',
  label: 'Publi24',
  termsUrl: 'https://ajutor.publi24.ro/reguli-adaugare-anunt/',
  async fetchBrasov(): Promise<SourceFetchResult> {
    const items: RawProspect[] = [];
    const seen = new Set<string>();
    const warnings: string[] = [];
    let complete = true;
    let anyPageSucceeded = false;

    for (const transaction of ['de-vanzare', 'de-inchiriere'] as const) {
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        let html: string;
        try {
          html = await fetchHtml(pageUrl(transaction, page));
          anyPageSucceeded = true;
        } catch (error) {
          if (!anyPageSucceeded) throw new Error(`Publi24 inaccesibil: ${error instanceof Error ? error.message : 'eroare'}`);
          complete = false;
          warnings.push(`${transaction}, pagina ${page}: rezultat parțial.`);
          break;
        }
        const rows = parseListings(html, transaction);
        if (!rows.length) break;
        let added = 0;
        for (const row of rows) {
          if (seen.has(row.external_id)) continue;
          seen.add(row.external_id);
          items.push(row);
          added += 1;
        }
        if (!added) break;
        await new Promise((resolve) => setTimeout(resolve, PAGE_DELAY_MS));
      }
    }
    return { items, complete, warnings };
  },
};
