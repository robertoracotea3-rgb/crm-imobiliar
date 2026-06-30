// Upload poze din client: redimensionează în browser, trimite în LOTURI mici
// (fiecare request rămâne sub timeout-ul Vercel), verifică fiecare răspuns.
import { resizeAll } from './resize-image';

const BATCH_SIZE = 4; // poze per request → fiecare upload se termină rapid

export interface UploadResult {
  ok: boolean;
  uploaded: number;
  total: number;
  error?: string;
}

export async function uploadPropertyPhotos(opts: {
  propertyId: string;
  agencyId: string;
  photos: File[];
  token: string;
  replacePhotos?: boolean;
  existingPhotos?: string[];
  enhance?: boolean;
  onProgress?: (done: number, total: number) => void;
}): Promise<UploadResult> {
  const { propertyId, agencyId, photos, token, replacePhotos, existingPhotos, enhance, onProgress } = opts;

  // Caz „reordonare/ștergere fără poze noi": trimitem un singur request care
  // persistă ordinea/ștergerile existentelor (replacePhotos + existingPhotos).
  if (!photos.length) {
    if (replacePhotos) {
      const form = new FormData();
      form.append('propertyId', propertyId);
      form.append('agencyId', agencyId);
      form.append('replacePhotos', 'true');
      form.append('existingPhotos', JSON.stringify(existingPhotos ?? []));
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
    form.append('agencyId', agencyId);
    if (enhance) form.append('enhance', 'true');
    // replacePhotos doar pe primul lot; loturile următoare se adaugă
    if (replacePhotos && i === 0) {
      form.append('replacePhotos', 'true');
      if (existingPhotos) form.append('existingPhotos', JSON.stringify(existingPhotos));
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
