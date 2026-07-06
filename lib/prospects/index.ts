import { olxAdapter } from './sources/olx';
import { publi24Adapter } from './sources/publi24';
import type { SourceAdapter } from './types';

// Surse active pentru „Anunțuri particulari" (Brașov, persoane fizice).
// - OLX: JSON structurat + filtru real de particular (owner_type=private).
// - Publi24: filtru real de persoane fizice (commercial=false), parsare HTML.
// Neincluse (necviabile): Romimo = aceleași anunțuri ca Publi24 (dubluri);
// Homezz = Cloudflare + randare JS (fetch server-side prinde pagina goală);
// Facebook = login + anti-bot (imposibil).
export const SOURCES: SourceAdapter[] = [olxAdapter, publi24Adapter];

export function getSources(keys?: string[]): SourceAdapter[] {
  if (!keys?.length) return SOURCES;
  return SOURCES.filter((s) => keys.includes(s.key));
}
