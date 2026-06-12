export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = 'property-photos';

async function ensureBucket() {
  const { data } = await supabaseAdmin.storage.getBucket(BUCKET);
  if (!data) {
    await supabaseAdmin.storage.createBucket(BUCKET, { public: true });
  }
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return Response.json({ error: 'Neautentificat' }, { status: 401 });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) return Response.json({ error: 'Sesiune invalida' }, { status: 401 });

    await ensureBucket();

    const formData = await request.formData();
    const propertyId = formData.get('propertyId') as string;
    const agencyId = formData.get('agencyId') as string;
    const replacePhotos = formData.get('replacePhotos') === 'true';
    const existingPhotosStr = formData.get('existingPhotos') as string;
    const files = formData.getAll('photos') as File[];

    // If replacePhotos, delete old photos first
    if (replacePhotos && existingPhotosStr) {
      try {
        const existingPhotos: string[] = JSON.parse(existingPhotosStr);
        // Delete property_photos records
        await supabaseAdmin.from('property_photos').delete().eq('property_id', propertyId);
        // Delete storage files
        const existingPaths = existingPhotos.map(url => {
          const match = url.match(/property-photos\/(.+?)$/);
          return match ? match[1] : null;
        }).filter(Boolean);
        if (existingPaths.length > 0) {
          await supabaseAdmin.storage.from(BUCKET).remove(existingPaths as string[]);
        }
      } catch (e) {
        console.error('Error deleting old photos:', e);
      }
    }

    const photoUrls: string[] = [];
    const photoRows: { property_id: string; storage_path: string; sort_order: number; is_cover: boolean; is_private: boolean; is_floorplan: boolean; is_360: boolean }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop() || 'jpg';
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const path = `${agencyId}/${propertyId}/${Date.now()}-${i}.${ext}`;

      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType: file.type, upsert: true });

      if (!uploadError && uploadData) {
        const { data: urlData } = supabaseAdmin.storage
          .from(BUCKET)
          .getPublicUrl(uploadData.path);
        photoUrls.push(urlData.publicUrl);
        photoRows.push({
          property_id: propertyId,
          storage_path: uploadData.path,
          sort_order: i,
          is_cover: i === 0,
          is_private: false,
          is_floorplan: false,
          is_360: false,
        });
      }
    }

    if (photoRows.length > 0) {
      await supabaseAdmin.from('property_photos').insert(photoRows);
    }

    if (photoUrls.length > 0 || replacePhotos) {
      const { data: prop } = await supabaseAdmin
        .from('properties')
        .select('attributes')
        .eq('id', propertyId)
        .single();

      const finalPhotos = replacePhotos ? photoUrls : [...(prop?.attributes?.photos || []), ...photoUrls];
      await supabaseAdmin
        .from('properties')
        .update({ attributes: { ...(prop?.attributes || {}), photos: finalPhotos } })
        .eq('id', propertyId);
    }

    return Response.json({ success: true, count: photoUrls.length });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Eroare server' },
      { status: 500 }
    );
  }
}
