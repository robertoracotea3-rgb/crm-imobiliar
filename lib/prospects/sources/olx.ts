// Adaptor OLX — cea mai bogată sursă. OLX înglobează în pagină un state JSON
// (__PRERENDERED_STATE__) cu anunțurile structurate; îl parsăm (robust) în loc de
// scraping HTML fragil. `isBusiness === false` = persoană fizică (particular).
import { fetchHtml } from '../http';
import { guessCategory, guessTransaction, type RawProspect, type SourceAdapter } from '../types';

// Imobiliare, județul Brașov, doar particulari.
const SEARCH_URL = 'https://www.olx.ro/imobiliare/brasov/?search%5Bprivate_business%5D=private';

interface OlxAd {
  id: number;
  title?: string;
  isBusiness?: boolean;
  url?: string;
  createdTime?: string;
  price?: { regularPrice?: { value?: number; currencyCode?: string } };
  location?: { cityName?: string; districtName?: string | null };
  contact?: { name?: string };
  user?: { name?: string };
}

export const olxAdapter: SourceAdapter = {
  key: 'olx',
  label: 'OLX',
  async fetchBrasov(): Promise<RawProspect[]> {
    const html = await fetchHtml(SEARCH_URL);
    const m = html.match(/window\.__PRERENDERED_STATE__\s*=\s*"([\s\S]*?)";/);
    if (!m) throw new Error('OLX: nu am găsit datele în pagină (posibil blocat / captcha)');

    let state: unknown;
    try {
      state = JSON.parse(JSON.parse('"' + m[1] + '"'));
    } catch {
      throw new Error('OLX: nu am putut interpreta datele paginii');
    }

    const ads = (state as { listing?: { listing?: { ads?: OlxAd[] } } })?.listing?.listing?.ads || [];
    return ads
      .filter((a) => a && a.isBusiness === false && a.url) // doar particulari
      .map((a): RawProspect => ({
        source: 'olx',
        external_id: String(a.id),
        url: a.url!,
        title: a.title || '',
        price: typeof a.price?.regularPrice?.value === 'number' ? a.price.regularPrice.value : undefined,
        currency: a.price?.regularPrice?.currencyCode || 'EUR',
        category: guessCategory(a.title),
        transaction: guessTransaction(a.title),
        city: a.location?.cityName || 'Brașov',
        zone: a.location?.districtName || undefined,
        phone: undefined, // OLX nu expune numărul în lista de căutare — agentul dă clic pe link
        seller_name: a.contact?.name || a.user?.name || undefined,
        posted_at: a.createdTime || undefined,
      }));
  },
};
