// Modul „Anunțuri particulari" — tipuri comune pentru adaptoarele de surse.

/** Un anunț normalizat, așa cum îl întoarce fiecare adaptor de sursă. */
export interface RawProspect {
  source: string;         // 'olx' | 'publi24' | 'homezz' | 'romimo'
  external_id: string;    // id-ul anunțului la sursă (pentru dedup)
  url: string;            // link direct către anunț
  title?: string;
  price?: number;
  currency?: string;      // 'EUR' | 'RON'
  category?: string;      // apartament | casa | teren | comercial (best-effort)
  transaction?: string;   // vanzare | inchiriere (best-effort)
  city?: string;
  zone?: string;
  phone?: string;         // best-effort
  seller_name?: string;
  posted_at?: string;     // ISO (best-effort)
}

/** Contract pentru fiecare sursă (OLX, Publi24, ...). */
export interface SourceAdapter {
  key: string;            // 'olx'
  label: string;          // 'OLX'
  /** Aduce anunțurile de la PARTICULARI din județul Brașov (o pagină). */
  fetchBrasov(): Promise<RawProspect[]>;
}

/** Ghicire best-effort a categoriei din titlu (portalurile HTML nu o dau curat). */
export function guessCategory(title = ''): string {
  const t = title.toLowerCase();
  if (/apartament|garsonier|gars\b|\bcamere\b/.test(t)) return 'apartament';
  if (/cas[aă]|vil[aă]|duplex|conac/.test(t)) return 'casa';
  if (/teren|lot\b|parcel/.test(t)) return 'teren';
  if (/spa[țt]iu|comercial|hal[aă]|birou|depozit/.test(t)) return 'comercial';
  return '';
}

/** Ghicire best-effort a tranzacției din titlu. */
export function guessTransaction(title = ''): string {
  const t = title.toLowerCase();
  if (/[iî]nchiri|chirie|de[- ]?[iî]nchiriat|rent/.test(t)) return 'inchiriere';
  return 'vanzare';
}

/** Normalizează un telefon românesc la forma 07XXXXXXXX (sau null dacă nu e valid). */
export function normalizePhone(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  let d = raw.replace(/[^\d+]/g, '');
  d = d.replace(/^\+?40/, '0');       // +40… / 40… → 0…
  const m = d.match(/0\d{9}/);        // 10 cifre, începe cu 0
  return m ? m[0] : undefined;
}
