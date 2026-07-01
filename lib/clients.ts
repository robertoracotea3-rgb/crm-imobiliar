// Sursă unică pentru modulul Clienți: statusuri (etichete), taburi și utilitare.

export type ClientStatus =
  | 'new' | 'contacted' | 'viewing' | 'negotiation' | 'precontract'
  | 'won' | 'lost' | 'no_answer' | 'to_send_offers' | 'upcoming_viewing'
  | 'in_progress' | 'withdrawn';

// Etichetă + clase Tailwind pentru badge-ul colorat.
export const STATUS_META: Record<string, { label: string; color: string }> = {
  new:              { label: 'Lead Nou',          color: 'bg-green-100 text-green-700' },
  contacted:        { label: 'Contactat',          color: 'bg-blue-100 text-blue-700' },
  viewing:          { label: 'Vizionare',          color: 'bg-purple-100 text-purple-700' },
  negotiation:      { label: 'Negociere',          color: 'bg-orange-100 text-orange-700' },
  precontract:      { label: 'Antecontract',       color: 'bg-yellow-100 text-yellow-800' },
  won:              { label: 'Vândut',             color: 'bg-emerald-200 text-emerald-900' },
  lost:             { label: 'Pierdut',            color: 'bg-red-100 text-red-700' },
  no_answer:        { label: 'Nu a răspuns',       color: 'bg-gray-100 text-gray-600' },
  to_send_offers:   { label: 'De trimis oferte',   color: 'bg-amber-100 text-amber-800' },
  upcoming_viewing: { label: 'Urmează vizionare',  color: 'bg-violet-100 text-violet-700' },
  in_progress:      { label: 'În lucru',           color: 'bg-sky-100 text-sky-700' },
  withdrawn:        { label: 'Retras',             color: 'bg-gray-300 text-gray-700' },
};

// Ordinea în dropdown-uri (din momentul intrării spre finalizare).
export const STATUS_ORDER: ClientStatus[] = [
  'new', 'contacted', 'no_answer', 'to_send_offers', 'upcoming_viewing',
  'viewing', 'negotiation', 'precontract', 'won', 'lost', 'in_progress', 'withdrawn',
];

export function statusLabel(s?: string) { return (s && STATUS_META[s]?.label) || s || '—'; }
export function statusColor(s?: string) { return (s && STATUS_META[s]?.color) || 'bg-gray-100 text-gray-600'; }

// Taburi: maparea automată după status. Cele 4 taburi acoperă toate cele 12
// statusuri, fără suprapunere — fiecare client se regăsește într-un singur tab.
export const CLIENT_TABS: { key: string; label: string; statuses: string[] | null }[] = [
  { key: 'noi',     label: 'Clienți NOI',             statuses: ['new', 'no_answer', 'to_send_offers'] },
  { key: 'resunat', label: 'Clienți',                 statuses: ['contacted', 'upcoming_viewing', 'viewing', 'in_progress', 'negotiation'] },
  { key: 'toti',    label: 'Clienți Tranzacționați',  statuses: ['precontract', 'won'] },
  { key: 'retrasi', label: 'Clienți retrași',         statuses: ['lost', 'withdrawn'] },
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
