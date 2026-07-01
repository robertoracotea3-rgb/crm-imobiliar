-- ============================================================
-- Modul CLIENȚI — unifică Lead-uri + Cereri pe tabela `leads`
-- Rulează în Supabase Dashboard → SQL Editor → Run.
-- Idempotent: se poate rula de mai multe ori fără efecte secundare.
-- ============================================================

-- 1) Câmpuri noi pe leads (client = persoană + criterii de căutare)
alter table leads add column if not exists agent_id    uuid references auth.users(id);
alter table leads add column if not exists source      text;
alter table leads add column if not exists city        text;
alter table leads add column if not exists county      text;
alter table leads add column if not exists category    text;
alter table leads add column if not exists transaction text;
alter table leads add column if not exists budget_min  numeric;
alter table leads add column if not exists budget_max  numeric;
alter table leads add column if not exists currency    text;
alter table leads add column if not exists criteria    jsonb default '{}'::jsonb;

create index if not exists idx_leads_agent  on leads(agent_id);
create index if not exists idx_leads_status on leads(status);

-- 2) Timeline / istoric client — aditiv, ca să funcționeze indiferent dacă tabela
-- `activities` există deja (posibil cu altă structură dintr-o versiune anterioară)
-- sau nu există deloc.
create table if not exists activities (
  id         uuid default gen_random_uuid() primary key,
  created_at timestamptz default now()
);
alter table activities add column if not exists type        text;
alter table activities add column if not exists description text;
alter table activities add column if not exists lead_id     uuid references leads(id) on delete cascade;
alter table activities add column if not exists user_id     uuid references auth.users(id);
create index if not exists idx_activities_lead on activities(lead_id, created_at desc);
alter table activities disable row level security;
grant all on table activities to anon, authenticated, service_role;

-- 3) Backfill: completează agent/oraș/categorie din proprietatea legată
-- p.category este tip enum (property_category), p.city/p.county pot fi text —
-- cast la ::text ca să se potrivească cu coloanele text din leads.
update leads l
   set agent_id = coalesce(l.agent_id, p.agent_id),
       city     = coalesce(l.city,     p.city::text),
       county   = coalesce(l.county,   p.county::text),
       category = coalesce(l.category, p.category::text)
  from properties p
 where l.property_id = p.id;
