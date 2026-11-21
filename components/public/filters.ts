import { TYPE_OPTIONS } from './site';

// Search filters shared by the server pages (reading ?tranzactie=… from the address) and the client explorer.

export type Filters = { tranzactie: '' | 'vanzare' | 'inchiriere'; loc: string; tip: string; pret: string; sort: Sort };
export type Sort = 'recomandate' | 'pret-asc' | 'pret-desc' | 'suprafata';

export const EMPTY: Filters = { tranzactie: '', loc: '', tip: '', pret: '', sort: 'recomandate' };

export const PRICES: Record<'vanzare' | 'inchiriere', [string, string][]> = {
  vanzare: [['0-75000', 'Până la 75.000 €'], ['75000-150000', '75.000 – 150.000 €'], ['150000-300000', '150.000 – 300.000 €'], ['300000-', 'Peste 300.000 €']],
  inchiriere: [['0-400', 'Până la 400 € / lună'], ['400-800', '400 – 800 € / lună'], ['800-', 'Peste 800 € / lună']],
};

export const SORTS: [Sort, string][] = [['recomandate', 'Recomandate'], ['pret-asc', 'Preț crescător'], ['pret-desc', 'Preț descrescător'], ['suprafata', 'Suprafață']];

/** Parses ?tranzactie=&loc=&tip=&pret=&sort= from the page address. */
export function filtersFromParams(p: Record<string, string | string[] | undefined>): Partial<Filters> {
  const one = (k: string) => { const v = p[k]; return (Array.isArray(v) ? v[0] : v || '').slice(0, 80); };
  const t = one('tranzactie');
  const s = one('sort');
  const pret = one('pret');
  return {
    tranzactie: t === 'vanzare' || t === 'inchiriere' ? t : '',
    loc: one('loc'),
    tip: TYPE_OPTIONS.includes(one('tip')) ? one('tip') : '',
    pret: /^(vanzare|inchiriere):\d*-\d*$/.test(pret) ? pret : '',
    sort: SORTS.some(([k]) => k === s) ? (s as Sort) : 'recomandate',
  };
}
