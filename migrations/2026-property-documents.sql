-- ============================================================================
-- Migrare: modul Documente proprietate (property_documents)
-- Rulează în Supabase → SQL Editor (o singură dată). Idempotent — poate fi
-- rulat de mai multe ori fără efecte secundare.
-- Bucket-ul privat 'property-documents' se creează automat din cod la primul
-- upload (nu trebuie creat manual).
-- ============================================================================

create table if not exists property_documents (
  id           uuid default gen_random_uuid() primary key,
  agency_id    uuid references agencies(id) on delete cascade not null,
  property_id  uuid references properties(id) on delete cascade not null,
  uploaded_by  uuid references auth.users(id),
  category     text not null,          -- 'contract' | 'extras_cf' | 'cert_energetic' | 'act_proprietar' | 'altele'
  file_name    text not null,
  storage_path text not null,
  mime_type    text,
  size         bigint,
  created_at   timestamptz default now()
);
create index if not exists idx_property_documents_property on property_documents(property_id, created_at desc);

-- RLS dezactivat (ca restul tabelelor; izolarea se face prin agency_id în cod).
alter table property_documents disable row level security;

-- GRANT-uri: tabelele create din SQL Editor nu primesc automat drepturile
-- pentru rolurile Supabase, altfel apare „permission denied for table ...".
grant all on table property_documents to anon, authenticated, service_role;
