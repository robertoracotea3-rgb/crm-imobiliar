import { fetchJson } from '../http';
import {
  guessCategory, guessTransaction, type RawProspect, type SourceAdapter, type SourceFetchResult,
} from '../types';

const API = 'https://www.olx.ro/api/v1/offers';
const BASE = 'category_id=3&region_id=4&owner_type=private';
const LIMIT = 50;
const MAX_PAGES = 40;
const PAGE_DELAY_MS = 250;

interface OlxParam { key: string; value?: { value?: number; currency?: string } }
interface OlxOffer {
  id: number;
  url?: string;
  title?: string;
  created_time?: string;
  business?: boolean;
  params?: OlxParam[];
  location?: { city?: { name?: string }; region?: { name?: string }; district?: { name?: string } };
  contact?: { name?: string };
  user?: { name?: string };
}
interface OlxResponse { data?: OlxOffer[]; metadata?: { total_elements?: number } }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function mapOffer(offer: OlxOffer): RawProspect {
  const price = (offer.params || []).find((parameter) => parameter.key === 'price')?.value;
  return {
    source: 'olx', external_id: String(offer.id), url: offer.url!, title: offer.title || '',
    price: typeof price?.value === 'number' ? price.value : undefined,
    currency: price?.currency || 'EUR', category: guessCategory(offer.title),
    transaction: guessTransaction(offer.title), city: offer.location?.city?.name || 'Brașov',
    county: offer.location?.region?.name || 'Brașov', zone: offer.location?.district?.name,
    seller_name: offer.contact?.name || offer.user?.name, posted_at: offer.created_time,
  };
}

export const olxAdapter: SourceAdapter = {
  key: 'olx',
  label: 'OLX',
  termsUrl: 'https://ajutor.olx.ro/olxhelpro/s/article/condi%C8%9Bii-de-utilizare-V31',
  async fetchBrasov(): Promise<SourceFetchResult> {
    const items: RawProspect[] = [];
    const seen = new Set<string>();
    const warnings: string[] = [];
    let complete = true;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const offset = page * LIMIT;
      let response: OlxResponse;
      try {
        response = await fetchJson<OlxResponse>(`${API}?offset=${offset}&limit=${LIMIT}&${BASE}`);
      } catch (error) {
        if (page === 0) throw new Error(`OLX inaccesibil: ${error instanceof Error ? error.message : 'eroare'}`);
        complete = false;
        warnings.push(`Pagina ${page + 1} nu a putut fi citită; rezultatul este parțial.`);
        break;
      }

      const offers = response.data || [];
      if (!offers.length) break;
      for (const offer of offers) {
        if (offer.business === true || !offer.url || seen.has(String(offer.id))) continue;
        seen.add(String(offer.id));
        items.push(mapOffer(offer));
      }
      const total = response.metadata?.total_elements ?? 0;
      if (total && offset + LIMIT >= total) break;
      await sleep(PAGE_DELAY_MS);
    }

    return { items, complete, warnings };
  },
};
