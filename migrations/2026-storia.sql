-- ============================================================
-- Migrare: integrare Storia / OLX Partner API
-- Rulați manual în Supabase SQL Editor
-- ============================================================

-- Tokens OAuth2 per agenție, per portal
create table if not exists portal_tokens (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null,
  portal         text not null default 'storia',
  access_token   text,
  refresh_token  text,
  token_type     text default 'Bearer',
  expires_at     timestamptz,
  scope          text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  unique(agency_id, portal)
);

-- Anunțuri publicate pe portale externe
create table if not exists portal_listings (
  id              uuid primary key default gen_random_uuid(),
  agency_id       uuid not null,
  property_id     uuid not null,
  portal          text not null default 'storia',
  external_id     text,                          -- ID-ul anunțului pe Storia
  status          text default 'pending',        -- pending / active / rejected / expired / deleted / error
  advert_url      text,                          -- URL-ul public al anunțului
  last_sync_at    timestamptz,
  error_message   text,
  raw_response    jsonb,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique(property_id, portal)
);

create index if not exists portal_listings_property_idx on portal_listings(property_id);
create index if not exists portal_listings_agency_idx   on portal_listings(agency_id);
create index if not exists portal_tokens_agency_idx     on portal_tokens(agency_id);

grant all on table portal_tokens   to anon, authenticated, service_role;
grant all on table portal_listings to anon, authenticated, service_role;
alter table portal_tokens   disable row level security;
alter table portal_listings disable row level security;
