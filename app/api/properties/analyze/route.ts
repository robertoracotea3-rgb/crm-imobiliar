import { Anthropic } from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: Request) {
  try {
    const { text } = await request.json();

    if (!text || text.trim().length === 0) {
      return Response.json(
        { error: 'Text gol' },
        { status: 400 }
      );
    }

    // Analizeaza textul cu Claude
    const analysisResponse = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Analizează următoarea descriere a unei proprietăți și extrage informațiile principale. Returneaza JSON cu structura exacta:
{
  "title": "titlu scurt si atractiv",
  "location": "locație (exemplu: Bucuresti, Sector 1)",
  "category": "apartament|casa_vila|spatiu_comercial|spatiu_industrial|teren|pensiune_hotel|birou|garaj",
  "price": "preț (doar numărul, fără simbol)",
  "bedrooms": "numărul de camere (sau null)",
  "bathrooms": "numărul de băi (sau null)",
  "area": "suprafață în m2 (sau null)",
  "features": ["lista de caracteristici principale"]
}

Descrierea proprietății:
${text}

Extrage doar informații care sunt explicit menționate în text.`,
        },
      ],
    });

    // Parse response
    const analysisText =
      analysisResponse.content[0].type === 'text'
        ? analysisResponse.content[0].text
        : '';

    // Extract JSON from response
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Nu am putut extrage structura JSON din răspuns');
    }

    const analysisData = JSON.parse(jsonMatch[0]);

    // Genereaza descriere RO
    const roDescResponse = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `Scrie o descriere atractiva și profesională în limba română pentru această proprietate. Lungime: 100-150 cuvinte.

Informații:
- Titlu: ${analysisData.title}
- Locație: ${analysisData.location}
- Camere: ${analysisData.bedrooms || 'nespecificat'}
- Băi: ${analysisData.bathrooms || 'nespecificat'}
- Suprafață: ${analysisData.area || 'nespecificat'} m²
- Caracteristici: ${analysisData.features?.join(', ') || 'nespecificat'}

Doar descrierea, fără alte text.`,
        },
      ],
    });

    const roDescription =
      roDescResponse.content[0].type === 'text'
        ? roDescResponse.content[0].text.trim()
        : '';

    // Genereaza descriere EN
    const enDescResponse = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `Write an attractive and professional property description in English. Length: 100-150 words.

Information:
- Title: ${analysisData.title}
- Location: ${analysisData.location}
- Rooms: ${analysisData.bedrooms || 'not specified'}
- Bathrooms: ${analysisData.bathrooms || 'not specified'}
- Area: ${analysisData.area || 'not specified'} m²
- Features: ${analysisData.features?.join(', ') || 'not specified'}

Just the description, no other text.`,
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
    console.error('AI Analyzer Error:', error);
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
