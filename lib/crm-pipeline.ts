export type LeadPipelineStage = {
  code: string;
  label: string;
  order: number;
  category: 'intake' | 'qualification' | 'viewing' | 'closing' | 'closed';
  color: string;
  entryCondition: string;
  mandatoryActions: readonly string[];
  requiredFields: readonly string[];
  automation: string;
  requiresNextAction: boolean;
  terminal?: boolean;
};

export const LEAD_PIPELINE_STAGES = [
  {
    code: 'lead_nou',
    label: 'Lead nou',
    order: 10,
    category: 'intake',
    color: 'bg-emerald-100 text-emerald-800',
    entryCondition: 'Leadul a fost creat și păstrează sursa solicitării.',
    mandatoryActions: ['Verifică datele de contact', 'Atribuie agentul responsabil'],
    requiredFields: ['contact_name', 'source'],
    automation: 'Notifică agentul responsabil.',
    requiresNextAction: true,
  },
  {
    code: 'de_contactat',
    label: 'De contactat',
    order: 20,
    category: 'intake',
    color: 'bg-cyan-100 text-cyan-800',
    entryCondition: 'Leadul are agent responsabil și un termen real de contact.',
    mandatoryActions: ['Alege canalul', 'Planifică primul contact'],
    requiredFields: ['agent_id', 'next_action_at', 'next_action_type'],
    automation: 'Creează reminder dacă termenul expiră.',
    requiresNextAction: true,
  },
  {
    code: 'contactat',
    label: 'Contactat',
    order: 30,
    category: 'qualification',
    color: 'bg-blue-100 text-blue-800',
    entryCondition: 'Există o confirmare factuală de contact, nu doar deschiderea aplicației.',
    mandatoryActions: ['Notează rezultatul contactului'],
    requiredFields: ['first_response_at'],
    automation: 'Pornește termenul pentru calificare.',
    requiresNextAction: true,
  },
  {
    code: 'calificat',
    label: 'Calificat',
    order: 40,
    category: 'qualification',
    color: 'bg-sky-100 text-sky-800',
    entryCondition: 'Nevoia, zona, tipul tranzacției și bugetul sunt cunoscute.',
    mandatoryActions: ['Confirmă criteriile clientului'],
    requiredFields: ['contact_id', 'category', 'transaction', 'location', 'budget'],
    automation: 'Propune crearea cererii complete.',
    requiresNextAction: true,
  },
  {
    code: 'cerere_completata',
    label: 'Cerere completată',
    order: 50,
    category: 'qualification',
    color: 'bg-indigo-100 text-indigo-800',
    entryCondition: 'Există o cerere activă legată de profilul unic al clientului.',
    mandatoryActions: ['Verifică criteriile cererii'],
    requiredFields: ['demand'],
    automation: 'Rulează matchingul cu proprietăți.',
    requiresNextAction: true,
  },
  {
    code: 'proprietati_trimise',
    label: 'Proprietăți trimise',
    order: 60,
    category: 'qualification',
    color: 'bg-amber-100 text-amber-900',
    entryCondition: 'Cel puțin o proprietate este înregistrată ca trimisă clientului.',
    mandatoryActions: ['Înregistrează proprietatea și canalul folosit'],
    requiredFields: ['property_share'],
    automation: 'Programează follow-up pentru răspuns.',
    requiresNextAction: true,
  },
  {
    code: 'vizionare_programata',
    label: 'Vizionare programată',
    order: 70,
    category: 'viewing',
    color: 'bg-violet-100 text-violet-800',
    entryCondition: 'Există o vizionare reală, viitoare, în calendar.',
    mandatoryActions: ['Confirmă data, clientul și proprietatea'],
    requiredFields: ['calendar_event'],
    automation: 'Trimite reminder agentului.',
    requiresNextAction: true,
  },
  {
    code: 'vizionare_efectuata',
    label: 'Vizionare efectuată',
    order: 80,
    category: 'viewing',
    color: 'bg-purple-100 text-purple-800',
    entryCondition: 'Vizionarea este marcată efectuată și are rezultat.',
    mandatoryActions: ['Înregistrează feedbackul', 'Planifică follow-up-ul'],
    requiredFields: ['completed_viewing', 'viewing_outcome'],
    automation: 'Creează task de follow-up.',
    requiresNextAction: true,
  },
  {
    code: 'oferta',
    label: 'Ofertă',
    order: 90,
    category: 'closing',
    color: 'bg-sky-100 text-sky-900',
    entryCondition: 'Există o tranzacție legată aflată în etapa Ofertă.',
    mandatoryActions: ['Înregistrează suma și proprietatea'],
    requiredFields: ['transaction'],
    automation: 'Notifică agentul la schimbarea ofertei.',
    requiresNextAction: true,
  },
  {
    code: 'negociere',
    label: 'Negociere',
    order: 100,
    category: 'closing',
    color: 'bg-orange-100 text-orange-900',
    entryCondition: 'Există o tranzacție legată aflată în negociere.',
    mandatoryActions: ['Actualizează condițiile negociate'],
    requiredFields: ['transaction'],
    automation: 'Creează reminder pentru următorul răspuns.',
    requiresNextAction: true,
  },
  {
    code: 'rezervare',
    label: 'Rezervare',
    order: 110,
    category: 'closing',
    color: 'bg-blue-200 text-blue-950',
    entryCondition: 'Tranzacția rezervată are proprietate, client, sumă și dată.',
    mandatoryActions: ['Înregistrează data rezervării'],
    requiredFields: ['transaction.property_id', 'transaction.contact_id', 'transaction.sale_price', 'transaction.reservation_at'],
    automation: 'Blochează publicarea disponibilă și notifică echipa.',
    requiresNextAction: true,
  },
  {
    code: 'antecontract',
    label: 'Antecontract',
    order: 120,
    category: 'closing',
    color: 'bg-yellow-200 text-yellow-950',
    entryCondition: 'Tranzacția legată este în etapa Antecontract.',
    mandatoryActions: ['Verifică documentele și termenele'],
    requiredFields: ['transaction'],
    automation: 'Creează termenele contractuale.',
    requiresNextAction: true,
  },
  {
    code: 'credit',
    label: 'Credit',
    order: 130,
    category: 'closing',
    color: 'bg-indigo-200 text-indigo-950',
    entryCondition: 'Tranzacția legată este în etapa Finanțare.',
    mandatoryActions: ['Înregistrează stadiul finanțării'],
    requiredFields: ['transaction'],
    automation: 'Reamintește verificarea dosarului.',
    requiresNextAction: true,
  },
  {
    code: 'notar',
    label: 'Notar',
    order: 140,
    category: 'closing',
    color: 'bg-fuchsia-100 text-fuchsia-900',
    entryCondition: 'Tranzacția legată este în etapa Notar.',
    mandatoryActions: ['Confirmă programarea și documentele'],
    requiredFields: ['transaction'],
    automation: 'Trimite reminder pentru termenul notarial.',
    requiresNextAction: true,
  },
  {
    code: 'finalizat',
    label: 'Finalizat',
    order: 150,
    category: 'closed',
    color: 'bg-emerald-200 text-emerald-950',
    entryCondition: 'Există o tranzacție finalizată atomic.',
    mandatoryActions: ['Verifică retragerea din portaluri și înregistrarea financiară'],
    requiredFields: ['finalized_transaction'],
    automation: 'Închide acțiunile deschise și retrage listările.',
    requiresNextAction: false,
    terminal: true,
  },
  {
    code: 'pierdut',
    label: 'Pierdut',
    order: 160,
    category: 'closed',
    color: 'bg-red-100 text-red-800',
    entryCondition: 'Motivul și observația pierderii sunt completate.',
    mandatoryActions: ['Înregistrează motivul pierderii'],
    requiredFields: ['status_reason', 'status_note'],
    automation: 'Închide reminderele active.',
    requiresNextAction: false,
    terminal: true,
  },
] as const satisfies readonly LeadPipelineStage[];

export type LeadPipelineCode = typeof LEAD_PIPELINE_STAGES[number]['code'];

export const LEAD_PIPELINE_TRANSITIONS: Readonly<Record<LeadPipelineCode, readonly LeadPipelineCode[]>> = {
  lead_nou: ['de_contactat', 'contactat', 'pierdut'],
  de_contactat: ['contactat', 'pierdut'],
  contactat: ['calificat', 'pierdut'],
  calificat: ['cerere_completata', 'proprietati_trimise', 'vizionare_programata', 'pierdut'],
  cerere_completata: ['proprietati_trimise', 'vizionare_programata', 'pierdut'],
  proprietati_trimise: ['vizionare_programata', 'oferta', 'pierdut'],
  vizionare_programata: ['vizionare_efectuata', 'pierdut'],
  vizionare_efectuata: ['proprietati_trimise', 'oferta', 'negociere', 'pierdut'],
  oferta: ['negociere', 'rezervare', 'pierdut'],
  negociere: ['oferta', 'rezervare', 'pierdut'],
  rezervare: ['antecontract', 'credit', 'notar', 'pierdut'],
  antecontract: ['credit', 'notar', 'finalizat', 'pierdut'],
  credit: ['antecontract', 'notar', 'pierdut'],
  notar: ['finalizat', 'pierdut'],
  finalizat: [],
  pierdut: ['de_contactat'],
};

export const LEAD_PIPELINE_TAB_GROUPS: Readonly<Record<'noi' | 'resunat' | 'toti' | 'retrasi', readonly LeadPipelineCode[]>> = {
  noi: ['lead_nou', 'de_contactat'],
  resunat: [
    'contactat', 'calificat', 'cerere_completata', 'proprietati_trimise',
    'vizionare_programata', 'vizionare_efectuata', 'oferta', 'negociere',
    'rezervare', 'antecontract', 'credit', 'notar',
  ],
  toti: ['finalizat'],
  retrasi: ['pierdut'],
};

const LEGACY_TO_PIPELINE: Record<string, LeadPipelineCode> = {
  new: 'lead_nou',
  contacted: 'contactat',
  no_answer: 'de_contactat',
  to_send_offers: 'calificat',
  in_progress: 'calificat',
  upcoming_viewing: 'vizionare_programata',
  viewing: 'vizionare_efectuata',
  negotiation: 'negociere',
  precontract: 'antecontract',
  won: 'finalizat',
  lost: 'pierdut',
  withdrawn: 'pierdut',
};

export function isLeadPipelineCode(value: unknown): value is LeadPipelineCode {
  return LEAD_PIPELINE_STAGES.some((stage) => stage.code === value);
}

export function pipelineStage(value: unknown, legacyStatus?: string | null): LeadPipelineCode {
  if (isLeadPipelineCode(value)) return value;
  return LEGACY_TO_PIPELINE[String(legacyStatus || '')] || 'lead_nou';
}

export function pipelineMeta(value: unknown, legacyStatus?: string | null) {
  const code = pipelineStage(value, legacyStatus);
  return LEAD_PIPELINE_STAGES.find((stage) => stage.code === code)!;
}

export function canTransitionPipeline(from: LeadPipelineCode, to: LeadPipelineCode): boolean {
  return from === to || LEAD_PIPELINE_TRANSITIONS[from].includes(to);
}
