-- ============================================================================
-- Migrare: funcționalități noi (iunie 2026)
-- Rulează acest fișier în Supabase → SQL Editor (o singură dată).
-- Idempotent: poate fi rulat de mai multe ori fără efecte secundare.
-- ============================================================================

-- 1) Istoric modificări (activity_logs) ---------------------------------------
create table if not exists activity_logs (
  id          uuid default gen_random_uuid() primary key,
  agency_id   uuid references agencies(id) on delete cascade,
  entity_type text not null,          -- 'property' | 'lead' | 'task' | ...
  entity_id   uuid not null,
  user_id     uuid references auth.users(id),
  user_name   text,
  action      text not null,          -- 'create' | 'update' | 'status' | 'delete' | 'document'
  field       text,                   -- câmpul modificat (pentru action='update')
  old_value   text,
  new_value   text,
  created_at  timestamptz default now()
);
create index if not exists idx_activity_logs_entity on activity_logs(entity_type, entity_id, created_at desc);
create index if not exists idx_activity_logs_agency on activity_logs(agency_id, created_at desc);

-- 2) Taskuri & remindere (tasks) ----------------------------------------------
create table if not exists tasks (
  id           uuid default gen_random_uuid() primary key,
  agency_id    uuid references agencies(id) on delete cascade not null,
  created_by   uuid references auth.users(id),
  assigned_to  uuid references auth.users(id),
  title        text not null,
  description  text,
  priority     text default 'medie',  -- 'mica' | 'medie' | 'mare'
  status       text default 'open',   -- 'open' | 'done'
  due_at       timestamptz,
  property_id  uuid references properties(id) on delete set null,
  lead_id      uuid references leads(id) on delete set null,
  completed_at timestamptz,
  created_at   timestamptz default now()
);
create index if not exists idx_tasks_agency on tasks(agency_id, status, due_at);

-- 3) Documente proprietate (property_documents) -------------------------------
create table if not exists property_documents (
  id          uuid default gen_random_uuid() primary key,
  agency_id   uuid references agencies(id) on delete cascade not null,
  property_id uuid references properties(id) on delete cascade not null,
  uploaded_by uuid references auth.users(id),
  category    text not null,          -- 'contract' | 'extras_cf' | 'cert_energetic' | 'act_proprietar' | 'altele'
  file_name   text not null,
  storage_path text not null,
  mime_type   text,
  size        bigint,
  created_at  timestamptz default now()
);
create index if not exists idx_property_documents_property on property_documents(property_id, created_at desc);

-- 4) Vizionări: reutilizăm calendar_events (type='vizionare') + status/rezultat
alter table calendar_events add column if not exists status    text;  -- 'programata' | 'efectuata' | 'anulata' | 'amanata'
alter table calendar_events add column if not exists outcome   text;  -- observații rezultat vizionare
alter table calendar_events add column if not exists demand_id uuid references demands(id) on delete set null;  -- cererea asociată vizionării

-- 5) Tranzacții financiare (transactions) ------------------------------------
create table if not exists transactions (
  id                uuid default gen_random_uuid() primary key,
  agency_id         uuid references agencies(id) on delete cascade not null,
  property_id       uuid references properties(id) on delete set null,
  agent_id          uuid references auth.users(id),
  contact_id        uuid references contacts(id) on delete set null,
  type              text default 'vanzare',   -- 'vanzare' | 'inchiriere'
  sale_price        numeric default 0,
  currency          text default 'EUR',
  agency_commission numeric default 0,        -- comision agenție
  agent_commission  numeric default 0,        -- comision care merge la agent
  closed_at         date,                      -- data finalizării tranzacției
  notes             text,
  created_by        uuid references auth.users(id),
  created_at        timestamptz default now()
);
create index if not exists idx_transactions_agency on transactions(agency_id, closed_at desc);

-- 6) RLS dezactivat (ca restul tabelelor; izolarea se face prin agency_id în cod)
alter table activity_logs      disable row level security;
alter table tasks              disable row level security;
alter table property_documents disable row level security;
alter table transactions       disable row level security;

-- 7) Drepturi de acces (tabelele create din SQL editor nu primesc automat GRANT-urile
--    pentru rolurile Supabase → altfel apare "permission denied for table ...")
grant all on table activity_logs, tasks, property_documents, transactions
  to anon, authenticated, service_role;
