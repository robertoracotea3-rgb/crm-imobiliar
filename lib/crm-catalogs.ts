export type CrmCatalogItem = {
  code: string;
  label: string;
  order: number;
  category: string;
  color: string;
  active: boolean;
  terminal?: boolean;
  requiresNextAction?: boolean;
};

export const LEAD_STATUSES = [
  { code: 'new', label: 'Lead nou', order: 10, category: 'open', color: 'bg-green-100 text-green-700', active: true, requiresNextAction: true },
  { code: 'contacted', label: 'Contactat', order: 20, category: 'open', color: 'bg-blue-100 text-blue-700', active: true, requiresNextAction: true },
  { code: 'no_answer', label: 'Nu a răspuns', order: 30, category: 'open', color: 'bg-gray-100 text-gray-600', active: true, requiresNextAction: true },
  { code: 'to_send_offers', label: 'De trimis oferte', order: 40, category: 'qualified', color: 'bg-amber-100 text-amber-800', active: true, requiresNextAction: true },
  { code: 'in_progress', label: 'Calificat / în lucru', order: 50, category: 'qualified', color: 'bg-sky-100 text-sky-700', active: true, requiresNextAction: true },
  { code: 'upcoming_viewing', label: 'Urmează vizionare', order: 60, category: 'viewing', color: 'bg-violet-100 text-violet-700', active: true, requiresNextAction: true },
  { code: 'viewing', label: 'Vizionare efectuată', order: 70, category: 'viewing', color: 'bg-purple-100 text-purple-700', active: true, requiresNextAction: true },
  { code: 'negotiation', label: 'Negociere', order: 80, category: 'closing', color: 'bg-orange-100 text-orange-700', active: true, requiresNextAction: true },
  { code: 'precontract', label: 'Rezervat / antecontract', order: 90, category: 'closing', color: 'bg-yellow-100 text-yellow-800', active: true, requiresNextAction: true },
  { code: 'won', label: 'Finalizat', order: 100, category: 'closed_won', color: 'bg-emerald-200 text-emerald-900', active: true, terminal: true, requiresNextAction: false },
  { code: 'lost', label: 'Pierdut', order: 110, category: 'closed_lost', color: 'bg-red-100 text-red-700', active: true, terminal: true, requiresNextAction: false },
  { code: 'withdrawn', label: 'Retras', order: 120, category: 'closed_lost', color: 'bg-gray-300 text-gray-700', active: true, terminal: true, requiresNextAction: false },
] as const satisfies readonly CrmCatalogItem[];

export const PROPERTY_STATUSES = [
  { code: 'draft', label: 'Draft', order: 10, category: 'preparation', color: 'bg-yellow-100 text-yellow-800', active: true },
  { code: 'activa', label: 'Activă', order: 20, category: 'active', color: 'bg-emerald-100 text-emerald-800', active: true },
  { code: 'rezervata', label: 'Rezervată', order: 30, category: 'closing', color: 'bg-blue-100 text-blue-800', active: true },
  { code: 'tranzactionata', label: 'Tranzacționată', order: 40, category: 'closed', color: 'bg-purple-100 text-purple-800', active: true, terminal: true },
  { code: 'inchiriata', label: 'Închiriată', order: 50, category: 'closed', color: 'bg-indigo-100 text-indigo-800', active: true, terminal: true },
  { code: 'retrasa', label: 'Retrasă', order: 60, category: 'inactive', color: 'bg-gray-100 text-gray-600', active: true, terminal: true },
  { code: 'expirata', label: 'Expirată', order: 70, category: 'inactive', color: 'bg-orange-100 text-orange-700', active: true },
  { code: 'arhivata', label: 'Arhivată', order: 80, category: 'archived', color: 'bg-red-100 text-red-700', active: true, terminal: true },
] as const satisfies readonly CrmCatalogItem[];

export const VIEWING_STATUSES = [
  { code: 'programata', label: 'Programată', order: 10, category: 'open', color: 'bg-blue-50 text-blue-700 border-blue-200', active: true },
  { code: 'confirmata', label: 'Confirmată', order: 20, category: 'open', color: 'bg-cyan-50 text-cyan-700 border-cyan-200', active: true },
  { code: 'amanata', label: 'Amânată', order: 30, category: 'open', color: 'bg-amber-50 text-amber-700 border-amber-200', active: true },
  { code: 'efectuata', label: 'Efectuată', order: 40, category: 'closed', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', active: true, terminal: true },
  { code: 'anulata', label: 'Anulată', order: 50, category: 'cancelled', color: 'bg-red-50 text-red-700 border-red-200', active: true, terminal: true },
] as const satisfies readonly CrmCatalogItem[];

export const TRANSACTION_STATUSES = [
  { code: 'draft', label: 'Draft', order: 10, category: 'open', color: 'bg-gray-100 text-gray-700', active: true },
  { code: 'oferta', label: 'Ofertă', order: 20, category: 'open', color: 'bg-sky-100 text-sky-700', active: true },
  { code: 'negociere', label: 'Negociere', order: 30, category: 'open', color: 'bg-orange-100 text-orange-700', active: true },
  { code: 'rezervata', label: 'Rezervată', order: 40, category: 'closing', color: 'bg-blue-100 text-blue-700', active: true },
  { code: 'antecontract', label: 'Antecontract', order: 50, category: 'closing', color: 'bg-yellow-100 text-yellow-800', active: true },
  { code: 'finantare', label: 'Finanțare', order: 60, category: 'closing', color: 'bg-indigo-100 text-indigo-700', active: true },
  { code: 'notar', label: 'Notar', order: 70, category: 'closing', color: 'bg-violet-100 text-violet-700', active: true },
  { code: 'finalizata', label: 'Finalizată', order: 80, category: 'closed', color: 'bg-emerald-100 text-emerald-800', active: true, terminal: true },
  { code: 'anulata', label: 'Anulată', order: 90, category: 'cancelled', color: 'bg-red-100 text-red-700', active: true, terminal: true },
] as const satisfies readonly CrmCatalogItem[];

export const LEAD_SOURCES = [
  { code: 'storia_olx', label: 'Storia.ro + OLX.ro', order: 10, category: 'portal', active: true },
  { code: 'storia', label: 'Storia.ro', order: 20, category: 'portal', active: true },
  { code: 'olx', label: 'OLX.ro', order: 30, category: 'portal', active: true },
  { code: 'website', label: 'Site propriu', order: 40, category: 'owned', active: true },
  { code: 'imobiliare', label: 'Imobiliare.ro', order: 50, category: 'portal', active: true },
  { code: 'facebook', label: 'Facebook', order: 60, category: 'social', active: true },
  { code: 'referral', label: 'Recomandare', order: 70, category: 'referral', active: true },
  { code: 'evaluation', label: 'Evaluare gratuită', order: 80, category: 'owned', active: true },
  { code: 'direct', label: 'Contact direct', order: 90, category: 'direct', active: true },
  { code: 'manual', label: 'Manual', order: 100, category: 'manual', active: true },
  { code: 'banner', label: 'Banner', order: 110, category: 'campaign', active: true },
  { code: 'other', label: 'Altă sursă', order: 999, category: 'other', active: true },
] as const;

export const ACTIVITY_TYPES = [
  { code: 'created', label: 'Creat', category: 'system' },
  { code: 'request', label: 'Solicitare', category: 'lead' },
  { code: 'status', label: 'Schimbare status', category: 'system' },
  { code: 'note', label: 'Notiță', category: 'manual' },
  { code: 'association', label: 'Asociere', category: 'system' },
  { code: 'whatsapp_opened', label: 'WhatsApp deschis', category: 'contact' },
  { code: 'whatsapp_confirmed_sent', label: 'WhatsApp confirmat trimis', category: 'contact' },
  { code: 'whatsapp_not_sent', label: 'WhatsApp netrimis', category: 'contact' },
  { code: 'whatsapp_unreachable', label: 'WhatsApp indisponibil', category: 'contact' },
  { code: 'contact_attempt', label: 'Încercare de contact documentată', category: 'contact' },
  { code: 'contact_success', label: 'Contact reușit documentat', category: 'contact' },
  { code: 'viewing_scheduled', label: 'Vizionare programată', category: 'viewing' },
  { code: 'viewing_confirm', label: 'Vizionare confirmată', category: 'viewing' },
  { code: 'viewing_reschedule', label: 'Vizionare reprogramată', category: 'viewing' },
  { code: 'viewing_cancel', label: 'Vizionare anulată', category: 'viewing' },
  { code: 'viewing_complete', label: 'Vizionare efectuată', category: 'viewing' },
] as const;

export type LeadStatus = typeof LEAD_STATUSES[number]['code'];
export type PropertyStatus = typeof PROPERTY_STATUSES[number]['code'];
export type ViewingStatus = typeof VIEWING_STATUSES[number]['code'];
export type TransactionStatus = typeof TRANSACTION_STATUSES[number]['code'];
export type LeadSource = typeof LEAD_SOURCES[number]['code'];

const transitionMap = <T extends string>(entries: Readonly<Record<T, readonly T[]>>) => entries;

export const LEAD_STATUS_TRANSITIONS = transitionMap<LeadStatus>({
  new: ['contacted', 'no_answer', 'in_progress', 'lost', 'withdrawn'],
  contacted: ['no_answer', 'to_send_offers', 'in_progress', 'upcoming_viewing', 'negotiation', 'lost', 'withdrawn'],
  no_answer: ['contacted', 'in_progress', 'lost', 'withdrawn'],
  to_send_offers: ['contacted', 'in_progress', 'upcoming_viewing', 'lost', 'withdrawn'],
  in_progress: ['contacted', 'no_answer', 'to_send_offers', 'upcoming_viewing', 'viewing', 'negotiation', 'precontract', 'won', 'lost', 'withdrawn'],
  upcoming_viewing: ['viewing', 'in_progress', 'contacted', 'lost', 'withdrawn'],
  viewing: ['upcoming_viewing', 'negotiation', 'in_progress', 'lost', 'withdrawn'],
  negotiation: ['precontract', 'in_progress', 'won', 'lost', 'withdrawn'],
  precontract: ['negotiation', 'won', 'lost', 'withdrawn'],
  won: ['in_progress'],
  lost: ['in_progress'],
  withdrawn: ['in_progress'],
});

export const LEAD_STATUS_TAB_GROUPS: Readonly<Record<'noi' | 'resunat' | 'toti' | 'retrasi', readonly LeadStatus[]>> = {
  noi: ['new', 'no_answer', 'to_send_offers'],
  resunat: ['contacted', 'upcoming_viewing', 'viewing', 'in_progress', 'negotiation'],
  toti: ['precontract', 'won'],
  retrasi: ['lost', 'withdrawn'],
};

export const PROPERTY_STATUS_TRANSITIONS = transitionMap<PropertyStatus>({
  draft: ['activa', 'arhivata'],
  activa: ['draft', 'rezervata', 'tranzactionata', 'inchiriata', 'retrasa', 'expirata', 'arhivata'],
  rezervata: ['activa', 'tranzactionata', 'inchiriata', 'retrasa', 'arhivata'],
  tranzactionata: ['activa', 'arhivata'],
  inchiriata: ['activa', 'arhivata'],
  retrasa: ['activa', 'arhivata'],
  expirata: ['activa', 'retrasa', 'arhivata'],
  arhivata: ['draft', 'activa'],
});

export const VIEWING_STATUS_TRANSITIONS = transitionMap<ViewingStatus>({
  programata: ['confirmata', 'amanata', 'efectuata', 'anulata'],
  confirmata: ['amanata', 'efectuata', 'anulata'],
  amanata: ['programata', 'confirmata', 'efectuata', 'anulata'],
  efectuata: [],
  anulata: ['programata'],
});

export const TRANSACTION_STATUS_TRANSITIONS = transitionMap<TransactionStatus>({
  draft: ['oferta', 'negociere', 'rezervata', 'antecontract', 'finantare', 'notar', 'finalizata', 'anulata'],
  oferta: ['draft', 'negociere', 'rezervata', 'anulata'],
  negociere: ['draft', 'oferta', 'rezervata', 'antecontract', 'finantare', 'notar', 'finalizata', 'anulata'],
  rezervata: ['negociere', 'antecontract', 'finantare', 'notar', 'finalizata', 'anulata'],
  antecontract: ['negociere', 'rezervata', 'finantare', 'notar', 'finalizata', 'anulata'],
  finantare: ['antecontract', 'notar', 'finalizata', 'anulata'],
  notar: ['antecontract', 'finantare', 'finalizata', 'anulata'],
  finalizata: [],
  anulata: ['draft'],
});

export function normalizeCatalogKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const SOURCE_ALIASES: Record<string, LeadSource> = {
  storia_ro_olx_ro: 'storia_olx',
  storia_olx: 'storia_olx',
  olx_storia: 'storia_olx',
  storia: 'storia',
  storia_ro: 'storia',
  olx: 'olx',
  olx_ro: 'olx',
  site: 'website',
  website: 'website',
  site_propriu: 'website',
  imobiliare: 'imobiliare',
  imobiliare_ro: 'imobiliare',
  facebook: 'facebook',
  prieteni_cunostinte: 'referral',
  recomandare: 'referral',
  referral: 'referral',
  evaluare_gratuita: 'evaluation',
  evaluation: 'evaluation',
  contact: 'direct',
  contact_direct: 'direct',
  direct: 'direct',
  manual: 'manual',
  lead: 'manual',
  banner: 'banner',
  other: 'other',
  alta_sursa: 'other',
};

export function normalizeLeadSource(value: unknown): LeadSource | null {
  const key = normalizeCatalogKey(value);
  if (!key) return null;
  if (key.includes('storia') && key.includes('olx')) return 'storia_olx';
  return SOURCE_ALIASES[key] || 'other';
}

export function isLeadStatus(value: unknown): value is LeadStatus {
  return LEAD_STATUSES.some((item) => item.code === value);
}

export function isPropertyStatus(value: unknown): value is PropertyStatus {
  return PROPERTY_STATUSES.some((item) => item.code === value);
}

export function isTransactionStatus(value: unknown): value is TransactionStatus {
  return TRANSACTION_STATUSES.some((item) => item.code === value);
}

export function canTransition<T extends string>(map: Readonly<Record<T, readonly T[]>>, from: T, to: T): boolean {
  return from === to || Boolean(map[from]?.includes(to));
}

export function getCatalogItem<T extends CrmCatalogItem>(catalog: readonly T[], code?: string | null): T | undefined {
  return catalog.find((item) => item.code === code);
}

export function leadSourceLabel(code?: string | null): string {
  return LEAD_SOURCES.find((item) => item.code === code)?.label || code || '—';
}
