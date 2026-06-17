export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VALID_CATEGORY = ['apartament', 'casa_vila', 'spatiu_comercial', 'spatiu_industrial', 'teren', 'pensiune_hotel', 'birou', 'garaj'];
const VALID_TRANSACTION = ['vanzare', 'inchiriere'];

interface Filters {
  category?: string | null;
  transaction?: string | null;
  county?: string | null;
  city?: string | null;
  price_min?: number | null;
  price_max?: number | null;
  rooms_min?: number | null;
  rooms_max?: number | null;
  surface_min?: number | null;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export async function POST(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });
    const { data: { user }, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !user) return Response.json({ error: 'Sesiune invalidă' }, { status: 401 });
    const { data: profile } = await admin.from('profiles').select('agency_id').eq('user_id', user.id).single();
    if (!profile?.agency_id) return Response.json({ error: 'Agenție negăsită' }, { status: 400 });

    const { query } = await request.json();
    if (!query?.trim()) return Response.json({ error: 'Interogare goală' }, { status: 400 });

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: 'Căutarea AI nu este configurată (lipsește ANTHROPIC_API_KEY).' }, { status: 503 });
    }

    // 1) Parse the natural-language query into structured filters via Claude Haiku.
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const sys = `Ești un asistent care transformă căutări imobiliare în limbaj natural (română) în filtre JSON.
Răspunde DOAR cu un obiect JSON valid, fără text suplimentar, cu cheile:
- category: una din [${VALID_CATEGORY.join(', ')}] sau null
- transaction: "vanzare" | "inchiriere" | null
- county: numele județului sau null
- city: numele localității sau null
- price_min: număr sau null
- price_max: număr sau null
- rooms_min: număr sau null
- rooms_max: număr sau null
- surface_min: număr (mp) sau null
Exemple: "apartamente 3 camere Făgăraș sub 70000 euro" → {"category":"apartament","transaction":null,"county":null,"city":"Făgăraș","price_min":null,"price_max":70000,"rooms_min":3,"rooms_max":3,"surface_min":null}
"case cu curte în Șercaia" → {"category":"casa_vila","transaction":null,"county":null,"city":"Șercaia","price_min":null,"price_max":null,"rooms_min":null,"rooms_max":null,"surface_min":null}`;

    let filters: Filters = {};
    try {
      const resp = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: sys,
        messages: [{ role: 'user', content: query }],
      });
      const text = resp.content.filter(c => c.type === 'text').map(c => (c as any).text).join('');
      const match = text.match(/\{[\s\S]*\}/);
      if (match) filters = JSON.parse(match[0]);
    } catch (e) {
      return Response.json({ error: `Eroare AI: ${e instanceof Error ? e.message : 'necunoscută'}` }, { status: 500 });
    }

    // Sanitize
    if (filters.category && !VALID_CATEGORY.includes(filters.category)) filters.category = null;
    if (filters.transaction && !VALID_TRANSACTION.includes(filters.transaction)) filters.transaction = null;

    // 2) Build the DB query for the SQL-filterable fields.
    let q = admin.from('properties')
      .select('id, internal_code, title, city, county, price, currency, category, transaction, status, attributes, created_at')
      .eq('agency_id', profile.agency_id)
      .limit(500);

    if (filters.category) q = q.eq('category', filters.category);
    if (filters.transaction) q = q.eq('transaction', filters.transaction);
    if (filters.city) q = q.ilike('city', `%${filters.city}%`);
    if (filters.county) q = q.ilike('county', `%${filters.county}%`);
    if (typeof filters.price_min === 'number') q = q.gte('price', filters.price_min);
    if (typeof filters.price_max === 'number') q = q.lte('price', filters.price_max);

    const { data, error } = await q;
    if (error) return Response.json({ error: error.message }, { status: 500 });

    // 3) Post-filter rooms / surface (stored in the attributes JSONB).
    let results = data || [];
    const roomsOf = (p: any) => parseFloat(String(p.attributes?.nr_camere ?? ''));
    const surfOf = (p: any) => parseFloat(String(p.attributes?.sup_utila ?? p.attributes?.sup_construita ?? ''));

    if (typeof filters.rooms_min === 'number') results = results.filter(p => { const r = roomsOf(p); return !Number.isFinite(r) || r >= filters.rooms_min!; });
    if (typeof filters.rooms_max === 'number') results = results.filter(p => { const r = roomsOf(p); return !Number.isFinite(r) || r <= filters.rooms_max!; });
    if (typeof filters.surface_min === 'number') results = results.filter(p => { const s = surfOf(p); return !Number.isFinite(s) || s >= filters.surface_min!; });

    // If the city filter was an ilike on the `city` column but data stores it in attributes, retry softly.
    if (filters.city && results.length === 0 && (data || []).length > 0) {
      const n = norm(filters.city);
      results = (data || []).filter(p => norm(String(p.attributes?.localitate || p.city || '')).includes(n));
    }

    return Response.json({ filters, properties: results, count: results.length });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
