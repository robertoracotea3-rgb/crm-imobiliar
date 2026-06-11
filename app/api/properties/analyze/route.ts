export const dynamic = 'force-dynamic';

import { Anthropic } from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export async function POST(request: Request) {
  try {
    const { text } = await request.json();

    if (!text || text.trim().length === 0) {
      return Response.json({ error: 'Text gol' }, { status: 400 });
    }

    const analysisResponse = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Analizează următoarea descriere a unei proprietăți și extrage informațiile principale. Returneaza JSON cu structura exacta:
{
  "title": "titlu scurt si atractiv",
  "location": "locație (exemplu: Bucuresti, Sector 1)",
  "category": "apartament|casa_vila|spatiu_comercial|spatiu_industrial|teren|pensiune_hotel|birou|garaj",
  "price": 0,
  "bedrooms": null,
  "bathrooms": null,
  "area": null,
  "features": ["lista de caracteristici principale"]
}

Descrierea proprietății:
${text}

Returneaza DOAR JSON, fara text suplimentar.`,
        },
      ],
    });

    const analysisText =
      analysisResponse.content[0].type === 'text'
        ? analysisResponse.content[0].text
        : '';

    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Nu am putut extrage structura JSON din răspuns');
    }

    const analysisData = JSON.parse(jsonMatch[0]);

    const roDescResponse = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `Scrie o descriere atractivă în română pentru această proprietate imobiliară (100-150 cuvinte):
- Titlu: ${analysisData.title}
- Locație: ${analysisData.location}
- Camere: ${analysisData.bedrooms || 'nespecificat'}
- Suprafață: ${analysisData.area || 'nespecificat'} m²
- Caracteristici: ${analysisData.features?.join(', ') || 'nespecificat'}
Doar descrierea.`,
        },
      ],
    });

    const roDescription =
      roDescResponse.content[0].type === 'text'
        ? roDescResponse.content[0].text.trim()
        : '';

    const enDescResponse = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `Write an attractive property description in English (100-150 words):
- Title: ${analysisData.title}
- Location: ${analysisData.location}
- Rooms: ${analysisData.bedrooms || 'not specified'}
- Area: ${analysisData.area || 'not specified'} m²
- Features: ${analysisData.features?.join(', ') || 'not specified'}
Just the description.`,
        },
      ],
    });

    const enDescription =
      enDescResponse.content[0].type === 'text'
        ? enDescResponse.content[0].text.trim()
        : '';

    return Response.json({
      success: true,
      data: {
        ...analysisData,
        description_ro: roDescription,
        description_en: enDescription,
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Eroare la analiza proprietății',
      },
      { status: 500 }
    );
  }
}
