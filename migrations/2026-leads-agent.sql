-- ============================================================
-- Lead-uri: agent atribuit + auto-atribuire după proprietate
-- Rulează în Supabase Dashboard → SQL Editor → Run.
-- Idempotent: se poate rula de mai multe ori fără efecte secundare.
-- ============================================================

-- 1) Coloană agent pe leads (cui îi este atribuit lead-ul)
alter table leads add column if not exists agent_id uuid references auth.users(id);
create index if not exists idx_leads_agent on leads(agent_id);

-- 2) Backfill: lead-urile legate de o proprietate primesc agentul acelei proprietăți
update leads l
   set agent_id = p.agent_id
  from properties p
 where l.property_id = p.id
   and l.agent_id is null
   and p.agent_id is not null;
