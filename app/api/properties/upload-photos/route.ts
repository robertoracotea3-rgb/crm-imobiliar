export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';

import {
  PROPERTY_PHOTO_ALLOWED_MIME,
  PROPERTY_PHOTO_BUCKET,
  PROPERTY_PHOTO_MAX_FILES,
  PROPERTY_PHOTO_MAX_PIXELS,
  PROPERTY_PHOTO_MAX_UPLOAD_BYTES,
  type PropertyMediaInput,
  normalizeExistingPropertyMedia,
} from '@/lib/property-media';
import { requireApiAuth } from '@/lib/server/api-auth';
import { processPropertyMediaCleanupJobs } from '@/lib/server/property-media-cleanup';
import { applyWatermark } from '@/lib/watermark';

const MAX_FILES_PER_REQUEST = 20;
const MAX_DIMENSION = 2_500;
const SIZES = {
  thumb: { width: 300, quality: 78 },
  medium: { width: 800, quality: 83 },
  large: { width: 1_600, quality: 87 },
} as const;

type PropertyAttributes = { photos?: string[]; [key: string]: unknown };
type ProcessedUpload = { media: PropertyMediaInput; newlyUploadedPaths: string[] };

async function ensureBucket(serviceAdmin: SupabaseClient) {
  const { data, error } = await serviceAdmin.storage.getBucket(PROPERTY_PHOTO_BUCKET);
  if (error && !/not found/i.test(error.message)) throw new Error(error.message);
  if (!data) {
    const { error: createError } = await serviceAdmin.storage.createBucket(PROPERTY_PHOTO_BUCKET, {
      public: true,
      fileSizeLimit: PROPERTY_PHOTO_MAX_UPLOAD_BYTES,
      allowedMimeTypes: [...PROPERTY_PHOTO_ALLOWED_MIME],
    });
    if (createError && !/already exists/i.test(createError.message)) throw new Error(createError.message);
  }
}

const fileHash = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex').slice(0, 20);

async function makeVariant(source: Buffer, width: number, quality: number, watermark?: Buffer) {
  let resized = await sharp(source, { limitInputPixels: PROPERTY_PHOTO_MAX_PIXELS })
    .resize(width, undefined, { fit: 'inside', withoutEnlargement: true })
    .toBuffer();
  if (watermark) resized = await applyWatermark(resized, watermark);
  return sharp(resized).webp({ quality, effort: 3 }).toBuffer();
}

async function validateAndPrepareImage(file: File, enhance: boolean) {
  if (!PROPERTY_PHOTO_ALLOWED_MIME.has(file.type)) {
    throw new Error(`Format neacceptat pentru „${file.name}”. Folosește JPEG, PNG, WebP sau HEIC.`);
  }
  if (file.size <= 0 || file.size > PROPERTY_PHOTO_MAX_UPLOAD_BYTES) {
    throw new Error(`„${file.name}” depășește limita de 10 MB sau este gol.`);
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const image = sharp(buffer, { limitInputPixels: PROPERTY_PHOTO_MAX_PIXELS, animated: true });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > PROPERTY_PHOTO_MAX_PIXELS) {
    throw new Error(`„${file.name}” are dimensiuni nepermise.`);
  }
  if (!metadata.format || !['jpeg', 'png', 'webp', 'heif'].includes(metadata.format)) {
    throw new Error(`Conținutul fișierului „${file.name}” nu corespunde unui format de imagine permis.`);
  }
  if ((metadata.pages || 1) > 1) throw new Error(`Imaginile animate nu sunt acceptate: „${file.name}”.`);
  let source = Math.max(metadata.width, metadata.height) > MAX_DIMENSION
    ? await image.resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true }).toBuffer()
    : buffer;
  if (enhance) {
    source = await sharp(source).modulate({ brightness: 1.06, saturation: 1.1 })
      .sharpen({ sigma: 0.7 }).toBuffer();
  }
  return { source, width: metadata.width, height: metadata.height, hash: fileHash(buffer) };
}

const publicUrl = (serviceAdmin: SupabaseClient, path: string) =>
  serviceAdmin.storage.from(PROPERTY_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;

const canonicalVariants = (serviceAdmin: SupabaseClient, storagePath: string) => {
  const segments = storagePath.split('/');
  if (segments.length < 4) return { medium: publicUrl(serviceAdmin, storagePath) };
  const base = segments.slice(0, -1).join('/');
  return {
    thumb: publicUrl(serviceAdmin, `${base}/thumb.webp`),
    medium: publicUrl(serviceAdmin, `${base}/medium.webp`),
    large: publicUrl(serviceAdmin, `${base}/large.webp`),
  };
};

async function processUpload(
  serviceAdmin: SupabaseClient,
  agencyId: string,
  propertyId: string,
  propertyTitle: string,
  file: File,
  index: number,
  watermark: Buffer | undefined,
  enhance: boolean,
): Promise<ProcessedUpload> {
  const prepared = await validateAndPrepareImage(file, enhance);
  const base = `${agencyId}/${propertyId}/${prepared.hash}`;
  const mediumPath = `${base}/medium.webp`;
  const { data: existing } = await serviceAdmin.storage.from(PROPERTY_PHOTO_BUCKET).list(base, { limit: 10 });
  const alreadyStored = Boolean(existing?.some((item) => item.name === 'medium.webp'));
  const paths = {
    thumb: `${base}/thumb.webp`,
    medium: mediumPath,
    large: `${base}/large.webp`,
  };

  if (!alreadyStored) {
    const [thumb, medium, large] = await Promise.all([
      makeVariant(prepared.source, SIZES.thumb.width, SIZES.thumb.quality),
      makeVariant(prepared.source, SIZES.medium.width, SIZES.medium.quality, watermark),
      makeVariant(prepared.source, SIZES.large.width, SIZES.large.quality, watermark),
    ]);
    const uploads = await Promise.all([
      serviceAdmin.storage.from(PROPERTY_PHOTO_BUCKET).upload(paths.thumb, thumb, {
        contentType: 'image/webp', cacheControl: '31536000', upsert: false,
      }),
      serviceAdmin.storage.from(PROPERTY_PHOTO_BUCKET).upload(paths.medium, medium, {
        contentType: 'image/webp', cacheControl: '31536000', upsert: false,
      }),
      serviceAdmin.storage.from(PROPERTY_PHOTO_BUCKET).upload(paths.large, large, {
        contentType: 'image/webp', cacheControl: '31536000', upsert: false,
      }),
    ]);
    const failed = uploads.find((upload) => upload.error && !/already exists/i.test(upload.error.message));
    if (failed?.error) {
      await queueFailedCommitUploads(serviceAdmin, agencyId, propertyId, [paths.medium]).catch(() => {});
      throw new Error(failed.error.message);
    }
  }

  return {
    media: {
      url: publicUrl(serviceAdmin, paths.medium),
      storage_path: paths.medium,
      alt_text: `${propertyTitle} — fotografia ${index + 1}`,
      description: null,
      hash: prepared.hash,
      mime_type: 'image/webp',
      file_size: file.size,
      width: prepared.width,
      height: prepared.height,
      variants: {
        thumb: publicUrl(serviceAdmin, paths.thumb),
        medium: publicUrl(serviceAdmin, paths.medium),
        large: publicUrl(serviceAdmin, paths.large),
      },
    },
    newlyUploadedPaths: alreadyStored ? [] : [paths.medium],
  };
}

async function loadWatermark(serviceAdmin: SupabaseClient, agencyId: string) {
  try {
    const { data: agency } = await serviceAdmin.from('agencies').select('settings')
      .eq('id', agencyId).single();
    const watermark = (agency?.settings as Record<string, unknown>)?.watermark as
      | Record<string, unknown>
      | undefined;
    if (!watermark?.enabled || typeof watermark.logo_path !== 'string') return undefined;
    const { data } = await serviceAdmin.storage.from('agency-assets').download(watermark.logo_path);
    return data ? Buffer.from(await data.arrayBuffer()) : undefined;
  } catch {
    return undefined;
  }
}

function parsedJson(value: FormDataEntryValue | null): unknown {
  if (typeof value !== 'string' || !value) return [];
  try { return JSON.parse(value); } catch { return []; }
}

function mergeRequestedMetadata(
  requested: PropertyMediaInput[],
  stored: PropertyMediaInput[],
  raw: unknown,
): PropertyMediaInput[] {
  const storedByPath = new Map(stored.map((item) => [item.storage_path, item]));
  const rawByUrl = new Map(
    (Array.isArray(raw) ? raw : [])
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
      .filter((item) => typeof item.url === 'string')
      .map((item) => [String(item.url), item]),
  );
  return requested.map((item) => {
    const previous = storedByPath.get(item.storage_path);
    if (!previous) return item;
    const supplied = rawByUrl.get(item.url);
    return {
      ...previous,
      ...item,
      alt_text: supplied && ('alt_text' in supplied || 'altText' in supplied)
        ? item.alt_text
        : previous.alt_text || item.alt_text,
      description: supplied && 'description' in supplied ? item.description : previous.description,
      hash: item.hash || previous.hash,
      mime_type: item.mime_type || previous.mime_type,
      file_size: item.file_size ?? previous.file_size,
      width: item.width ?? previous.width,
      height: item.height ?? previous.height,
      variants: Object.keys(item.variants).length ? item.variants : previous.variants,
    };
  });
}

async function queueFailedCommitUploads(
  serviceAdmin: SupabaseClient,
  agencyId: string,
  propertyId: string,
  paths: string[],
) {
  if (!paths.length) return;
  await serviceAdmin.from('property_media_cleanup_jobs').insert(paths.map((storagePath) => ({
    agency_id: agencyId,
    property_id: propertyId,
    storage_path: storagePath,
    reason: 'upload_without_database_commit',
  })));
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'properties', action: 'edit' });
  if (!auth.ok) return auth.response;
  const { admin, serviceAdmin, agencyId, user } = auth.context;

  try {
    const formData = await request.formData();
    const propertyId = typeof formData.get('propertyId') === 'string'
      ? String(formData.get('propertyId'))
      : '';
    const replacePhotos = formData.get('replacePhotos') === 'true';
    const enhance = formData.get('enhance') === 'true';
    const files = formData.getAll('photos').filter((entry): entry is File => entry instanceof File);
    if (!propertyId) return Response.json({ error: 'Proprietatea este obligatorie.' }, { status: 400 });
    if (files.length > MAX_FILES_PER_REQUEST) {
      return Response.json({ error: `Maximum ${MAX_FILES_PER_REQUEST} fotografii per încărcare.` }, { status: 400 });
    }

    const { data: property, error: propertyError } = await admin.from('properties')
      .select('id,title,attributes').eq('id', propertyId).eq('agency_id', agencyId)
      .is('deleted_at', null).maybeSingle();
    if (propertyError) return Response.json({ error: propertyError.message }, { status: 500 });
    if (!property) return Response.json({ error: 'Proprietatea nu este accesibilă.' }, { status: 404 });

    const { data: catalogRows, error: catalogError } = await serviceAdmin.from('property_photos')
      .select('public_url,storage_path,alt_text,description,hash,mime_type,file_size,width,height,variants')
      .eq('agency_id', agencyId).eq('property_id', propertyId).is('deleted_at', null)
      .order('sort_order');
    if (catalogError) {
      return Response.json({
        error: 'Catalogul media nu este migrat. Aplică migrarea 20260720_130 înainte de upload.',
      }, { status: 503 });
    }

    await ensureBucket(serviceAdmin);
    const attributes = (property.attributes || {}) as PropertyAttributes;
    const fallbackMedia = (attributes.photos || []).map((url) => ({ url }));
    const storedMedia = normalizeExistingPropertyMedia(
      (catalogRows || []).map((row) => ({ ...row, url: row.public_url }))
        .filter((row) => row.url),
      agencyId,
      propertyId,
      property.title,
    );
    const requestedRaw = parsedJson(formData.get('existingMedia') || formData.get('existingPhotos'));
    const requestedMedia = mergeRequestedMetadata(normalizeExistingPropertyMedia(
      requestedRaw,
      agencyId,
      propertyId,
      property.title,
    ), storedMedia, requestedRaw);
    const currentMedia = storedMedia.length
      ? storedMedia
      : normalizeExistingPropertyMedia(fallbackMedia, agencyId, propertyId, property.title);
    const baseMedia = (replacePhotos ? requestedMedia : currentMedia).map((item) => ({
      ...item,
      // URL-ul public este reconstruit pe server; clientul nu poate injecta o
      // altă origine păstrând artificial aceeași cale de storage.
      url: publicUrl(serviceAdmin, item.storage_path),
      variants: canonicalVariants(serviceAdmin, item.storage_path),
    }));
    if (baseMedia.length + files.length > PROPERTY_PHOTO_MAX_FILES) {
      return Response.json({
        error: `Galeria poate conține maximum ${PROPERTY_PHOTO_MAX_FILES} fotografii.`,
      }, { status: 400 });
    }

    const watermark = await loadWatermark(serviceAdmin, agencyId);
    const processed: ProcessedUpload[] = [];
    try {
      for (const [index, file] of files.entries()) {
        processed.push(await processUpload(
          serviceAdmin,
          agencyId,
          propertyId,
          property.title,
          file,
          baseMedia.length + index,
          watermark,
          enhance,
        ));
      }
    } catch (uploadError) {
      await queueFailedCommitUploads(
        serviceAdmin,
        agencyId,
        propertyId,
        processed.flatMap((item) => item.newlyUploadedPaths),
      ).catch(() => {});
      throw uploadError;
    }
    const finalMedia = [...baseMedia, ...processed.map((item) => item.media)]
      .filter((item, index, all) =>
        all.findIndex((candidate) => candidate.storage_path === item.storage_path) === index);
    const newlyUploadedPaths = processed.flatMap((item) => item.newlyUploadedPaths);

    const { data: sync, error: syncError } = await serviceAdmin.rpc('crm_sync_property_media', {
      p_agency_id: agencyId,
      p_property_id: propertyId,
      p_actor_id: user.id,
      p_media: finalMedia,
    });
    if (syncError) {
      await queueFailedCommitUploads(serviceAdmin, agencyId, propertyId, newlyUploadedPaths).catch(() => {});
      return Response.json({ error: syncError.message }, { status: 500 });
    }

    const cleanup = await processPropertyMediaCleanupJobs(serviceAdmin, agencyId, 5).catch(() => []);
    return Response.json({
      success: true,
      uploaded: processed.length,
      photos: finalMedia.map((item) => item.url),
      media: finalMedia,
      sync,
      cleanup,
    });
  } catch (caught) {
    return Response.json({
      error: caught instanceof Error ? caught.message : 'Încărcarea fotografiilor a eșuat.',
    }, { status: 500 });
  }
}
