// Upload poze din client: redimensionează în browser, trimite în LOTURI mici
// (fiecare request rămâne sub timeout-ul Vercel), verifică fiecare răspuns.
import { resizeAll } from './resize-image';
import {
  PROPERTY_PHOTO_ALLOWED_MIME,
  PROPERTY_PHOTO_MAX_FILES,
  PROPERTY_PHOTO_MAX_UPLOAD_BYTES,
} from './property-media';

const BATCH_SIZE = 4; // poze per request → fiecare upload se termină rapid

export interface UploadResult {
  ok: boolean;
  uploaded: number;
  total: number;
  error?: string;
}

export interface ExistingPhotoInput {
  url: string;
  alt_text?: string;
  description?: string | null;
}

export async function uploadPropertyPhotos(opts: {
  propertyId: string;
  /** @deprecated Agenția este determinată exclusiv pe server din sesiune. */
  agencyId: string;
  photos: File[];
  token: string;
  replacePhotos?: boolean;
  existingPhotos?: string[];
  existingMedia?: ExistingPhotoInput[];
  enhance?: boolean;
  onProgress?: (done: number, total: number) => void;
}): Promise<UploadResult> {
  const { propertyId, photos, token, replacePhotos, existingPhotos, existingMedia, enhance, onProgress } = opts;
  const retainedMedia = existingMedia ?? (existingPhotos || []).map((url) => ({ url }));
  if (retainedMedia.length + photos.length > PROPERTY_PHOTO_MAX_FILES) {
    return {
      ok: false,
      uploaded: 0,
      total: photos.length,
      error: `Galeria poate conține maximum ${PROPERTY_PHOTO_MAX_FILES} fotografii.`,
    };
  }
  for (const file of photos) {
    if (!PROPERTY_PHOTO_ALLOWED_MIME.has(file.type) || file.size <= 0 || file.size > PROPERTY_PHOTO_MAX_UPLOAD_BYTES) {
      return {
        ok: false,
        uploaded: 0,
        total: photos.length,
        error: `Fișier invalid: ${file.name}. Sunt acceptate JPEG, PNG, WebP și HEIC, maximum 10 MB.`,
      };
    }
  }

  // Caz „reordonare/ștergere fără poze noi": trimitem un singur request care
  // persistă ordinea/ștergerile existentelor (replacePhotos + existingPhotos).
  if (!photos.length) {
    if (replacePhotos) {
      const form = new FormData();
      form.append('propertyId', propertyId);
      form.append('replacePhotos', 'true');
      form.append('existingMedia', JSON.stringify(retainedMedia));
      try {
        const res = await fetch('/api/properties/upload-photos', {
          method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          return { ok: false, uploaded: 0, total: 0, error: d.error || `HTTP ${res.status}` };
        }
      } catch (e) {
        return { ok: false, uploaded: 0, total: 0, error: e instanceof Error ? e.message : 'eroare rețea' };
      }
    }
    return { ok: true, uploaded: 0, total: 0 };
  }

  // 1) Redimensionare în browser (5MB → ~300KB)
  const resized = await resizeAll(photos);

  // 2) Upload în loturi
  let uploaded = 0;
  for (let i = 0; i < resized.length; i += BATCH_SIZE) {
    const batch = resized.slice(i, i + BATCH_SIZE);
    const form = new FormData();
    form.append('propertyId', propertyId);
    if (enhance) form.append('enhance', 'true');
    // replacePhotos doar pe primul lot; loturile următoare se adaugă
    if (replacePhotos && i === 0) {
      form.append('replacePhotos', 'true');
      form.append('existingMedia', JSON.stringify(retainedMedia));
    }
    batch.forEach(f => form.append('photos', f));

    let res: Response;
    try {
      res = await fetch('/api/properties/upload-photos', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
    } catch (e) {
      return { ok: false, uploaded, total: resized.length, error: e instanceof Error ? e.message : 'eroare rețea' };
    }
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return { ok: false, uploaded, total: resized.length, error: d.error || `Upload eșuat (HTTP ${res.status})` };
    }
    uploaded += batch.length;
    onProgress?.(uploaded, resized.length);
  }

  return { ok: true, uploaded, total: resized.length };
}
