export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = 'property-photos';

/** Delete all storage files for a property (all sizes of all photos). */
async function deletePropertyStorage(agencyId: string, propertyId: string): Promise<void> {
  try {
    const prefix = `${agencyId}/${propertyId}`;
    const { data: items } = await admin.storage.from(BUCKET).list(prefix, { limit: 500 });
    if (!items?.length) return;

    const allPaths: string[] = [];
    for (const item of items) {
      if (item.id) {
        // Flat file (legacy format)
        allPaths.push(`${prefix}/${item.name}`);
      } else {
        // Subfolder (new hash-based format: {hash}/thumb.webp etc.)
        const { data: variants } = await admin.storage.from(BUCKET).list(`${prefix}/${item.name}`);
        if (variants?.length) {
          allPaths.push(...variants.map(v => `${prefix}/${item.name}/${v.name}`));
        }
      }
    }

    for (let i = 0; i < allPaths.length; i += 100) {
      await admin.storage.from(BUCKET).remove(allPaths.slice(i, i + 100));
    }
  } catch (e) {
    // Log but don't fail the delete — property data deletion is more important
    console.error('[deletePropertyStorage]', e);
  }
}

export async function DELETE(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });

    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return Response.json({ error: 'Sesiune invalida' }, { status: 401 });

    const { data: profile } = await admin
      .from('profiles').select('agency_id, role').eq('user_id', user.id).single();
    if (!profile?.agency_id) return Response.json({ error: 'Agentie negasita' }, { status: 400 });

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return Response.json({ error: 'ID lipsă' }, { status: 400 });

    // Verify ownership
    const { data: prop } = await admin
      .from('properties').select('id, agency_id, title').eq('id', id).single();
    if (!prop) return Response.json({ error: 'Proprietatea nu există' }, { status: 404 });
    if (prop.agency_id !== profile.agency_id) {
      return Response.json({ error: 'Acces interzis' }, { status: 403 });
    }

    // Delete property record (DB)
    const { error } = await admin.from('properties').delete().eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    // Delete all associated images from storage (async, non-blocking)
    deletePropertyStorage(prop.agency_id, id);

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
