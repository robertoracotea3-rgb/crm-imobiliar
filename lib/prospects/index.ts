import { olxAdapter } from './sources/olx';
import type { SourceAdapter } from './types';

// Surse active pentru „Anunțuri particulari" (Brașov, persoane fizice).
// OLX = solidă (JSON structurat + filtru real de particular).
// Publi24/Homezz/Romimo: de adăugat aici după validare — vezi note:
//  - Romimo servește aceleași anunțuri ca Publi24 (dubluri).
//  - Publi24 în listă e majoritar agenții; necesită filtru fiabil de persoane fizice.
//  - Homezz e pe Cloudflare + randare JS (fetch server-side prinde pagina goală).
export const SOURCES: SourceAdapter[] = [olxAdapter];

export function getSources(keys?: string[]): SourceAdapter[] {
  if (!keys?.length) return SOURCES;
  return SOURCES.filter((s) => keys.includes(s.key));
}
