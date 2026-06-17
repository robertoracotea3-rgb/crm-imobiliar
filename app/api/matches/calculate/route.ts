export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });

    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return Response.json({ error: 'Sesiune invalida' }, { status: 401 });

    const { property, demand } = await request.json();

    if (!property || !demand) {
      return Response.json(
        { error: 'Property si demand sunt obligatorii' },
        { status: 400 }
      );
    }

    let score = 0;

    // Categoria (40 puncte)
    if (property.category === demand.category) {
      score += 40;
    } else {
      score += 10;
    }

    // Locatie (30 puncte)
    const propLocationLower = (property.location || '').toLowerCase();
    const demandLocationLower = (demand.location || '').toLowerCase();

    if (
      propLocationLower.includes(demandLocationLower) ||
      demandLocationLower.includes(propLocationLower)
    ) {
      score += 30;
    } else {
      const propCity = propLocationLower.split(',')[0].trim();
      const demandCity = demandLocationLower.split(',')[0].trim();
      if (propCity === demandCity) {
        score += 15;
      }
    }

    // Pret (30 puncte)
    const propPrice = property.price || 0;
    if (demand.min_price || demand.max_price) {
      const minPrice = demand.min_price || 0;
      const maxPrice = demand.max_price || Infinity;

      if (propPrice >= minPrice && propPrice <= maxPrice) {
        score += 30;
      } else if (propPrice >= minPrice * 0.9 && propPrice <= maxPrice * 1.1) {
        score += 20;
      } else if (propPrice >= minPrice * 0.8 && propPrice <= maxPrice * 1.2) {
        score += 10;
      }
    } else {
      score += 15;
    }

    score = Math.min(100, Math.max(0, score));

    return Response.json({
      success: true,
      score: Math.round(score),
      details: {
        category_match: property.category === demand.category,
        location_match:
          propLocationLower.includes(demandLocationLower) ||
          demandLocationLower.includes(propLocationLower),
        price_match:
          !demand.min_price && !demand.max_price
            ? null
            : propPrice >= (demand.min_price || 0) &&
              propPrice <= (demand.max_price || Infinity),
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Eroare la calculare score',
      },
      { status: 500 }
    );
  }
}
