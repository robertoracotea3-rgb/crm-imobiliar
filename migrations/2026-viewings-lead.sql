-- ============================================================
-- Vizionări: leagă vizionarea de un CLIENT (leads), nu doar de o cerere veche.
-- Rulează în Supabase Dashboard → SQL Editor → Run.
-- Idempotent.
-- ============================================================
alter table calendar_events add column if not exists lead_id uuid references leads(id) on delete set null;
create index if not exists idx_calendar_events_lead on calendar_events(lead_id);
