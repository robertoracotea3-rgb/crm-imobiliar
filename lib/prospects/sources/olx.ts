// Adaptor OLX — folosește API-ul JSON public al OLX (mult mai ușor decât HTML-ul
// de 3.4MB/pagină) cu paginare, ca să aducă TOT județul Brașov (nu doar prima pagină).
// URL-ul + parametrii sunt exact cei folosiți de site-ul OLX:
//   category_id=3 (imobiliare) · region_id=4 (județul Brașov) · owner_type=private (particulari)
// NU trimitem city_id (acela ar limita la orașul Brașov) — vrem tot județul.
import { fetchJson } from '../http';
import { guessCategory, guessTransaction, type RawProspect, type SourceAdapter } from '../types';

const API = 'https://www.olx.ro/api/v1/offers';
const BASE = 'category_id=3&region_id=4&owner_type=private';
const LIMIT = 50;
const MAX_PAGES = 40;       // ~2000 anunțuri — acoperă tot județul cu margine
const PAGE_DELAY_MS = 120;  // pauză mică între pagini (politețe / evită rate-limit)

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
interface OlxResp { data?: OlxOffer[]; metadata?: { total_elements?: number } }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mapOffer(a: OlxOffer): RawProspect {
  const priceParam = (a.params || []).find((p) => p.key === 'price');
  const pv = priceParam?.value;
  return {
    source: 'olx',
    external_id: String(a.id),
    url: a.url!,
    title: a.title || '',
    price: typeof pv?.value === 'number' ? pv.value : undefined,
    currency: pv?.currency || 'EUR',
    category: guessCategory(a.title),
    transaction: guessTransaction(a.title),
    city: a.location?.city?.name || 'Brașov',
    zone: a.location?.district?.name || undefined,
    phone: undefined, // OLX nu expune numărul în API — agentul dă clic pe link
    seller_name: a.contact?.name || a.user?.name || undefined,
    posted_at: a.created_time || undefined,
  };
}

export const olxAdapter: SourceAdapter = {
  key: 'olx',
  label: 'OLX',
  async fetchBrasov(): Promise<RawProspect[]> {
    const out: RawProspect[] = [];
    const seen = new Set<string>();

    for (let page = 0; page < MAX_PAGES; page++) {
      const offset = page * LIMIT;
      const url = `${API}?offset=${offset}&limit=${LIMIT}&${BASE}`;

      let resp: OlxResp;
      try {
        resp = await fetchJson<OlxResp>(url);
      } catch (e) {
        if (page === 0) throw new Error('OLX: API inaccesibil (posibil blocat) — ' + (e instanceof Error ? e.message : ''));
        break; // pagini ulterioare eșuate: păstrăm ce am adunat
      }

      const data = resp.data || [];
      if (!data.length) break;

      for (const a of data) {
        if (a?.business === true) continue;        // doar particulari
        if (!a?.url) continue;
        const id = String(a.id);
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(mapOffer(a));
      }

      const total = resp.metadata?.total_elements ?? 0;
      if (total && offset + LIMIT >= total) break;  // am ajuns la capăt
      await sleep(PAGE_DELAY_MS);
    }

    return out;
  },
};
