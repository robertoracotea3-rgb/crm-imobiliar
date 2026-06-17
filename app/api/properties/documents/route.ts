export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';
import { logActivity, getUserName } from '@/lib/activity-log';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = 'property-documents';
const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']);
const MAX_SIZE = 15 * 1024 * 1024; // 15 MB
const VALID_CATEGORIES = ['contract', 'extras_cf', 'cert_energetic', 'act_proprietar', 'altele'];

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') return String((e as any).message || JSON.stringify(e));
  return String(e ?? 'Eroare');
}

async function auth(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) throw new Error('Neautentificat');
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) throw new Error('Sesiune invalidă');
  const { data: profile } = await admin.from('profiles').select('agency_id').eq('user_id', user.id).single();
  if (!profile?.agency_id) throw new Error('Agenție negăsită');
  return { user, agency_id: profile.agency_id as string };
}

async function ensureBucket() {
  const { data } = await admin.storage.getBucket(BUCKET);
  if (!data) {
    // Private bucket — documents are sensitive; served via signed URLs only.
    await admin.storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_SIZE });
  }
}

// ── GET: list documents for a property (with short-lived signed URLs) ──
export async function GET(request: Request) {
  try {
    const { agency_id } = await auth(request);
    const propertyId = new URL(request.url).searchParams.get('property_id');
    if (!propertyId) return Response.json({ error: 'property_id lipsă' }, { status: 400 });

    const { data, error } = await admin
      .from('property_documents')
      .select('id, category, file_name, storage_path, mime_type, size, created_at')
      .eq('agency_id', agency_id)
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false });

    if (error) {
      // Table may not exist yet (migration not run) — return empty rather than 500.
      if (/relation|does not exist/i.test(error.message)) return Response.json({ documents: [], needsMigration: true });
      return Response.json({ error: error.message }, { status: 500 });
    }

    const documents = await Promise.all(
      (data || []).map(async (d) => {
        const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(d.storage_path, 3600);
        return { ...d, url: signed?.signedUrl || null };
      })
    );
    return Response.json({ documents });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 401 });
  }
}

// ── POST: upload a document (multipart: property_id, category, file) ──
export async function POST(request: Request) {
  try {
    const { user, agency_id } = await auth(request);
    await ensureBucket();

    const form = await request.formData();
    const propertyId = form.get('property_id') as string;
    const category = (form.get('category') as string) || 'altele';
    const file = form.get('file') as File | null;

    if (!propertyId) return Response.json({ error: 'property_id lipsă' }, { status: 400 });
    if (!file) return Response.json({ error: 'Niciun fișier' }, { status: 400 });
    if (!VALID_CATEGORIES.includes(category)) return Response.json({ error: 'Categorie invalidă' }, { status: 400 });
    if (!ALLOWED_MIME.has(file.type)) return Response.json({ error: `Tip fișier neacceptat: ${file.type}. Acceptate: PDF, JPG, PNG` }, { status: 400 });
    if (file.size > MAX_SIZE) return Response.json({ error: `Fișierul depășește 15 MB` }, { status: 400 });

    // Ownership check
    const { data: prop } = await admin.from('properties').select('id').eq('id', propertyId).eq('agency_id', agency_id).single();
    if (!prop) return Response.json({ error: 'Proprietate negăsită' }, { status: 404 });

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    const storagePath = `${agency_id}/${propertyId}/${Date.now()}-${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, buffer, {
      contentType: file.type, upsert: false,
    });
    if (upErr) return Response.json({ error: `Upload eșuat: ${upErr.message}` }, { status: 500 });

    const { data: row, error: insErr } = await admin.from('property_documents').insert({
      agency_id, property_id: propertyId, uploaded_by: user.id,
      category, file_name: safeName, storage_path: storagePath,
      mime_type: file.type, size: file.size,
    }).select('id, category, file_name, storage_path, mime_type, size, created_at').single();

    if (insErr) {
      // Roll back the uploaded object if the metadata insert failed.
      await admin.storage.from(BUCKET).remove([storagePath]);
      if (/relation|does not exist/i.test(insErr.message)) {
        return Response.json({ error: 'Tabela property_documents lipsește — rulează migrarea SQL în Supabase.' }, { status: 503 });
      }
      return Response.json({ error: insErr.message }, { status: 500 });
    }

    const userName = await getUserName(user.id);
    await logActivity({
      agency_id, entity_type: 'property', entity_id: propertyId, user_id: user.id, user_name: userName,
      action: 'document', field: category, new_value: safeName,
    });

    const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
    return Response.json({ document: { ...row, url: signed?.signedUrl || null } }, { status: 201 });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}

// ── DELETE: remove a document (?id=) ──
export async function DELETE(request: Request) {
  try {
    const { agency_id } = await auth(request);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ error: 'id lipsă' }, { status: 400 });

    const { data: doc } = await admin.from('property_documents')
      .select('id, agency_id, storage_path').eq('id', id).single();
    if (!doc || doc.agency_id !== agency_id) return Response.json({ error: 'Acces interzis' }, { status: 403 });

    await admin.storage.from(BUCKET).remove([doc.storage_path]);
    const { error } = await admin.from('property_documents').delete().eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}
