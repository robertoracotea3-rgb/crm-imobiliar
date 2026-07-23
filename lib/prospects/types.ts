/** Datele brute acceptate de modulul „Anunțuri particulari”. */
export interface RawProspect {
  source: string;
  external_id: string;
  url: string;
  title?: string;
  price?: number;
  currency?: string;
  category?: string;
  transaction?: string;
  county?: string;
  city?: string;
  zone?: string;
  phone?: string;
  seller_name?: string;
  posted_at?: string;
  surface_area?: number;
}

export interface SourceFetchResult {
  items: RawProspect[];
  /** False when at least one page failed. Missing rows are never retired after a partial run. */
  complete: boolean;
  warnings: string[];
}

export interface SourceAdapter {
  key: string;
  label: string;
  termsUrl: string;
  fetchBrasov(): Promise<SourceFetchResult>;
}

export function guessCategory(title = ''): string {
  const t = title.toLocaleLowerCase('ro-RO');
  if (/apartament|garsonier|gars\b|\bcamere\b/.test(t)) return 'apartament';
  if (/cas[ăa]|vil[ăa]|duplex|conac/.test(t)) return 'casa';
  if (/teren|lot\b|parcel/.test(t)) return 'teren';
  if (/spa[țt]iu|comercial|hal[ăa]|birou|depozit/.test(t)) return 'comercial';
  return '';
}

export function guessTransaction(title = ''): string {
  const t = title.toLocaleLowerCase('ro-RO');
  return /[îi]nchiri|chirie|de[- ]?[îi]nchiriat|rent/.test(t) ? 'inchiriere' : 'vanzare';
}

export function normalizePhone(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  let digits = raw.replace(/[^\d+]/g, '');
  digits = digits.replace(/^\+?40/, '0');
  const match = digits.match(/0\d{9}/);
  return match?.[0];
}
