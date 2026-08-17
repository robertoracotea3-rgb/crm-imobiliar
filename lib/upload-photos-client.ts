// Upload poze din client: redimensionează în browser, trimite în LOTURI mici
// (fiecare request rămâne sub timeout-ul Vercel), verifică fiecare răspuns.
import { resizeAll } from './resize-image';
import {
  PROPERTY_PHOTO_ALLOWED_MIME,
  PROPERTY_PHOTO_MAX_FILES,
  PROPERTY_PHOTO_MAX_UPLOAD_BYTES,
} from './property-media';

const BATCH_SIZE = 4; // plafon de poze per request → fiecare upload se termină rapid

// Vercel respinge orice request cu corpul peste 4,5 MB (FUNCTION_PAYLOAD_TOO_LARGE),
// înainte ca ruta să fie măcar apelată. Gruparea trebuie deci făcută pe octeți, nu
// doar pe număr de fișiere: patru poze de iPhone neredimensionate depășesc limita.
// Marja acoperă delimitatorii multipart și câmpul existingMedia din primul lot.
const MAX_REQUEST_BYTES = 3_900_000;

/**
 * Împarte fișierele în loturi care încap într-un singur request: cel mult
 * BATCH_SIZE fișiere și cel mult MAX_REQUEST_BYTES în total. Un fișier care
 * singur depășește bugetul primește lotul lui — serverul îl va refuza explicit,
 * ceea ce e de preferat unui 413 fără mesaj.
 */
function batchBySize(files: File[]): File[][] {
  const batches: File[][] = [];
  let current: File[] = [];
  let bytes = 0;
  for (const file of files) {
    if (current.length && (current.length >= BATCH_SIZE || bytes + file.size > MAX_REQUEST_BYTES)) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(file);
    bytes += file.size;
  }
  if (current.length) batches.push(current);
  return batches;
}

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

  // Un fișier care nici după redimensionare nu încape într-un request nu poate
  // ajunge la server. Îl semnalăm pe nume, în loc să lăsăm platforma să răspundă
  // cu un 413 fără explicație.
  const tooLarge = resized.find(file => file.size > MAX_REQUEST_BYTES);
  if (tooLarge) {
    return {
      ok: false,
      uploaded: 0,
      total: resized.length,
      error: `„${tooLarge.name}” este prea mare pentru a fi încărcată (${Math.round(tooLarge.size / 100_000) / 10} MB). `
        + 'Redimensioneaz-o sub 3,9 MB sau exportă din telefon în format JPEG.',
    };
  }

  // 2) Upload în loturi limitate atât ca număr, cât și ca octeți
  const batches = batchBySize(resized);
  let uploaded = 0;
  for (const [batchIndex, batch] of batches.entries()) {
    const form = new FormData();
    form.append('propertyId', propertyId);
    if (enhance) form.append('enhance', 'true');
    // replacePhotos doar pe primul lot; loturile următoare se adaugă
    if (replacePhotos && batchIndex === 0) {
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
      // Un 413 vine de la platformă, nu de la rută, deci corpul nu este JSON.
      if (res.status === 413) {
        return {
          ok: false,
          uploaded,
          total: resized.length,
          error: 'Pozele trimise depășesc limita de mărime a serverului. '
            + 'Încearcă mai puține deodată sau redimensionează-le înainte.',
        };
      }
      const d = await res.json().catch(() => ({}));
      return { ok: false, uploaded, total: resized.length, error: d.error || `Upload eșuat (HTTP ${res.status})` };
    }
    uploaded += batch.length;
    onProgress?.(uploaded, resized.length);
  }

  return { ok: true, uploaded, total: resized.length };
}
