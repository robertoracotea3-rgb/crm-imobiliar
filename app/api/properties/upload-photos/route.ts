export const dynamic = 'force-dynamic';
export const maxDuration = 60; // procesare sharp poate dura; pe Pro până la 60s

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import sharp from 'sharp';
import { applyWatermark } from '@/lib/watermark';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = 'property-photos';
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 30;
const MAX_DIMENSION = 2500; // px — auto-resize if larger

const SIZES = {
  thumb:  { width: 300,  quality: 78 },
  medium: { width: 800,  quality: 83 },
  large:  { width: 1600, quality: 87 },
} as const;

async function ensureBucket() {
  const { data } = await supabaseAdmin.storage.getBucket(BUCKET);
  if (!data) {
    await supabaseAdmin.storage.createBucket(BUCKET, { public: true, fileSizeLimit: MAX_FILE_SIZE });
  }
}

/** Compute short SHA-256 hash of file buffer for deduplication */
function fileHash(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex').slice(0, 20);
}

/** Procesează items cu concurență limitată, păstrând ordinea rezultatelor. */
async function mapLimit<T, R>(
  items: T[], limit: number, fn: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
}

/** Resize the source to a variant width, optionally stamp the watermark, then encode WebP. */
async function makeVariant(
  source: Buffer, width: number, quality: number, watermark?: Buffer
): Promise<Buffer> {
  let resized = await sharp(source)
    .resize(width, undefined, { fit: 'inside', withoutEnlargement: true })
    .toBuffer();
  if (watermark) {
    resized = await applyWatermark(resized, watermark);
  }
  return sharp(resized).webp({ quality, effort: 3 }).toBuffer();
}

/**
 * Auto-îmbunătățire „premium" pentru poze imobiliare (gratis, local, fără AI extern):
 * deschide pozele întunecate, adaugă contrast și claritate, scoate culorile în evidență.
 * Preset moderat — nu supra-procesează (riscul ar fi poze nenaturale).
 */
async function enhanceForRealEstate(buffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(buffer)
      .modulate({ brightness: 1.06, saturation: 1.10 }) // luminează blând + culori mai vii (nu întunecă umbrele, nu arde highlight-urile)
      .sharpen({ sigma: 0.7 })                           // claritate fină
      .toBuffer();
  } catch {
    return buffer; // dacă pică procesarea, păstrăm originalul
  }
}

/**
 * Process one image buffer into WebP variants using sharp.
 * When `watermark` (agency logo) is provided, it is stamped on the medium + large
 * variants. The thumbnail is left clean — it's too small for a legible logo.
 * When `enhance` is set, a real-estate auto-enhance preset is applied to the source first.
 */
async function generateVariants(
  buffer: Buffer, watermark?: Buffer, enhance?: boolean
): Promise<{ thumb: Buffer; medium: Buffer; large: Buffer }> {
  const meta = await sharp(buffer).metadata();

  // Auto-resize if either dimension exceeds 2500px
  const needsResize = (meta.width ?? 0) > MAX_DIMENSION || (meta.height ?? 0) > MAX_DIMENSION;
  let source = needsResize
    ? await sharp(buffer)
        .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
        .toBuffer()
    : buffer;

  if (enhance) source = await enhanceForRealEstate(source);

  const [thumb, medium, large] = await Promise.all([
    makeVariant(source, SIZES.thumb.width,  SIZES.thumb.quality),
    makeVariant(source, SIZES.medium.width, SIZES.medium.quality, watermark),
    makeVariant(source, SIZES.large.width,  SIZES.large.quality,  watermark),
  ]);

  return { thumb, medium, large };
}

/** Upload all 3 variants to Supabase Storage. Returns public medium URL. */
async function uploadVariants(
  agencyId: string,
  propertyId: string,
  hash: string,
  variants: { thumb: Buffer; medium: Buffer; large: Buffer }
): Promise<string> {
  const base = `${agencyId}/${propertyId}/${hash}`;
  const uploads = await Promise.all([
    supabaseAdmin.storage.from(BUCKET).upload(`${base}/thumb.webp`, variants.thumb, {
      contentType: 'image/webp', upsert: true, cacheControl: '31536000',
    }),
    supabaseAdmin.storage.from(BUCKET).upload(`${base}/medium.webp`, variants.medium, {
      contentType: 'image/webp', upsert: true, cacheControl: '31536000',
    }),
    supabaseAdmin.storage.from(BUCKET).upload(`${base}/large.webp`, variants.large, {
      contentType: 'image/webp', upsert: true, cacheControl: '31536000',
    }),
  ]);

  const failed = uploads.filter(u => u.error);
  if (failed.length > 0) throw new Error(`Upload eșuat: ${failed[0].error?.message}`);

  const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(`${base}/medium.webp`);
  return urlData.publicUrl;
}

/** Check if a photo hash already exists for this property (deduplication). */
async function photoExists(agencyId: string, propertyId: string, hash: string): Promise<string | null> {
  const { data } = await supabaseAdmin.storage
    .from(BUCKET)
    .list(`${agencyId}/${propertyId}/${hash}`);
  if (data && data.some(f => f.name === 'medium.webp')) {
    const { data: urlData } = supabaseAdmin.storage
      .from(BUCKET)
      .getPublicUrl(`${agencyId}/${propertyId}/${hash}/medium.webp`);
    return urlData.publicUrl;
  }
  return null;
}

/** Delete only the hash-folders that are NOT referenced by keepUrls (orphan cleanup on edit). */
async function deleteOrphanPhotos(agencyId: string, propertyId: string, keepUrls: string[]): Promise<void> {
  try {
    const prefix = `${agencyId}/${propertyId}`;
    const { data: folders } = await supabaseAdmin.storage.from(BUCKET).list(prefix, { limit: 500 });
    if (!folders?.length) return;

    const orphanPaths: string[] = [];
    for (const folder of folders) {
      if (folder.id) continue; // legacy flat file — leave untouched
      const stillUsed = keepUrls.some(u => u.includes(`/${folder.name}/`));
      if (stillUsed) continue;
      const { data: files } = await supabaseAdmin.storage.from(BUCKET).list(`${prefix}/${folder.name}`);
      if (files?.length) orphanPaths.push(...files.map(f => `${prefix}/${folder.name}/${f.name}`));
    }

    for (let i = 0; i < orphanPaths.length; i += 100) {
      await supabaseAdmin.storage.from(BUCKET).remove(orphanPaths.slice(i, i + 100));
    }
  } catch (e) {
    console.error('[deleteOrphanPhotos] Error:', e);
  }
}

/** Load the agency watermark logo IF the global toggle is on and a logo exists. */
async function loadWatermark(agencyId: string): Promise<Buffer | undefined> {
  try {
    const { data: agency } = await supabaseAdmin
      .from('agencies').select('settings').eq('id', agencyId).single();
    const wm = (agency?.settings as Record<string, unknown>)?.watermark as Record<string, unknown> | undefined;
    if (!wm?.enabled || !wm.logo_path) return undefined;
    const { data: blob } = await supabaseAdmin.storage.from('agency-assets').download(wm.logo_path as string);
    if (!blob) return undefined;
    return Buffer.from(await blob.arrayBuffer());
  } catch (e) {
    console.error('[upload-photos] watermark load failed', e);
    return undefined; // never block uploads on a watermark problem
  }
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return Response.json({ error: 'Neautentificat' }, { status: 401 });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) return Response.json({ error: 'Sesiune invalidă' }, { status: 401 });

    await ensureBucket();

    const formData = await request.formData();
    const propertyId = formData.get('propertyId') as string;
    let agencyId = formData.get('agencyId') as string;
    const replacePhotos = formData.get('replacePhotos') === 'true';
    const enhance = formData.get('enhance') === 'true';
    const files = formData.getAll('photos') as File[];

    // Fallback: dacă agencyId nu a fost trimis (ex: reordonare poze), îl
    // derivăm din proprietate. Mai robust și mai sigur decât să-l credem pe client.
    if (!agencyId && propertyId) {
      const { data: prop } = await supabaseAdmin
        .from('properties').select('agency_id').eq('id', propertyId).single();
      if (prop?.agency_id) agencyId = prop.agency_id;
    }

    // Ordered list of existing photo URLs to KEEP — drives reordering + removal on edit.
    // When replacePhotos is set, the final gallery is exactly: existingPhotos (in this order) + newly uploaded files.
    let existingPhotos: string[] = [];
    const existingRaw = formData.get('existingPhotos');
    if (typeof existingRaw === 'string' && existingRaw) {
      try {
        const parsed = JSON.parse(existingRaw);
        if (Array.isArray(parsed)) existingPhotos = parsed.filter((u): u is string => typeof u === 'string');
      } catch { /* ignore malformed input */ }
    }

    if (!propertyId || !agencyId) {
      return Response.json({ error: 'propertyId și agencyId sunt obligatorii' }, { status: 400 });
    }

    if (files.length > MAX_FILES) {
      return Response.json({ error: `Maximum ${MAX_FILES} poze permise per upload` }, { status: 400 });
    }

    // Validate all files before processing
    for (const file of files) {
      if (!ALLOWED_MIME.has(file.type)) {
        return Response.json({
          error: `Tip fișier invalid: ${file.type}. Sunt acceptate: JPEG, PNG, WebP, HEIC`
        }, { status: 400 });
      }
      if (file.size > MAX_FILE_SIZE) {
        return Response.json({
          error: `Fișierul "${file.name}" depășește limita de 10 MB (${(file.size / 1024 / 1024).toFixed(1)} MB)`
        }, { status: 400 });
      }
    }

    // Agency logo watermark (applied only when the global toggle is on).
    const watermark = await loadWatermark(agencyId);

    const photoUrls: string[] = [];
    const photoRows: {
      property_id: string; storage_path: string; hash: string;
      sort_order: number; is_cover: boolean; is_private: boolean;
      is_floorplan: boolean; is_360: boolean;
    }[] = [];

    // New photos are appended after the kept existing ones.
    let sortStart = existingPhotos.length;
    if (!replacePhotos) {
      // Keep existing count for sort_order
      const { count } = await supabaseAdmin
        .from('property_photos')
        .select('*', { count: 'exact', head: true })
        .eq('property_id', propertyId);
      sortStart = count ?? 0;
    }

    // Procesare PARALELĂ (concurență 4) — păstrează ordinea prin index.
    // Reduce drastic timpul total vs. secvențial, fără a depăși memoria.
    type Processed = { url: string; row: (typeof photoRows)[number] | null };
    const processed = await mapLimit(files, 4, async (file, i): Promise<Processed> => {
      const buffer = Buffer.from(await file.arrayBuffer());
      const hash = fileHash(buffer);

      // Dedup: același hash deja încărcat pentru această proprietate
      const existingUrl = await photoExists(agencyId, propertyId, hash);
      if (existingUrl) return { url: existingUrl, row: null };

      let variants: { thumb: Buffer; medium: Buffer; large: Buffer };
      try {
        variants = await generateVariants(buffer, watermark, enhance);
      } catch (e) {
        console.error(`[upload] sharp error for file ${file.name}:`, e);
        throw new Error(`Eroare procesare imagine: ${file.name}`);
      }

      const mediumUrl = await uploadVariants(agencyId, propertyId, hash, variants);
      return {
        url: mediumUrl,
        row: {
          property_id: propertyId,
          storage_path: `${agencyId}/${propertyId}/${hash}/medium.webp`,
          hash,
          sort_order: sortStart + i,
          is_cover: i === 0 && replacePhotos && existingPhotos.length === 0,
          is_private: false,
          is_floorplan: false,
          is_360: false,
        },
      };
    });

    for (const r of processed) {
      photoUrls.push(r.url);
      if (r.row) photoRows.push(r.row);
    }

    // Build the final ordered gallery: kept existing photos (in the order the user arranged them)
    // followed by any newly uploaded ones.
    const { data: prop } = await supabaseAdmin
      .from('properties')
      .select('attributes')
      .eq('id', propertyId)
      .single();

    const finalPhotos = replacePhotos
      ? [...existingPhotos, ...photoUrls]
      : [...(prop?.attributes?.photos || []), ...photoUrls];

    // On replace: remove storage folders no longer referenced, then reset photo rows.
    // (Done AFTER computing finalPhotos so newly uploaded folders are never deleted.)
    if (replacePhotos) {
      await deleteOrphanPhotos(agencyId, propertyId, finalPhotos);
      await supabaseAdmin.from('property_photos').delete().eq('property_id', propertyId);
    }

    // Insert new property_photos records (ignore hash column error if column doesn't exist yet)
    if (photoRows.length > 0) {
      const { error: insertError } = await supabaseAdmin.from('property_photos').insert(photoRows);
      if (insertError?.message?.includes('hash')) {
        // Column doesn't exist yet — insert without hash
        const rowsWithoutHash = photoRows.map(({ hash: _h, ...row }) => row);
        await supabaseAdmin.from('property_photos').insert(rowsWithoutHash);
      }
    }

    await supabaseAdmin
      .from('properties')
      .update({ attributes: { ...(prop?.attributes || {}), photos: finalPhotos } })
      .eq('id', propertyId);

    return Response.json({
      success: true,
      count: photoUrls.length,
      urls: photoUrls,
      photos: finalPhotos,
      message: `${photoUrls.length} imagine(i) noi · ${finalPhotos.length} în galerie`,
    });
  } catch (err) {
    console.error('[upload-photos] Unexpected error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Eroare server' },
      { status: 500 }
    );
  }
}
