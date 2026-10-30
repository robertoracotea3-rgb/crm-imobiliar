import 'server-only';
import { createClient } from '@supabase/supabase-js';

export type PublicProperty = {
  id: string; title: string; description: string | null; price: number | null;
  currency: string | null; category: string | null; transaction: string | null;
  city: string | null; county: string | null; zone: string | null;
  surface_useful: number | null; surface_built: number | null; surface_land: number | null;
  attributes: Record<string, unknown>;
};

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

/** Only explicitly published properties are exposed; private attributes and exact addresses never leave this server module. */
export async function getPublicProperties(city?: string): Promise<PublicProperty[]> {
  const db = client();
  if (!db) return [];
  let query = db.from('properties')
    .select('id,title,description,price,currency,category,transaction,city,county,zone,surface_useful,surface_built,surface_land,attributes')
    .eq('status', 'activa').order('updated_at', { ascending: false }).limit(500);
  if (city) query = query.ilike('city', `%${city}%`);
  const { data, error } = await query;
  if (error || !data) return [];
  return data.filter((p) => {
    const attrs = (p.attributes || {}) as Record<string, unknown>;
    const publication = (attrs.publicare || {}) as Record<string, unknown>;
    return publication.site === true && (!city || (p.city || '').toLocaleLowerCase('ro').includes(city.toLocaleLowerCase('ro')));
  }).map((p) => ({ ...p, attributes: sanitizeAttributes((p.attributes || {}) as Record<string, unknown>) })) as PublicProperty[];
}

function sanitizeAttributes(attrs: Record<string, unknown>): Record<string, unknown> {
  const allowed = ['photos', 'camere', 'dormitoare', 'bai', 'etaj', 'an_constructie', 'sup_utila', 'sup_construita', 'sup_teren', 'suprafata_teren', 'parcare', 'compartimentare', 'confort'];
  return Object.fromEntries(allowed.filter((key) => key in attrs).map((key) => [key, attrs[key]]));
}

export async function getPublicProperty(id: string): Promise<PublicProperty | null> {
  const db = client();
  if (!db) return null;
  const { data, error } = await db.from('properties')
    .select('id,title,description,price,currency,category,transaction,city,county,zone,surface_useful,surface_built,surface_land,attributes')
    .eq('id', id).eq('status', 'activa').maybeSingle();
  if (error || !data) return null;
  const attrs = (data.attributes || {}) as Record<string, unknown>;
  const publication = (attrs.publicare || {}) as Record<string, unknown>;
  if (publication.site !== true) return null;
  return { ...data, attributes: sanitizeAttributes(attrs) } as PublicProperty;
}
