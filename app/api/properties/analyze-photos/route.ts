export const dynamic = 'force-dynamic';

import Anthropic from '@anthropic-ai/sdk';
import { requireApiAuth } from '@/lib/server/api-auth';

type PhotoInput = { url?: string; base64?: string; media_type?: string };

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'properties', action: 'edit' });
  if (!auth.ok) return auth.response;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: 'ANTHROPIC_API_KEY lipsă — adaugă cheia pentru a folosi AI' }, { status: 503 });

  try {
    const { photos } = await request.json() as { photos: PhotoInput[] };
    if (!photos?.length) return Response.json({ error: 'Nicio poză trimisă' }, { status: 400 });

    const maxPhotos = Math.min(photos.length, 10);
    const subset = photos.slice(0, maxPhotos);

    const imageBlocks: Anthropic.ImageBlockParam[] = subset.map((p) => {
      if (p.base64) {
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: (p.media_type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data: p.base64,
          },
        };
      }
      return {
        type: 'image',
        source: { type: 'url', url: p.url! },
      };
    });

    const prompt = `Ești expert în imobiliare din România. Analizează cele ${maxPhotos} poze de proprietate (în ordinea în care apar).

PARTEA 1 — pentru FIECARE poză identifică:
1. Tipul spațiului (exact una din: Sufragerie, Living, Dormitor, Bucătărie, Baie, Hol, Birou, Balcon, Terasă, Exterior, Grădină, Curte, Garaj, Parcare, Pivniță, Mansardă, Panoramă, Plan/Schiță, Alt spațiu)
2. Descriere scurtă și precisă (max 12 cuvinte)
3. Finisaje/caracteristici vizibile (max 3)

PARTEA 2 — pe baza TUTUROR pozelor, completează câmpurile formularului. Folosește DOAR valorile permise de mai jos. Dacă un câmp nu poate fi dedus cu certitudine din poze, lasă-l "" (gol) sau false. Nu inventa.

Valori permise:
- tip_proprietate: una din [Apartament, Garsonieră, Casă/Vilă, Teren, Spațiu comercial, Birou, Hală, Industrial, Hotel/Pensiune, Garaj]
- stare: una din [Nou, Renovat, Necesită renovare]
- mobilat: una din [Nemobilat, Parțial mobilat, Mobilat complet]
- pereti: una sau mai multe din [Lavabil, Faianță, Gresie, Rigips, Tencuială, Vopsea, Marmură, Cărămidă aparentă, Tablă, Lambriu] (separate prin virgulă)
- podele: una sau mai multe din [Parchet, Gresie, Marmură, Laminat, Covor, Beton, Ciment, Scândură]
- tamplarie: una sau mai multe din [PVC termopan, Lemn, Aluminiu, Tâmplărie veche]
- usa_intrare: una din [Metalică, Blindată, Lemn, PVC]
- acoperis: una sau mai multe din [Tablă, Țiglă, Bitum, Terasă, Șindrilă, Eternit] (doar dacă e casă și se vede acoperișul)
- dot_piscina, dot_gradina, dot_curte, dot_garaj, dot_terasa, dot_foisor, dot_balcon, aer_conditionat: true/false (true doar dacă se vede clar)
- nr_balcoane, nr_terase: număr întreg vizibil sau 0

Returnează EXCLUSIV JSON valid, fără alt text:
{
  "photos": [
    {"index": 1, "room_type": "Sufragerie", "description": "Sufragerie luminoasă cu parchet și ferestre mari", "features": ["parchet lemn", "ferestre PVC triple", "tavan 3m"]}
  ],
  "overall_observations": "Scurtă observație generală despre finisajele și starea proprietății vizibile în poze (max 30 cuvinte)",
  "suggested_fields": {
    "tip_proprietate": "Casă/Vilă",
    "stare": "Necesită renovare",
    "mobilat": "",
    "pereti": "Tencuială",
    "podele": "Beton",
    "tamplarie": "PVC termopan",
    "usa_intrare": "",
    "acoperis": "Țiglă",
    "dot_piscina": false, "dot_gradina": false, "dot_curte": true,
    "dot_garaj": false, "dot_terasa": false, "dot_foisor": false, "dot_balcon": false,
    "aer_conditionat": false, "nr_balcoane": 0, "nr_terase": 0
  }
}`;

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          ...imageBlocks,
          { type: 'text', text: prompt },
        ],
      }],
    });

    const first = response.content[0];
    const text = first && first.type === 'text' ? first.text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return Response.json({ error: 'AI nu a returnat un răspuns valid. Încearcă din nou.' }, { status: 502 });

    // Parsăm defensiv răspunsul AI — dacă nu e JSON curat, întoarcem tot JSON valid (nu 500 brut).
    let result;
    try {
      result = JSON.parse(jsonMatch[0]);
    } catch {
      return Response.json({ error: 'Răspunsul AI nu a putut fi interpretat. Încearcă din nou.' }, { status: 502 });
    }
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare AI' }, { status: 500 });
  }
}
