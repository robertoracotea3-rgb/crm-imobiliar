export const CONTACT_LIFECYCLE = [
  { code: 'client_nou', label: 'Client nou', color: 'bg-emerald-100 text-emerald-800' },
  { code: 'de_contactat', label: 'De contactat', color: 'bg-cyan-100 text-cyan-800' },
  { code: 'contactat', label: 'Contactat', color: 'bg-blue-100 text-blue-800' },
  { code: 'client_activ', label: 'Client activ', color: 'bg-violet-100 text-violet-800' },
  { code: 'in_asteptare', label: 'În așteptare', color: 'bg-amber-100 text-amber-800' },
  { code: 'client_vechi', label: 'Client vechi', color: 'bg-gray-200 text-gray-800' },
  { code: 'arhivat', label: 'Arhivat', color: 'bg-red-100 text-red-800' },
] as const;

export type ContactLifecycleStatus = typeof CONTACT_LIFECYCLE[number]['code'];

export function isContactLifecycleStatus(value: unknown): value is ContactLifecycleStatus {
  return CONTACT_LIFECYCLE.some((status) => status.code === value);
}

export function contactLifecycleMeta(value?: string | null) {
  return CONTACT_LIFECYCLE.find((status) => status.code === value)
    || CONTACT_LIFECYCLE[0];
}
