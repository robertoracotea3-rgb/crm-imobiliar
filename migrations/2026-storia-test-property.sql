-- ============================================================
-- 1. Curăță vechile înregistrări blocate (din contul real Storia)
-- ============================================================
DELETE FROM portal_listings WHERE portal = 'storia';

-- ============================================================
-- 2. Inserează proprietatea de test pentru OLX
-- Titlul conține deja [qatest-mercury] conform cerințelor OLX.
-- Descrierea este exact cea mandatată de OLX pentru teste.
-- ============================================================
INSERT INTO properties (
  agency_id,
  title,
  category,
  transaction,
  price,
  currency,
  latitude,
  longitude,
  status,
  attributes
)
SELECT
  a.id,
  '[qatest-mercury] Apartament 3 camere Fortis Fagaras' AS title,
  'apartament',
  'vanzare',
  65000,
  'EUR',
  45.8483,
  24.9726,
  'activ',
  jsonb_build_object(
    'nr_camere',  3,
    'sup_utila',  75,
    'etaj',       2,
    'nr_etaje',   4,
    'an_constructie', 2005,
    'descriere',  'Acesta este un anunț de testare, vă rugăm să îl ignorați.<br/><br/> Mulțumesc pentru înțelegere.',
    'photos', COALESCE(
      (
        SELECT p2.attributes->'photos'
        FROM   properties p2
        WHERE  p2.agency_id = a.id
          AND  p2.attributes->'photos' IS NOT NULL
          AND  jsonb_array_length(p2.attributes->'photos') > 0
        ORDER BY p2.created_at DESC
        LIMIT 1
      ),
      '[]'::jsonb
    )
  )
FROM agencies a
LIMIT 1
RETURNING id, title, price,
          jsonb_array_length(attributes->'photos') AS nr_poze;
