export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';
import { logActivity, getUserName } from '@/lib/activity-log';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

function errMsg(e: unknown): string {
  if (!e) return 'Eroare';
  if (e instanceof Error) return e.message;
  if (typeof e === 'object') {
    const o = e as Record<string, unknown>;
    return String(o.message || o.details || o.hint || JSON.stringify(e));
  }
  return String(e);
}

// Enum-uri reale din baza de date
const VALID_CATEGORY = ['apartament', 'casa_vila', 'spatiu_comercial', 'spatiu_industrial', 'teren', 'pensiune_hotel', 'birou', 'garaj'];
const VALID_STATUS = ['draft', 'activa', 'rezervata', 'tranzactionata', 'retrasa', 'arhivata'];
const VALID_TRANSACTION = ['vanzare', 'inchiriere', 'regim_hotelier'];

const STATUS_ALIASES: Record<string, string> = {
  active: 'activa', reserved: 'rezervata', sold: 'tranzactionata', rented: 'tranzactionata',
};

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });

    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return Response.json({ error: `Sesiune invalida: ${errMsg(userError)}` }, { status: 401 });

    const body = await request.json();
    const { propertyData } = body;
    if (!propertyData) return Response.json({ error: 'Date lipsa' }, { status: 400 });

    const { data: profile, error: profileError } = await admin
      .from('profiles').select('agency_id').eq('user_id', user.id).single();

    if (profileError) return Response.json({ error: `Profil: ${errMsg(profileError)}` }, { status: 400 });
    if (!profile?.agency_id) return Response.json({ error: 'Agentia nu a fost gasita' }, { status: 400 });

    const attrs = (propertyData.attributes || {}) as Record<string, unknown>;

    const category = VALID_CATEGORY.includes(propertyData.category) ? propertyData.category : 'apartament';
    const rawStatus = String(propertyData.status || 'activa');
    const status = VALID_STATUS.includes(rawStatus) ? rawStatus : (STATUS_ALIASES[rawStatus] || 'activa');
    const tipOferta = String(attrs.tip_oferta || '');
    const transaction = VALID_TRANSACTION.includes(String(propertyData.transaction))
      ? propertyData.transaction
      : tipOferta.toLowerCase().includes('chirie') || tipOferta.toLowerCase().includes('închiriere')
        ? 'inchiriere'
        : 'vanzare';

    const payload = {
      agency_id: profile.agency_id,
      agent_id: user.id,
      owner_contact_id: propertyData.owner_contact_id || null,
      internal_code: propertyData.internal_code || `PR-${Date.now()}`,
      category,
      transaction,
      status,
      title: propertyData.title,
      description: propertyData.description || null,
      description_en: (attrs.descriere_en as string) || null,
      price: num(propertyData.price),
      currency: (attrs.currency as string) || 'EUR',
      vat_included: Boolean(attrs.tva_inclus),
      negotiable: Boolean(attrs.negociabil),
      county: (attrs.judet as string) || null,
      city: (attrs.localitate as string) || null,
      zone: (attrs.zona as string) || (attrs.cartier as string) || null,
      street: (attrs.strada as string) || null,
      street_number: (attrs.numar as string) || null,
      latitude: num(attrs.lat),
      longitude: num(attrs.lon),
      show_exact_location: !attrs.ascunde_adresa,
      surface_useful: num(attrs.sup_utila),
      surface_built: num(attrs.sup_construita),
      surface_land: num(attrs.sup_teren),
      exclusive: Boolean(attrs.exclusivitate),
      private_notes: (attrs.obs_interne as string) || null,
      attributes: attrs,
    };

    const { data: property, error: insertError } = await admin
      .from('properties').insert([payload]).select('id').single();

    if (insertError) return Response.json({ error: `Insert: ${errMsg(insertError)}` }, { status: 500 });

    const userName = await getUserName(user.id);
    await logActivity({
      agency_id: profile.agency_id, entity_type: 'property', entity_id: property!.id,
      user_id: user.id, user_name: userName, action: 'create', new_value: payload.title,
    });

    return Response.json({ property_id: property!.id, agency_id: profile.agency_id });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}
