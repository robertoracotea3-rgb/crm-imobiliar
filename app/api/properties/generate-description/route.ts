export const dynamic = 'force-dynamic';

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });

  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return Response.json({ error: 'Sesiune invalida' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'ANTHROPIC_API_KEY lipsă din .env.local — adaugă cheia pentru a folosi AI' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const {
      tip_proprietate, tip_oferta, price, currency, nr_camere, sup_utila, sup_teren,
      judet, localitate, cartier, strada, etaj, nr_etaje, an_constructie, stare,
      dotari = [], utilitati = [], incalzire = [], mobilat, utilat, negociabil,
    } = body;

    const location = [cartier, localitate, judet].filter(Boolean).join(', ');
    const surface = sup_utila ? `${sup_utila} mp utili` : sup_teren ? `${sup_teren} mp teren` : '';
    const features = [...dotari, ...utilitati, ...incalzire].filter(Boolean).join(', ');
    const floorInfo = etaj ? `etaj ${etaj}${nr_etaje ? `/${nr_etaje}` : ''}` : '';
    const priceInfo = price ? `${Number(price).toLocaleString('ro-RO')} ${currency || 'EUR'}${negociabil ? ' (negociabil)' : ''}` : '';

    const prompt = `Ești un agent imobiliar profesionist din România. Generează descrieri optimizate pentru o proprietate cu următoarele caracteristici:

TIP: ${tip_proprietate || 'Proprietate'} de ${tip_oferta || 'vânzare'}
LOCAȚIE: ${location || 'România'}
SUPRAFAȚĂ: ${surface}
CAMERE: ${nr_camere ? `${nr_camere} camere` : ''}
${floorInfo ? `ETAJ: ${floorInfo}` : ''}
${an_constructie ? `AN CONSTRUCȚIE: ${an_constructie}` : ''}
${stare ? `STARE: ${stare}` : ''}
${mobilat ? `MOBILAT: ${mobilat}` : ''}
${utilat ? `UTILAT: ${utilat}` : ''}
DOTĂRI: ${features || 'standard'}
PREȚ: ${priceInfo}

Generează JSON cu structura EXACTĂ (fără text în afara JSON-ului):
{
  "completa": "descriere completă profesionistă 150-200 cuvinte în română, evidențiind avantajele principale",
  "scurta": "descriere scurtă 40-50 cuvinte, pentru listing rapid",
  "facebook": "text optimizat pentru Facebook/Instagram max 100 cuvinte, informal, cu emoji, CTA puternic",
  "olx": "titlu și descriere pentru OLX, max 150 cuvinte, format listing standard OLX",
  "imobiliare": "descriere pentru Imobiliare.ro max 200 cuvinte, formal, SEO-optimizat cu keywords imobiliare",
  "storia": "descriere pentru Storia.ro max 150 cuvinte, focus pe calitate și lifestyle"
}`;

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI nu a returnat JSON valid');

    const descriptions = JSON.parse(jsonMatch[0]);

    return Response.json({ descriptions });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare AI' }, { status: 500 });
  }
}
