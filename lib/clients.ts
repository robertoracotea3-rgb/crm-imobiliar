// Sursă unică pentru modulul Clienți: statusuri (etichete), taburi și utilitare.

import { LEAD_STATUSES, LEAD_STATUS_TAB_GROUPS, type LeadStatus } from '@/lib/crm-catalogs';

export type ClientStatus = LeadStatus;

// Etichetă + clase Tailwind pentru badge-ul colorat.
export const STATUS_META: Record<string, { label: string; color: string }> = Object.fromEntries(
  LEAD_STATUSES.map((item) => [item.code, { label: item.label, color: item.color }]),
);

// Ordinea în dropdown-uri (din momentul intrării spre finalizare).
export const STATUS_ORDER: ClientStatus[] = LEAD_STATUSES
  .filter((item) => item.active)
  .map((item) => item.code);

export function statusLabel(s?: string) { return (s && STATUS_META[s]?.label) || s || '—'; }
export function statusColor(s?: string) { return (s && STATUS_META[s]?.color) || 'bg-gray-100 text-gray-600'; }

// Taburi: maparea automată după status. Cele 4 taburi acoperă toate cele 12
// statusuri, fără suprapunere — fiecare client se regăsește într-un singur tab.
export const CLIENT_TABS: { key: string; label: string; statuses: string[] | null }[] = [
  { key: 'noi',     label: 'Clienți NOI',             statuses: [...LEAD_STATUS_TAB_GROUPS.noi] },
  { key: 'resunat', label: 'Clienți',                 statuses: [...LEAD_STATUS_TAB_GROUPS.resunat] },
  { key: 'toti',    label: 'Clienți Tranzacționați',  statuses: [...LEAD_STATUS_TAB_GROUPS.toti] },
  { key: 'retrasi', label: 'Clienți retrași',         statuses: [...LEAD_STATUS_TAB_GROUPS.retrasi] },
];

// Inițiale pentru avatar (max 2 litere).
export function initials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Culoare de fundal stabilă pentru avatar, derivată din nume.
const AVATAR_COLORS = [
  'bg-emerald-100 text-emerald-700', 'bg-blue-100 text-blue-700', 'bg-purple-100 text-purple-700',
  'bg-amber-100 text-amber-700', 'bg-pink-100 text-pink-700', 'bg-cyan-100 text-cyan-700',
  'bg-indigo-100 text-indigo-700', 'bg-rose-100 text-rose-700',
];
export function avatarColor(name?: string): string {
  const s = name || '';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// Curăță mesajul unui client pentru afișare: scoate eticheta sursei ([Storia]/[OLX]),
// id-ul de conversație (conv:...) și liniile redundante adăugate automat
// (— Proprietate: …, — Sursă: …). Întoarce textul curat + sursa dedusă.
export function parseLeadMessage(raw?: string, fallbackSource?: string): { text: string; source: string | null } {
  let msg = raw || '';
  let source: string | null = fallbackSource || null;

  const tag = msg.match(/^\s*\[([^\]]+)\]\s*/);
  if (tag && /storia|olx|facebook|imobiliare/i.test(tag[1])) {
    source = source || tag[1].trim();
    msg = msg.slice(tag[0].length);
  }

  msg = msg.replace(/\bconv:[A-Za-z0-9-]+\s*/gi, '');

  const srcM = msg.match(/[—-]\s*Surs[ăa]:\s*([^\n]*)/i);
  if (srcM) source = source || srcM[1].trim();
  msg = msg.replace(/\n?\s*[—-]\s*Proprietate:\s*[^\n]*/gi, '');
  msg = msg.replace(/\n?\s*[—-]\s*Surs[ăa]:\s*[^\n]*/gi, '');

  return { text: msg.trim(), source };
}
