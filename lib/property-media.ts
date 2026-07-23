export const PROPERTY_PHOTO_BUCKET = 'property-photos';
export const PROPERTY_PHOTO_MAX_FILES = 60;
export const PROPERTY_PHOTO_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const PROPERTY_PHOTO_MAX_PIXELS = 40_000_000;
export const PROPERTY_PHOTO_ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export interface PropertyMediaInput {
  url: string;
  storage_path: string;
  alt_text: string;
  description: string | null;
  hash: string | null;
  mime_type: string | null;
  file_size: number | null;
  width?: number | null;
  height?: number | null;
  variants: Record<string, string>;
}

const cleanText = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

export function propertyPhotoStoragePath(url: string): string | null {
  try {
    const parsed = new URL(url);
    const marker = `/storage/v1/object/public/${PROPERTY_PHOTO_BUCKET}/`;
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex < 0) return null;
    const path = decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length)).replace(/^\/+/, '');
    if (!path || path.includes('..') || path.includes('\\')) return null;
    return path;
  } catch {
    return null;
  }
}

export function propertyPhotoBelongsTo(
  path: string,
  agencyId: string,
  propertyId: string,
): boolean {
  const prefix = `${agencyId}/${propertyId}/`;
  return path.startsWith(prefix) && path.length > prefix.length;
}

export function normalizeExistingPropertyMedia(
  value: unknown,
  agencyId: string,
  propertyId: string,
  propertyTitle: string,
): PropertyMediaInput[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: PropertyMediaInput[] = [];

  for (const [index, raw] of value.entries()) {
    const item = typeof raw === 'string'
      ? { url: raw }
      : raw && typeof raw === 'object'
        ? raw as Record<string, unknown>
        : null;
    if (!item) continue;
    const url = cleanText(item.url, 2_000);
    const storagePath = propertyPhotoStoragePath(url);
    if (!storagePath || !propertyPhotoBelongsTo(storagePath, agencyId, propertyId) || seen.has(storagePath)) {
      continue;
    }
    seen.add(storagePath);
    const suppliedAlt = cleanText(item.alt_text ?? item.altText, 160);
    result.push({
      url,
      storage_path: storagePath,
      alt_text: suppliedAlt || `${propertyTitle} — fotografia ${index + 1}`,
      description: cleanText(item.description, 500) || null,
      hash: cleanText(item.hash, 128) || null,
      mime_type: cleanText(item.mime_type ?? item.mimeType, 100) || null,
      file_size: Number.isSafeInteger(Number(item.file_size ?? item.fileSize))
        && Number(item.file_size ?? item.fileSize) >= 0
        ? Number(item.file_size ?? item.fileSize)
        : null,
      width: Number.isSafeInteger(Number(item.width)) && Number(item.width) > 0 ? Number(item.width) : null,
      height: Number.isSafeInteger(Number(item.height)) && Number(item.height) > 0 ? Number(item.height) : null,
      variants: item.variants && typeof item.variants === 'object' && !Array.isArray(item.variants)
        ? Object.fromEntries(Object.entries(item.variants as Record<string, unknown>)
          .filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
        : {},
    });
  }
  return result;
}

export function mediaFolderForCleanup(storagePath: string): string {
  const segments = storagePath.split('/');
  return segments.length >= 4 ? segments.slice(0, -1).join('/') : storagePath;
}

export function nextPropertyMediaCleanupAttempt(attempts: number, now = Date.now()): string {
  const minutes = Math.min(12 * 60, 5 * 2 ** Math.max(0, attempts - 1));
  return new Date(now + minutes * 60_000).toISOString();
}
