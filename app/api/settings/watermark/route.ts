export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = 'agency-assets';
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_LOGO_WIDTH = 800; // px — logos don't need to be larger than this

async function getCaller(token: string) {
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) throw new Error('Sesiune invalidă');
  const { data: profile } = await admin.from('profiles')
    .select('agency_id, role').eq('user_id', user.id).single();
  if (!profile?.agency_id) throw new Error('Agenție negăsită');
  if (!['owner', 'admin'].includes(profile.role)) throw new Error('Doar proprietarul sau administratorul poate schimba watermark-ul');
  return { user, agency_id: profile.agency_id as string };
}

async function ensureBucket() {
  const { data } = await admin.storage.getBucket(BUCKET);
  if (!data) await admin.storage.createBucket(BUCKET, { public: true, fileSizeLimit: MAX_SIZE });
}

async function mergeWatermark(agencyId: string, patch: Record<string, unknown>) {
  const { data: agency } = await admin.from('agencies').select('settings').eq('id', agencyId).single();
  const settings = (agency?.settings as Record<string, unknown>) || {};
  const watermark = { ...(settings.watermark as Record<string, unknown> || {}), ...patch };
  await admin.from('agencies').update({ settings: { ...settings, watermark } }).eq('id', agencyId);
  return watermark;
}

// POST — upload / replace the agency logo used as photo watermark.
export async function POST(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });
    const { agency_id } = await getCaller(token);
    await ensureBucket();

    const form = await request.formData();
    const file = form.get('file') as File | null;
    if (!file) return Response.json({ error: 'Niciun fișier' }, { status: 400 });
    if (!ALLOWED_MIME.has(file.type)) return Response.json({ error: `Tip fișier neacceptat: ${file.type}. Acceptate: PNG, JPG, WebP (ideal PNG transparent)` }, { status: 400 });
    if (file.size > MAX_SIZE) return Response.json({ error: 'Fișierul depășește 5 MB' }, { status: 400 });

    // Normalize to a transparent PNG, capped width — this is the watermark source.
    const input = Buffer.from(await file.arrayBuffer());
    let png: Buffer;
    try {
      png = await sharp(input)
        .resize({ width: MAX_LOGO_WIDTH, withoutEnlargement: true })
        .ensureAlpha()
        .png()
        .toBuffer();
    } catch {
      return Response.json({ error: 'Imaginea nu a putut fi procesată' }, { status: 422 });
    }

    const path = `${agency_id}/watermark.png`;
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, png, {
      contentType: 'image/png', upsert: true, cacheControl: '60',
    });
    if (upErr) return Response.json({ error: `Upload eșuat: ${upErr.message}` }, { status: 500 });

    const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(path);
    // Cache-bust the preview so a replaced logo shows immediately.
    const logo_url = `${urlData.publicUrl}?v=${Date.now()}`;
    const watermark = await mergeWatermark(agency_id, { logo_path: path, logo_url });

    return Response.json({ success: true, watermark });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}

// DELETE — remove the watermark logo (keeps the on/off flag, but nothing to apply).
export async function DELETE(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });
    const { agency_id } = await getCaller(token);

    await admin.storage.from(BUCKET).remove([`${agency_id}/watermark.png`]).catch(() => {});
    const watermark = await mergeWatermark(agency_id, { logo_path: null, logo_url: null, enabled: false });

    return Response.json({ success: true, watermark });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
