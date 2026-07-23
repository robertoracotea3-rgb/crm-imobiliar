export const NOTIFICATION_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export function normalizeNotificationActionUrl(value?: string | null): string | null {
  const candidate = value?.trim();
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) return null;
  return candidate.slice(0, 500);
}

export function notificationDedupKey(type: string, entityId: string): string {
  return `${type.trim().slice(0, 80)}:${entityId.trim().slice(0, 200)}`;
}
