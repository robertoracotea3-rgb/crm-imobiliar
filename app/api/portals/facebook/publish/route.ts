export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/server/api-auth';

const GRAPH = 'https://graph.facebook.com/v21.0';
const PUBLIC_SITE = process.env.FB_PUBLIC_SITE_URL || 'https://kiraimobiliare.ro';

const CAT_LABELS: Record<string, string> = {
  apartament: 'Apartament', casa_vila: 'Casă / Vilă', teren: 'Teren',
  spatiu_comercial: 'Spațiu Comercial', spatiu_industrial: 'Spațiu Industrial',
  birou: 'Birou', pensiune_hotel: 'Pensiune / Hotel', garaj: 'Garaj',
};

function slugify(text: string): string {
  return text.toLowerCase()
    .replace(/[ăâ]/g, 'a').replace(/[îí]/g, 'i').replace(/[șş]/g, 's')
    .replace(/[țţ]/g, 't').replace(/[éè]/g, 'e')
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
}

function propertyUrl(p: { category: string; city: string; internal_code: string }): string {
  const cat = slugify(CAT_LABELS[p.category] || p.category);
  const city = slugify(p.city || 'fagaras');
  return `${PUBLIC_SITE}/proprietati/${cat}-${city}-${(p.internal_code || '').toLowerCase()}`;
}

interface FbError { message?: string; code?: number; error_subcode?: number; type?: string }
function fbErr(e: FbError | undefined): string {
  if (!e) return 'eroare necunoscută';
  const codes = [e.code, e.error_subcode].filter(v => v != null).join('/');
  return `${e.message || 'eroare'}${codes ? ` [cod ${codes}]` : ''}${e.type ? ` (${e.type})` : ''}`;
}

// POST /api/portals/facebook/publish  Body: { property_id }
export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'portals', action: 'create' });
  if (!auth.ok) return auth.response;
  const { serviceAdmin: supabase, agencyId } = auth.context;

  const SYSTEM_TOKEN = process.env.FB_PAGE_TOKEN;
  if (!SYSTEM_TOKEN) {
    return NextResponse.json(
      { error: 'Facebook nu este configurat — lipsește FB_PAGE_TOKEN în setări.' },
      { status: 503 }
    );
  }

  // Rezolvă automat pagina + tokenul ei din token (nu depinde de FB_PAGE_ID corect).
  // Tokenul system-user are acces la paginile atribuite; luăm pagina potrivită.
  let PAGE_ID = process.env.FB_PAGE_ID || '';
  let PAGE_TOKEN = SYSTEM_TOKEN;
  try {
    const accRes = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token&access_token=${SYSTEM_TOKEN}`);
    const accJson = await accRes.json();
    if (Array.isArray(accJson.data) && accJson.data.length > 0) {
      const match = PAGE_ID ? accJson.data.find((p: { id: string }) => p.id === PAGE_ID) : null;
      const chosen = match || accJson.data[0];
      PAGE_ID = chosen.id;
      if (chosen.access_token) PAGE_TOKEN = chosen.access_token; // tokenul specific al paginii
    } else if (accJson.error) {
      return NextResponse.json({ error: `Facebook (la citire pagini): ${fbErr(accJson.error)}` }, { status: 400 });
    }
  } catch { /* dacă pică, încercăm cu env-ul existent mai jos */ }

  if (!PAGE_ID) {
    return NextResponse.json(
      { error: 'Nu am găsit nicio pagină accesibilă cu acest token. Verifică că pagina e atribuită utilizatorului de sistem.' },
      { status: 400 }
    );
  }

  const { property_id, force } = await request.json();
  if (!property_id) return NextResponse.json({ error: 'property_id obligatoriu' }, { status: 400 });

  const { data: property } = await supabase
    .from('properties').select('*').eq('id', property_id).eq('agency_id', agencyId).single();
  if (!property) return NextResponse.json({ error: 'Proprietatea nu a fost găsită' }, { status: 404 });

  const a = (property.attributes as Record<string, unknown>) || {};
  const pub = (a.publicare as Record<string, unknown>) || {};

  // Evită dublarea: dacă a fost deja postată, nu reposta (decât cu force)
  if (pub.fb_post_id && !force) {
    return NextResponse.json({ success: true, alreadyPublished: true, post_id: pub.fb_post_id });
  }

  // ── Construiește mesajul ────────────────────────────────────────────────
  const price = property.price
    ? `${Number(property.price).toLocaleString('ro-RO')} ${property.currency || 'EUR'}`
    : '';
  const locParts = [property.city, property.county].filter(Boolean).join(', ');
  const fbText = (a.descriere_facebook as string) || property.description || property.title || '';
  const url = propertyUrl(property);
  const cityTag = property.city ? `#${slugify(property.city).replace(/-/g, '')}` : '';

  const message = [
    property.title,
    '',
    fbText.slice(0, 700),
    '',
    locParts ? `📍 ${locParts}` : '',
    price ? `💶 ${price}` : '',
    '',
    `👉 Detalii și poze: ${url}`,
    `#imobiliare ${cityTag} #KiraImobiliare`,
  ].filter(l => l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n').trim();

  // ── Poze (până la 10) ───────────────────────────────────────────────────
  const photos: string[] = Array.isArray(a.photos) ? (a.photos as string[]).slice(0, 10) : [];

  try {
    let postId: string | null = null;
    let lastPhotoErr: FbError | undefined;

    if (photos.length > 0) {
      // 1. Încarcă fiecare poză nepublicată → obține media_fbid
      const mediaIds: string[] = [];
      for (const photoUrl of photos) {
        const params = new URLSearchParams({ url: photoUrl, published: 'false', temporary: 'true', access_token: PAGE_TOKEN });
        const r = await fetch(`${GRAPH}/${PAGE_ID}/photos`, { method: 'POST', body: params });
        const j = await r.json();
        if (j.id) mediaIds.push(j.id);
        else if (j.error) { console.error('[fb] photo upload error:', j.error); lastPhotoErr = j.error; }
      }

      if (mediaIds.length > 0) {
        // 2. Creează postarea cu pozele atașate
        const body = new URLSearchParams({ message, access_token: PAGE_TOKEN });
        mediaIds.forEach((id, i) => body.append(`attached_media[${i}]`, JSON.stringify({ media_fbid: id })));
        const r = await fetch(`${GRAPH}/${PAGE_ID}/feed`, { method: 'POST', body });
        const j = await r.json();
        if (j.error) throw new Error(`Facebook (la postare): ${fbErr(j.error)}`);
        postId = j.id;
      } else if (lastPhotoErr) {
        // toate pozele au eșuat — raportăm eroarea reală (probabil aceeași cauză)
        throw new Error(`Facebook (la încărcare poze): ${fbErr(lastPhotoErr)}`);
      }
    }

    // Fără poze (sau toate eșuate) → postare text + link
    if (!postId) {
      const body = new URLSearchParams({ message, link: url, access_token: PAGE_TOKEN });
      const r = await fetch(`${GRAPH}/${PAGE_ID}/feed`, { method: 'POST', body });
      const j = await r.json();
      if (j.error) throw new Error(`Facebook (la postare): ${fbErr(j.error)}`);
      postId = j.id;
    }

    // Salvează id-ul postării
    await supabase.from('properties').update({
      attributes: { ...a, publicare: { ...pub, fb_post_id: postId, fb_published_at: new Date().toISOString() } },
    }).eq('id', property_id).eq('agency_id', agencyId);

    return NextResponse.json({ success: true, post_id: postId, url: `https://facebook.com/${postId}` });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Eroare la publicarea pe Facebook' },
      { status: 500 }
    );
  }
}
