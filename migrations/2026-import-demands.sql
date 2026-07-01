-- ============================================================
-- Import cereri (demands) existente în modulul CLIENȚI
-- Rulează DUPĂ migrations/2026-clients.sql.
-- Idempotent: fiecare cerere e marcată cu criteria->>'imported_demand_id',
-- deci poți rula scriptul de mai multe ori fără să dubleze clienți.
-- ============================================================

do $$
declare
  d record;
  existing_lead_id uuid;
  mapped_status text;
  d_city text;
  d_county text;
begin
  for d in
    select dm.*, c.full_name, c.phone, c.email
    from demands dm
    left join contacts c on c.id = dm.contact_id
    where dm.contact_id is not null
  loop
    -- fără telefon valid pe contact nu putem crea un client (contact_phone e obligatoriu în leads)
    if d.phone is null or trim(d.phone) = '' then
      continue;
    end if;

    -- deja importată? (idempotent)
    if exists (
      select 1 from leads
       where agency_id = d.agency_id
         and (criteria->>'imported_demand_id') = d.id::text
    ) then
      continue;
    end if;

    -- Mapare status cerere → status client:
    -- activa (căutare în desfășurare) → În lucru; inactiva → Nu a răspuns (de resunat);
    -- indeplinita → Vândut; anulata → Pierdut.
    mapped_status := case d.status
      when 'activa'      then 'in_progress'
      when 'inactiva'    then 'no_answer'
      when 'indeplinita' then 'won'
      when 'anulata'     then 'lost'
      else 'new'
    end;

    d_city   := case when d.cities   is not null and array_length(d.cities,1)   > 0 then d.cities[1]   else null end;
    d_county := case when d.counties is not null and array_length(d.counties,1) > 0 then d.counties[1] else null end;

    -- Dedup: același telefon SAU email în agenție (exact regula folosită la lead-uri noi)
    select id into existing_lead_id from leads
     where agency_id = d.agency_id and contact_phone = d.phone limit 1;
    if existing_lead_id is null and d.email is not null then
      select id into existing_lead_id from leads
       where agency_id = d.agency_id and contact_email = d.email limit 1;
    end if;

    if existing_lead_id is not null then
      -- Client deja existent (venit ca lead) — completăm criteriile de căutare lipsă + istoric
      update leads set
        city        = coalesce(city, d_city),
        county      = coalesce(county, d_county),
        category    = coalesce(category, d.category),
        transaction = coalesce(transaction, d.transaction),
        budget_min  = coalesce(budget_min, d.budget_min),
        budget_max  = coalesce(budget_max, d.budget_max),
        currency    = coalesce(currency, d.currency),
        agent_id    = coalesce(agent_id, d.agent_id),
        source      = coalesce(source, d.source),
        criteria    = coalesce(criteria, '{}'::jsonb) || coalesce(d.criteria, '{}'::jsonb)
                        || jsonb_build_object('imported_demand_id', d.id::text)
       where id = existing_lead_id;

      insert into activities (type, description, lead_id)
      values ('request', concat('Cerere migrată ', d.internal_code, coalesce(': ' || d.notes, '')), existing_lead_id);
    else
      -- Client nou, provenit exclusiv dintr-o cerere veche
      insert into leads (
        agency_id, contact_name, contact_phone, contact_email, message, status,
        received_at, source, city, county, category, transaction,
        budget_min, budget_max, currency, criteria, agent_id
      ) values (
        d.agency_id, d.full_name, d.phone, d.email, coalesce(d.notes, ''), mapped_status,
        d.created_at, d.source, d_city, d_county, d.category, d.transaction,
        d.budget_min, d.budget_max, d.currency,
        coalesce(d.criteria, '{}'::jsonb) || jsonb_build_object('imported_demand_id', d.id::text),
        d.agent_id
      )
      returning id into existing_lead_id;

      insert into activities (type, description, lead_id)
      values ('created', concat('Client creat din cererea migrată ', d.internal_code), existing_lead_id);
    end if;
  end loop;
end $$;

-- ── Raport: cereri care NU au putut fi importate automat (fără contact sau fără telefon) ──
select
  dm.internal_code,
  dm.category,
  dm.status,
  dm.contact_id,
  c.full_name,
  c.phone,
  case
    when dm.contact_id is null then 'fără contact atașat'
    when c.phone is null or trim(c.phone) = '' then 'contact fără telefon'
  end as motiv
from demands dm
left join contacts c on c.id = dm.contact_id
where dm.contact_id is null or c.phone is null or trim(c.phone) = '';
