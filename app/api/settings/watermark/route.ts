export const dynamic = 'force-dynamic';

import sharp from 'sharp';
import { getAdminClient, requireApiAuth } from '@/lib/server/api-auth';

const admin = getAdminClient();
const BUCKET = 'agency-assets';
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const MAX_SIZE = 5 * 1024 * 1024;
const MAX_LOGO_WIDTH = 800;

async function ensureBucket() {
  const { data } = await admin.storage.getBucket(BUCKET);
  if (!data) await admin.storage.createBucket(BUCKET, { public: true, fileSizeLimit: MAX_SIZE });
}

async function mergeWatermark(agencyId: string, patch: Record<string, unknown>) {
  const { data: agency } = await admin.from('agencies').select('settings').eq('id', agencyId).single();
  const settings = (agency?.settings as Record<string, unknown>) || {};
  const watermark = { ...((settings.watermark as Record<string, unknown>) || {}), ...patch };
  await admin.from('agencies').update({ settings: { ...settings, watermark } }).eq('id', agencyId);
  return watermark;
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'settings', action: 'edit' });
  if (!auth.ok) return auth.response;

  try {
    const { agencyId } = auth.context;
    await ensureBucket();

    const form = await request.formData();
    const file = form.get('file') as File | null;
    if (!file) return Response.json({ error: 'Niciun fisier' }, { status: 400 });
    if (!ALLOWED_MIME.has(file.type)) {
      return Response.json({ error: `Tip fisier neacceptat: ${file.type}. Acceptate: PNG, JPG, WebP` }, { status: 400 });
    }
    if (file.size > MAX_SIZE) return Response.json({ error: 'Fisierul depaseste 5 MB' }, { status: 400 });

    const input = Buffer.from(await file.arrayBuffer());
    let png: Buffer;
    try {
      png = await sharp(input)
        .resize({ width: MAX_LOGO_WIDTH, withoutEnlargement: true })
        .ensureAlpha()
        .png()
        .toBuffer();
    } catch {
      return Response.json({ error: 'Imaginea nu a putut fi procesata' }, { status: 422 });
    }

    const path = `${agencyId}/watermark.png`;
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, png, {
      contentType: 'image/png',
      upsert: true,
      cacheControl: '60',
    });
    if (upErr) return Response.json({ error: `Upload esuat: ${upErr.message}` }, { status: 500 });

    const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(path);
    const logo_url = `${urlData.publicUrl}?v=${Date.now()}`;
    const watermark = await mergeWatermark(agencyId, { logo_path: path, logo_url });

    return Response.json({ success: true, watermark });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireApiAuth(request, { module: 'settings', action: 'edit' });
  if (!auth.ok) return auth.response;

  try {
    const { agencyId } = auth.context;
    await admin.storage.from(BUCKET).remove([`${agencyId}/watermark.png`]).catch(() => {});
    const watermark = await mergeWatermark(agencyId, { logo_path: null, logo_url: null, enabled: false });

    return Response.json({ success: true, watermark });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
