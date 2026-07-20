export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { createHash } from 'crypto';
import sharp from 'sharp';
import { applyWatermark } from '@/lib/watermark';
import { getAdminClient, requireApiAuth } from '@/lib/server/api-auth';

const supabaseAdmin = getAdminClient();

const BUCKET = 'property-photos';
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']);
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 30;
const MAX_DIMENSION = 2500;

const SIZES = {
  thumb: { width: 300, quality: 78 },
  medium: { width: 800, quality: 83 },
  large: { width: 1600, quality: 87 },
} as const;

type PropertyAttributes = {
  photos?: string[];
  [key: string]: unknown;
};

async function ensureBucket() {
  const { data } = await supabaseAdmin.storage.getBucket(BUCKET);
  if (!data) {
    await supabaseAdmin.storage.createBucket(BUCKET, { public: true, fileSizeLimit: MAX_FILE_SIZE });
  }
}

function fileHash(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex').slice(0, 20);
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function makeVariant(
  source: Buffer,
  width: number,
  quality: number,
  watermark?: Buffer,
): Promise<Buffer> {
  let resized = await sharp(source)
    .resize(width, undefined, { fit: 'inside', withoutEnlargement: true })
    .toBuffer();

  if (watermark) resized = await applyWatermark(resized, watermark);
  return sharp(resized).webp({ quality, effort: 3 }).toBuffer();
}

async function enhanceForRealEstate(buffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(buffer)
      .modulate({ brightness: 1.06, saturation: 1.10 })
      .sharpen({ sigma: 0.7 })
      .toBuffer();
  } catch {
    return buffer;
  }
}

async function generateVariants(
  buffer: Buffer,
  watermark?: Buffer,
  enhance?: boolean,
): Promise<{ thumb: Buffer; medium: Buffer; large: Buffer }> {
  const meta = await sharp(buffer).metadata();
  const needsResize = (meta.width ?? 0) > MAX_DIMENSION || (meta.height ?? 0) > MAX_DIMENSION;
  let source = needsResize
    ? await sharp(buffer)
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .toBuffer()
    : buffer;

  if (enhance) source = await enhanceForRealEstate(source);

  const [thumb, medium, large] = await Promise.all([
    makeVariant(source, SIZES.thumb.width, SIZES.thumb.quality),
    makeVariant(source, SIZES.medium.width, SIZES.medium.quality, watermark),
    makeVariant(source, SIZES.large.width, SIZES.large.quality, watermark),
  ]);

  return { thumb, medium, large };
}

async function uploadVariants(
  agencyId: string,
  propertyId: string,
  hash: string,
  variants: { thumb: Buffer; medium: Buffer; large: Buffer },
): Promise<string> {
  const base = `${agencyId}/${propertyId}/${hash}`;
  const uploads = await Promise.all([
    supabaseAdmin.storage.from(BUCKET).upload(`${base}/thumb.webp`, variants.thumb, {
      contentType: 'image/webp',
      upsert: true,
      cacheControl: '31536000',
    }),
    supabaseAdmin.storage.from(BUCKET).upload(`${base}/medium.webp`, variants.medium, {
      contentType: 'image/webp',
      upsert: true,
      cacheControl: '31536000',
    }),
    supabaseAdmin.storage.from(BUCKET).upload(`${base}/large.webp`, variants.large, {
      contentType: 'image/webp',
      upsert: true,
      cacheControl: '31536000',
    }),
  ]);

  const failed = uploads.filter((u) => u.error);
  if (failed.length > 0) throw new Error(`Upload esuat: ${failed[0].error?.message}`);

  const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(`${base}/medium.webp`);
  return urlData.publicUrl;
}

async function photoExists(agencyId: string, propertyId: string, hash: string): Promise<string | null> {
  const { data } = await supabaseAdmin.storage
    .from(BUCKET)
    .list(`${agencyId}/${propertyId}/${hash}`);

  if (data?.some((f) => f.name === 'medium.webp')) {
    const { data: urlData } = supabaseAdmin.storage
      .from(BUCKET)
      .getPublicUrl(`${agencyId}/${propertyId}/${hash}/medium.webp`);
    return urlData.publicUrl;
  }

  return null;
}

async function deleteOrphanPhotos(agencyId: string, propertyId: string, keepUrls: string[]): Promise<void> {
  try {
    const prefix = `${agencyId}/${propertyId}`;
    const { data: folders } = await supabaseAdmin.storage.from(BUCKET).list(prefix, { limit: 500 });
    if (!folders?.length) return;

    const orphanPaths: string[] = [];
    for (const folder of folders) {
      if (folder.id) continue;
      const stillUsed = keepUrls.some((u) => u.includes(`/${folder.name}/`));
      if (stillUsed) continue;
      const { data: files } = await supabaseAdmin.storage.from(BUCKET).list(`${prefix}/${folder.name}`);
      if (files?.length) orphanPaths.push(...files.map((f) => `${prefix}/${folder.name}/${f.name}`));
    }

    for (let i = 0; i < orphanPaths.length; i += 100) {
      await supabaseAdmin.storage.from(BUCKET).remove(orphanPaths.slice(i, i + 100));
    }
  } catch (e) {
    console.error('[deleteOrphanPhotos] Error:', e);
  }
}

async function loadWatermark(agencyId: string): Promise<Buffer | undefined> {
  try {
    const { data: agency } = await supabaseAdmin
      .from('agencies')
      .select('settings')
      .eq('id', agencyId)
      .single();

    const wm = (agency?.settings as Record<string, unknown>)?.watermark as Record<string, unknown> | undefined;
    if (!wm?.enabled || !wm.logo_path) return undefined;

    const { data: blob } = await supabaseAdmin.storage.from('agency-assets').download(wm.logo_path as string);
    if (!blob) return undefined;
    return Buffer.from(await blob.arrayBuffer());
  } catch (e) {
    console.error('[upload-photos] watermark load failed', e);
    return undefined;
  }
}

function safeExistingPhotos(value: FormDataEntryValue | null, agencyId: string, propertyId: string): string[] {
  if (typeof value !== 'string' || !value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((u): u is string => (
      typeof u === 'string'
      && u.includes(`/${agencyId}/${propertyId}/`)
    ));
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'properties', action: 'edit' });
  if (!auth.ok) return auth.response;

  try {
    const { admin: db, agencyId } = auth.context;
    const formData = await request.formData();
    const propertyId = formData.get('propertyId') as string;
    const replacePhotos = formData.get('replacePhotos') === 'true';
    const enhance = formData.get('enhance') === 'true';
    const files = formData.getAll('photos') as File[];

    if (!propertyId) return Response.json({ error: 'propertyId este obligatoriu' }, { status: 400 });

    const { data: property, error: propertyError } = await db
      .from('properties')
      .select('id, attributes')
      .eq('id', propertyId)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .maybeSingle();

    if (propertyError) return Response.json({ error: propertyError.message }, { status: 500 });
    if (!property) return Response.json({ error: 'Proprietate negasita' }, { status: 404 });

    await ensureBucket();

    const attributes = (property.attributes || {}) as PropertyAttributes;
    const existingPhotos = safeExistingPhotos(formData.get('existingPhotos'), agencyId, propertyId);

    if (files.length > MAX_FILES) {
      return Response.json({ error: `Maximum ${MAX_FILES} poze permise per upload` }, { status: 400 });
    }

    for (const file of files) {
      if (!ALLOWED_MIME.has(file.type)) {
        return Response.json({
          error: `Tip fisier invalid: ${file.type}. Sunt acceptate: JPEG, PNG, WebP, HEIC`,
        }, { status: 400 });
      }
      if (file.size > MAX_FILE_SIZE) {
        return Response.json({
          error: `Fisierul "${file.name}" depaseste limita de 10 MB (${(file.size / 1024 / 1024).toFixed(1)} MB)`,
        }, { status: 400 });
      }
    }

    const watermark = await loadWatermark(agencyId);
    const photoUrls: string[] = [];
    const photoRows: {
      property_id: string;
      storage_path: string;
      hash: string;
      sort_order: number;
      is_cover: boolean;
      is_private: boolean;
      is_floorplan: boolean;
      is_360: boolean;
    }[] = [];

    let sortStart = existingPhotos.length;
    if (!replacePhotos) {
      const { count } = await supabaseAdmin
        .from('property_photos')
        .select('*', { count: 'exact', head: true })
        .eq('property_id', propertyId);
      sortStart = count ?? 0;
    }

    type Processed = { url: string; row: (typeof photoRows)[number] | null };
    const processed = await mapLimit(files, 4, async (file, i): Promise<Processed> => {
      const buffer = Buffer.from(await file.arrayBuffer());
      const hash = fileHash(buffer);

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

    const currentPhotos = Array.isArray(attributes.photos) ? attributes.photos : [];
    const finalPhotos = replacePhotos
      ? [...existingPhotos, ...photoUrls]
      : [...currentPhotos, ...photoUrls];

    if (replacePhotos) {
      await deleteOrphanPhotos(agencyId, propertyId, finalPhotos);
      await supabaseAdmin.from('property_photos').delete().eq('property_id', propertyId);
    }

    if (photoRows.length > 0) {
      const { error: insertError } = await supabaseAdmin.from('property_photos').insert(photoRows);
      if (insertError?.message?.includes('hash')) {
        const rowsWithoutHash = photoRows.map(({ hash, ...row }) => {
          void hash;
          return row;
        });
        await supabaseAdmin.from('property_photos').insert(rowsWithoutHash);
      } else if (insertError) {
        return Response.json({ error: insertError.message }, { status: 500 });
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from('properties')
      .update({ attributes: { ...attributes, photos: finalPhotos } })
      .eq('id', propertyId)
      .eq('agency_id', agencyId)
      .is('deleted_at', null);

    if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

    return Response.json({
      success: true,
      count: photoUrls.length,
      urls: photoUrls,
      photos: finalPhotos,
      message: `${photoUrls.length} imagine(i) noi - ${finalPhotos.length} in galerie`,
    });
  } catch (err) {
    console.error('[upload-photos] Unexpected error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Eroare server' },
      { status: 500 },
    );
  }
}
