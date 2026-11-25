import 'server-only';
import { crmConfig, crmHeaders, toPublic, type CrmSiteRow, type PublicProperty } from '@/lib/public-properties';

/*
 * Offers sent to a client on WhatsApp from the CRM: kiraimobiliare.ro/oferta/<token>. The CRM makes the token
 * (crm_oferta_noua in online/crm-online.sql, version 11); the page reads with it only those properties, without the pin,
 * and tells the database when a person opened it. Reading does not count: WhatsApp itself reads the link for its preview.
 */

export const OFFER_TOKEN = /^[0-9a-f]{24}$/;

export type Offer = { properties: PublicProperty[]; total: number; until: number | null };

async function rpc(fn: string, args: Record<string, unknown>): Promise<Response | null> {
  const cfg = crmConfig();
  if (!cfg) return null;
  try {
    return await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { ...crmHeaders(cfg.key), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(args),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return null;
  }
}

/** The offer; null when the link is wrong, stopped or expired; undefined when the database cannot be asked now. */
export async function getOffer(token: string): Promise<Offer | null | undefined> {
  if (!OFFER_TOKEN.test(token)) return null;
  const res = await rpc('crm_oferta_vezi', { p_token: token });
  if (!res || !res.ok) return undefined;
  const o: unknown = await res.json().catch(() => undefined);
  if (o === null) return null;
  if (!o || typeof o !== 'object') return undefined;
  const { proprietati, total, expira } = o as { proprietati?: unknown; total?: unknown; expira?: unknown };
  const rows = Array.isArray(proprietati)
    ? proprietati.filter((r): r is CrmSiteRow => !!r && typeof r === 'object' && typeof (r as CrmSiteRow).id === 'string')
    : [];
  return { properties: rows.map(toPublic), total: typeof total === 'number' ? total : rows.length, until: typeof expira === 'number' ? expira : null };
}

/** The client opened the offer, or (prop) looked at one of its properties. */
export async function countOffer(token: string, prop: string | null): Promise<boolean> {
  const res = await rpc('crm_oferta_deschisa', { p_token: token, p_prop: prop });
  return !!res && res.ok;
}
