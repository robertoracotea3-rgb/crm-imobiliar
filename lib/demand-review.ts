export const DEMAND_REVIEW_STATUS = 'de_verificat_inchidere';
export const DEMAND_CLOSED_STATUS = 'inchisa';

export const DEMAND_CLOSE_REASONS = [
  { code: 'nu_mai_este_interesat', label: 'Nu mai este interesat' },
  { code: 'cumparat_prin_alta_parte', label: 'A cumpărat prin altă parte' },
  { code: 'buget_insuficient', label: 'Buget insuficient' },
  { code: 'nu_mai_raspunde', label: 'Nu mai răspunde' },
  { code: 'cerere_duplicata', label: 'Cerere duplicată' },
  { code: 'criterii_imposibile', label: 'Criterii imposibile' },
  { code: 'amanare', label: 'Amânare' },
  { code: 'alt_motiv', label: 'Alt motiv' },
] as const;

export type DemandCloseReason = typeof DEMAND_CLOSE_REASONS[number]['code'];
export type DemandReviewAction = 'close' | 'extend' | 'activity' | 'reopen';

export function isDemandCloseReason(value: unknown): value is DemandCloseReason {
  return DEMAND_CLOSE_REASONS.some((reason) => reason.code === value);
}

export function demandStatusMeta(status?: string | null) {
  switch (status) {
    case DEMAND_REVIEW_STATUS:
      return { label: 'De verificat pentru închidere', color: 'bg-amber-100 text-amber-900' };
    case DEMAND_CLOSED_STATUS:
    case 'closed':
      return { label: 'Închisă', color: 'bg-gray-200 text-gray-800' };
    case 'indeplinita':
      return { label: 'Îndeplinită', color: 'bg-emerald-100 text-emerald-800' };
    case 'anulata':
      return { label: 'Anulată', color: 'bg-red-100 text-red-800' };
    case 'inactiva':
      return { label: 'Inactivă', color: 'bg-gray-100 text-gray-700' };
    default:
      return { label: 'Activă', color: 'bg-blue-50 text-blue-700' };
  }
}
