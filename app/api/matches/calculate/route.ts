export async function POST(request: Request) {
  try {
    const { property, demand } = await request.json();

    if (!property || !demand) {
      return Response.json(
        { error: 'Property si demand sunt obligatorii' },
        { status: 400 }
      );
    }

    // Calculeaza scoring 0-100
    let score = 0;

    // 1. Categoria (40 puncte max)
    if (property.category === demand.category) {
      score += 40;
    } else {
      score += 10; // partial match
    }

    // 2. Locatie (30 puncte max)
    // Simple match: daca location-ul cererii e in location-ul proprietatii (substring)
    const propLocationLower = property.location.toLowerCase();
    const demandLocationLower = demand.location.toLowerCase();

    if (
      propLocationLower.includes(demandLocationLower) ||
      demandLocationLower.includes(propLocationLower)
    ) {
      score += 30;
    } else {
      // Partial credit pentru regiune (ex: Bucuresti vs Sector 1)
      const propCity = propLocationLower.split(',')[0].trim();
      const demandCity = demandLocationLower.split(',')[0].trim();
      if (propCity === demandCity) {
        score += 15;
      }
    }

    // 3. Pret (30 puncte max)
    const propPrice = property.price;
    if (demand.min_price || demand.max_price) {
      const minPrice = demand.min_price || 0;
      const maxPrice = demand.max_price || Infinity;

      if (propPrice >= minPrice && propPrice <= maxPrice) {
        score += 30;
      } else if (
        propPrice >= minPrice * 0.9 &&
        propPrice <= maxPrice * 1.1
      ) {
        // 10% tolerance
        score += 20;
      } else if (
        propPrice >= minPrice * 0.8 &&
        propPrice <= maxPrice * 1.2
      ) {
        // 20% tolerance
        score += 10;
      }
    } else {
      // Nu e specificat pret in cerere - nu penalizam
      score += 15;
    }

    // Clamp score la 0-100
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
    console.error('Matching Error:', error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Eroare la calculare score',
      },
      { status: 500 }
    );
  }
}
