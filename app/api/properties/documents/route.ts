export const dynamic = 'force-dynamic';

import { logActivity, getUserName } from '@/lib/activity-log';
import { requireApiAuth, type AuthenticatedContext } from '@/lib/server/api-auth';

const BUCKET = 'property-documents';
const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']);
const MAX_SIZE = 15 * 1024 * 1024;
const VALID_CATEGORIES = ['contract', 'extras_cf', 'cert_energetic', 'act_proprietar', 'altele'];

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String(e.message);
  return String(e ?? 'Eroare');
}

async function ensureBucket({ serviceAdmin }: AuthenticatedContext) {
  const { data } = await serviceAdmin.storage.getBucket(BUCKET);
  if (!data) {
    // Private bucket: documentele sunt sensibile si se servesc doar prin link semnat.
    await serviceAdmin.storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_SIZE });
  }
}

async function ensureActiveProperty(
  { admin, agencyId }: AuthenticatedContext,
  propertyId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('properties')
    .select('id')
    .eq('id', propertyId)
    .eq('agency_id', agencyId)
    .is('deleted_at', null)
    .maybeSingle();

  return Boolean(data);
}

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'properties', action: 'view' });
  if (!auth.ok) return auth.response;

  try {
    const { context } = auth;
    const propertyId = new URL(request.url).searchParams.get('property_id');
    if (!propertyId) return Response.json({ error: 'property_id lipsa' }, { status: 400 });

    const hasPropertyAccess = await ensureActiveProperty(context, propertyId);
    if (!hasPropertyAccess) return Response.json({ error: 'Proprietate negasita' }, { status: 404 });

    const { data, error } = await context.admin
      .from('property_documents')
      .select('id, category, file_name, storage_path, mime_type, size, created_at')
      .eq('agency_id', context.agencyId)
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false });

    if (error) {
      if (/relation|does not exist/i.test(error.message)) return Response.json({ documents: [], needsMigration: true });
      return Response.json({ error: error.message }, { status: 500 });
    }

    const documents = await Promise.all(
      (data || []).map(async (d) => {
        const { data: signed } = await context.serviceAdmin.storage.from(BUCKET).createSignedUrl(d.storage_path, 3600);
        return { ...d, url: signed?.signedUrl || null };
      }),
    );

    return Response.json({ documents });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'properties', action: 'edit' });
  if (!auth.ok) return auth.response;

  try {
    const { context } = auth;
    await ensureBucket(context);

    const form = await request.formData();
    const propertyId = form.get('property_id') as string;
    const category = (form.get('category') as string) || 'altele';
    const file = form.get('file') as File | null;

    if (!propertyId) return Response.json({ error: 'property_id lipsa' }, { status: 400 });
    if (!file) return Response.json({ error: 'Niciun fisier' }, { status: 400 });
    if (!VALID_CATEGORIES.includes(category)) return Response.json({ error: 'Categorie invalida' }, { status: 400 });
    if (!ALLOWED_MIME.has(file.type)) {
      return Response.json({ error: `Tip fisier neacceptat: ${file.type}. Acceptate: PDF, JPG, PNG` }, { status: 400 });
    }
    if (file.size > MAX_SIZE) return Response.json({ error: 'Fisierul depaseste 15 MB' }, { status: 400 });

    const hasPropertyAccess = await ensureActiveProperty(context, propertyId);
    if (!hasPropertyAccess) return Response.json({ error: 'Proprietate negasita' }, { status: 404 });

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    const storagePath = `${context.agencyId}/${propertyId}/${Date.now()}-${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await context.serviceAdmin.storage.from(BUCKET).upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });
    if (upErr) return Response.json({ error: `Upload esuat: ${upErr.message}` }, { status: 500 });

    const { data: row, error: insErr } = await context.admin.from('property_documents').insert({
      agency_id: context.agencyId,
      property_id: propertyId,
      uploaded_by: context.user.id,
      category,
      file_name: safeName,
      storage_path: storagePath,
      mime_type: file.type,
      size: file.size,
    }).select('id, category, file_name, storage_path, mime_type, size, created_at').single();

    if (insErr) {
      await context.serviceAdmin.storage.from(BUCKET).remove([storagePath]);
      if (/relation|does not exist/i.test(insErr.message)) {
        return Response.json({ error: 'Tabela property_documents lipseste - ruleaza migrarea SQL in Supabase.' }, { status: 503 });
      }
      return Response.json({ error: insErr.message }, { status: 500 });
    }

    const userName = await getUserName(context.user.id);
    await logActivity({
      agency_id: context.agencyId,
      entity_type: 'property',
      entity_id: propertyId,
      user_id: context.user.id,
      user_name: userName,
      action: 'document',
      field: category,
      new_value: safeName,
    });

    const { data: signed } = await context.serviceAdmin.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
    return Response.json({ document: { ...row, url: signed?.signedUrl || null } }, { status: 201 });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireApiAuth(request, { module: 'properties', action: 'edit' });
  if (!auth.ok) return auth.response;

  try {
    const { context } = auth;
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ error: 'id lipsa' }, { status: 400 });

    const { data: doc } = await context.admin
      .from('property_documents')
      .select('id, agency_id, property_id, storage_path')
      .eq('id', id)
      .eq('agency_id', context.agencyId)
      .maybeSingle();

    if (!doc) return Response.json({ error: 'Document negasit' }, { status: 404 });

    const hasPropertyAccess = await ensureActiveProperty(context, doc.property_id);
    if (!hasPropertyAccess) return Response.json({ error: 'Proprietate negasita' }, { status: 404 });

    await context.serviceAdmin.storage.from(BUCKET).remove([doc.storage_path]);
    const { error } = await context.admin
      .from('property_documents')
      .delete()
      .eq('id', id)
      .eq('agency_id', context.agencyId);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}
