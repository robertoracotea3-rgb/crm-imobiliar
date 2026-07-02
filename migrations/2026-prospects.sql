-- ============================================================================
-- Modul „Anunțuri particulari" (prospectare) — tabel IZOLAT de restul CRM-ului.
-- Rulează în Supabase → SQL Editor (o singură dată). Idempotent.
-- ============================================================================

create table if not exists prospects (
  id            uuid default gen_random_uuid() primary key,
  agency_id     uuid references agencies(id) on delete cascade not null,
  source        text not null,            -- 'olx' | 'publi24' | 'homezz' | 'romimo'
  external_id   text not null,            -- id-ul anunțului la sursă (dedup per sursă)
  url           text not null,
  title         text,
  price         numeric,
  currency      text default 'EUR',
  category      text,                     -- apartament | casa | teren | comercial (best-effort)
  transaction   text,                     -- vanzare | inchiriere (best-effort)
  city          text,
  zone          text,
  phone         text,                     -- best-effort (Publi24 des, OLX nu-l expune în listă)
  seller_name   text,
  alt_sources   text[],                   -- alte portaluri unde a apărut același telefon
  posted_at     timestamptz,             -- data anunțului la sursă (best-effort)
  status        text default 'nou',       -- nou | contactat | refuzat | mandat
  assigned_to   uuid references auth.users(id),
  notes         text,
  first_seen_at timestamptz default now(),
  last_seen_at  timestamptz default now()
);

-- Dedup per sursă: același anunț nu se dublează la refresh.
create unique index if not exists uq_prospects_src on prospects(agency_id, source, external_id);
create index if not exists idx_prospects_agency on prospects(agency_id, status, last_seen_at desc);
-- Dedup cross-sursă pe telefon (același număr pe 2 portaluri).
create index if not exists idx_prospects_phone on prospects(agency_id, phone) where phone is not null;

alter table prospects disable row level security;
grant all on table prospects to anon, authenticated, service_role;
