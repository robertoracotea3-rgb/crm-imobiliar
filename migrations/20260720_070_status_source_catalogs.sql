-- Phase 10 (mandatory order step 8): controlled CRM statuses and lead sources.
-- Historical labels remain available in legacy_* columns; source stays untouched.

begin;

create table if not exists public.lead_sources (
  code text primary key,
  display_name text not null,
  display_order integer not null,
  category text not null,
  ui_color text not null default 'gray',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_statuses (
  code text primary key,
  display_name text not null,
  display_order integer not null,
  category text not null,
  ui_color text not null,
  is_active boolean not null default true,
  is_terminal boolean not null default false,
  requires_next_action boolean not null default false
);

create table if not exists public.property_statuses (
  code text primary key,
  display_name text not null,
  display_order integer not null,
  category text not null,
  ui_color text not null,
  is_active boolean not null default true,
  is_terminal boolean not null default false,
  requires_next_action boolean not null default false
);

create table if not exists public.viewing_statuses (
  code text primary key,
  display_name text not null,
  display_order integer not null,
  category text not null,
  ui_color text not null,
  is_active boolean not null default true,
  is_terminal boolean not null default false,
  requires_next_action boolean not null default false
);

create table if not exists public.transaction_statuses (
  code text primary key,
  display_name text not null,
  display_order integer not null,
  category text not null,
  ui_color text not null,
  is_active boolean not null default true,
  is_terminal boolean not null default false,
  requires_next_action boolean not null default false
);

create table if not exists public.activity_types (
  code text primary key,
  display_name text not null,
  display_order integer not null,
  category text not null,
  ui_color text not null default 'gray',
  is_active boolean not null default true
);

create table if not exists public.crm_status_transitions (
  entity_type text not null check (entity_type in ('lead', 'property', 'viewing', 'transaction')),
  from_code text not null,
  to_code text not null,
  is_active boolean not null default true,
  primary key (entity_type, from_code, to_code)
);

create table if not exists public.lead_source_aliases (
  alias_key text primary key,
  source_code text not null references public.lead_sources(code),
  historical_label text
);

create table if not exists public.crm_status_aliases (
  entity_type text not null check (entity_type in ('lead', 'property', 'viewing', 'transaction')),
  alias_key text not null,
  status_code text not null,
  primary key (entity_type, alias_key)
);

create table if not exists public.crm_normalization_runs (
  id uuid primary key default gen_random_uuid(),
  migration_key text not null unique,
  summary jsonb not null,
  created_at timestamptz not null default now()
);

insert into public.lead_sources(code, display_name, display_order, category, ui_color, is_active) values
  ('storia_olx', 'Storia.ro + OLX.ro', 10, 'portal', 'violet', true),
  ('storia', 'Storia.ro', 20, 'portal', 'violet', true),
  ('olx', 'OLX.ro', 30, 'portal', 'blue', true),
  ('website', 'Site propriu', 40, 'owned', 'emerald', true),
  ('imobiliare', 'Imobiliare.ro', 50, 'portal', 'indigo', true),
  ('facebook', 'Facebook', 60, 'social', 'blue', true),
  ('referral', 'Recomandare', 70, 'referral', 'amber', true),
  ('evaluation', 'Evaluare gratuită', 80, 'owned', 'emerald', true),
  ('direct', 'Contact direct', 90, 'direct', 'gray', true),
  ('manual', 'Manual', 100, 'manual', 'gray', true),
  ('banner', 'Banner', 110, 'campaign', 'orange', true),
  ('other', 'Altă sursă', 999, 'other', 'gray', true)
on conflict (code) do update set
  display_name = excluded.display_name,
  display_order = excluded.display_order,
  category = excluded.category,
  ui_color = excluded.ui_color,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.lead_statuses values
  ('new', 'Lead nou', 10, 'open', 'green', true, false, true),
  ('contacted', 'Contactat', 20, 'open', 'blue', true, false, true),
  ('no_answer', 'Nu a răspuns', 30, 'open', 'gray', true, false, true),
  ('to_send_offers', 'De trimis oferte', 40, 'qualified', 'amber', true, false, true),
  ('in_progress', 'Calificat / în lucru', 50, 'qualified', 'sky', true, false, true),
  ('upcoming_viewing', 'Urmează vizionare', 60, 'viewing', 'violet', true, false, true),
  ('viewing', 'Vizionare efectuată', 70, 'viewing', 'purple', true, false, true),
  ('negotiation', 'Negociere', 80, 'closing', 'orange', true, false, true),
  ('precontract', 'Rezervat / antecontract', 90, 'closing', 'yellow', true, false, true),
  ('won', 'Finalizat', 100, 'closed_won', 'emerald', true, true, false),
  ('lost', 'Pierdut', 110, 'closed_lost', 'red', true, true, false),
  ('withdrawn', 'Retras', 120, 'closed_lost', 'gray', true, true, false)
on conflict (code) do update set display_name=excluded.display_name, display_order=excluded.display_order,
  category=excluded.category, ui_color=excluded.ui_color, is_active=excluded.is_active,
  is_terminal=excluded.is_terminal, requires_next_action=excluded.requires_next_action;

insert into public.property_statuses values
  ('draft', 'Draft', 10, 'preparation', 'yellow', true, false, false),
  ('activa', 'Activă', 20, 'active', 'emerald', true, false, false),
  ('rezervata', 'Rezervată', 30, 'closing', 'blue', true, false, false),
  ('tranzactionata', 'Tranzacționată', 40, 'closed', 'purple', true, true, false),
  ('inchiriata', 'Închiriată', 50, 'closed', 'indigo', true, true, false),
  ('retrasa', 'Retrasă', 60, 'inactive', 'gray', true, true, false),
  ('expirata', 'Expirată', 70, 'inactive', 'orange', true, false, false),
  ('arhivata', 'Arhivată', 80, 'archived', 'red', true, true, false)
on conflict (code) do update set display_name=excluded.display_name, display_order=excluded.display_order,
  category=excluded.category, ui_color=excluded.ui_color, is_active=excluded.is_active,
  is_terminal=excluded.is_terminal, requires_next_action=excluded.requires_next_action;

insert into public.viewing_statuses values
  ('programata', 'Programată', 10, 'open', 'blue', true, false, false),
  ('confirmata', 'Confirmată', 20, 'open', 'cyan', true, false, false),
  ('amanata', 'Amânată', 30, 'open', 'amber', true, false, false),
  ('efectuata', 'Efectuată', 40, 'closed', 'emerald', true, true, false),
  ('anulata', 'Anulată', 50, 'cancelled', 'red', true, true, false)
on conflict (code) do update set display_name=excluded.display_name, display_order=excluded.display_order,
  category=excluded.category, ui_color=excluded.ui_color, is_active=excluded.is_active,
  is_terminal=excluded.is_terminal, requires_next_action=excluded.requires_next_action;

insert into public.transaction_statuses values
  ('draft', 'Draft', 10, 'open', 'gray', true, false, false),
  ('negociere', 'Negociere', 20, 'open', 'orange', true, false, false),
  ('rezervata', 'Rezervată', 30, 'closing', 'blue', true, false, false),
  ('antecontract', 'Antecontract', 40, 'closing', 'yellow', true, false, false),
  ('finalizata', 'Finalizată', 50, 'closed', 'emerald', true, true, false),
  ('anulata', 'Anulată', 60, 'cancelled', 'red', true, true, false)
on conflict (code) do update set display_name=excluded.display_name, display_order=excluded.display_order,
  category=excluded.category, ui_color=excluded.ui_color, is_active=excluded.is_active,
  is_terminal=excluded.is_terminal, requires_next_action=excluded.requires_next_action;

insert into public.activity_types(code, display_name, display_order, category, ui_color, is_active) values
  ('created', 'Creat', 10, 'system', 'gray', true),
  ('request', 'Solicitare', 20, 'lead', 'blue', true),
  ('status', 'Schimbare status', 30, 'system', 'gray', true),
  ('note', 'Notiță', 40, 'manual', 'yellow', true),
  ('association', 'Asociere', 50, 'system', 'violet', true),
  ('whatsapp_opened', 'WhatsApp deschis', 60, 'contact', 'green', true),
  ('whatsapp_confirmed_sent', 'WhatsApp confirmat trimis', 70, 'contact', 'green', true),
  ('whatsapp_not_sent', 'WhatsApp netrimis', 80, 'contact', 'gray', true),
  ('whatsapp_unreachable', 'WhatsApp indisponibil', 90, 'contact', 'red', true),
  ('viewing_scheduled', 'Vizionare programată', 100, 'viewing', 'blue', true),
  ('viewing_confirm', 'Vizionare confirmată', 110, 'viewing', 'cyan', true),
  ('viewing_reschedule', 'Vizionare reprogramată', 120, 'viewing', 'amber', true),
  ('viewing_cancel', 'Vizionare anulată', 130, 'viewing', 'red', true),
  ('viewing_complete', 'Vizionare efectuată', 140, 'viewing', 'emerald', true)
on conflict (code) do update set display_name=excluded.display_name, display_order=excluded.display_order,
  category=excluded.category, ui_color=excluded.ui_color, is_active=excluded.is_active;

create or replace function public.crm_normalize_key(raw_value text)
returns text language sql immutable parallel safe
as $$
  select trim(both '_' from regexp_replace(
    lower(translate(coalesce(raw_value, ''), 'ăâîșşțţĂÂÎȘŞȚŢ', 'aaissttAAISSTT')),
    '[^a-z0-9]+', '_', 'g'
  ))
$$;

insert into public.lead_source_aliases(alias_key, source_code, historical_label) values
  ('storia_ro_olx_ro', 'storia_olx', 'Storia.ro + Olx.ro'),
  ('storia_olx', 'storia_olx', 'Storia + OLX'),
  ('olx_storia', 'storia_olx', 'OLX + Storia'),
  ('storia', 'storia', 'Storia'), ('storia_ro', 'storia', 'Storia.ro'),
  ('olx', 'olx', 'OLX'), ('olx_ro', 'olx', 'Olx.ro'),
  ('site', 'website', 'Site'), ('website', 'website', 'Website'), ('site_propriu', 'website', 'Site propriu'),
  ('imobiliare', 'imobiliare', 'Imobiliare'), ('imobiliare_ro', 'imobiliare', 'Imobiliare.ro'),
  ('facebook', 'facebook', 'Facebook'),
  ('prieteni_cunostinte', 'referral', 'Prieteni/Cunoștințe'), ('recomandare', 'referral', 'Recomandare'), ('referral', 'referral', 'Recomandare'),
  ('evaluare_gratuita', 'evaluation', 'Evaluare gratuită'), ('evaluation', 'evaluation', 'Evaluare gratuită'),
  ('contact', 'direct', 'Contact'), ('contact_direct', 'direct', 'Contact direct'), ('direct', 'direct', 'Contact direct'),
  ('manual', 'manual', 'Manual'), ('lead', 'manual', 'Lead'),
  ('banner', 'banner', 'Banner'), ('other', 'other', 'Altă sursă')
on conflict (alias_key) do update set source_code=excluded.source_code, historical_label=excluded.historical_label;

insert into public.crm_status_aliases(entity_type, alias_key, status_code) values
  ('lead','new','new'), ('lead','nou','new'), ('lead','lead_nou','new'),
  ('lead','contacted','contacted'), ('lead','contactat','contacted'), ('lead','replied','contacted'),
  ('lead','no_answer','no_answer'), ('lead','nu_a_raspuns','no_answer'),
  ('lead','to_send_offers','to_send_offers'), ('lead','de_trimis_oferte','to_send_offers'),
  ('lead','in_progress','in_progress'), ('lead','in_lucru','in_progress'), ('lead','calificat','in_progress'),
  ('lead','upcoming_viewing','upcoming_viewing'), ('lead','urmeaza_vizionare','upcoming_viewing'),
  ('lead','viewing','viewing'), ('lead','vizionare','viewing'),
  ('lead','negotiation','negotiation'), ('lead','negociere','negotiation'),
  ('lead','precontract','precontract'), ('lead','antecontract','precontract'), ('lead','rezervat','precontract'),
  ('lead','won','won'), ('lead','finalizat','won'), ('lead','vandut','won'),
  ('lead','lost','lost'), ('lead','pierdut','lost'),
  ('lead','withdrawn','withdrawn'), ('lead','retras','withdrawn'),
  ('property','draft','draft'), ('property','activa','activa'), ('property','activ','activa'), ('property','active','activa'),
  ('property','rezervata','rezervata'), ('property','rezervat','rezervata'), ('property','reserved','rezervata'),
  ('property','tranzactionata','tranzactionata'), ('property','vanduta','tranzactionata'), ('property','sold','tranzactionata'),
  ('property','inchiriata','inchiriata'), ('property','rented','inchiriata'), ('property','retrasa','retrasa'),
  ('property','expirata','expirata'), ('property','arhivata','arhivata'),
  ('viewing','programata','programata'), ('viewing','confirmata','confirmata'),
  ('viewing','amanata','amanata'), ('viewing','efectuata','efectuata'), ('viewing','anulata','anulata'),
  ('transaction','draft','draft'), ('transaction','negociere','negociere'),
  ('transaction','rezervata','rezervata'), ('transaction','antecontract','antecontract'),
  ('transaction','finalizata','finalizata'), ('transaction','finalizata_import','finalizata'),
  ('transaction','anulata','anulata')
on conflict (entity_type, alias_key) do update set status_code=excluded.status_code;

create or replace function public.crm_normalize_source(raw_value text)
returns text language plpgsql stable set search_path=public, pg_temp
as $$
declare result text;
begin
  if raw_value is null or btrim(raw_value) = '' then return null; end if;
  if public.crm_normalize_key(raw_value) like '%storia%' and public.crm_normalize_key(raw_value) like '%olx%' then
    return 'storia_olx';
  end if;
  select source_code into result from public.lead_source_aliases
   where alias_key = public.crm_normalize_key(raw_value);
  return coalesce(result, 'other');
end;
$$;

create or replace function public.crm_normalize_status(entity_name text, raw_value text)
returns text language sql stable set search_path=public, pg_temp
as $$
  select status_code from public.crm_status_aliases
  where entity_type=entity_name and alias_key=public.crm_normalize_key(raw_value)
$$;

alter table public.leads add column if not exists status text default 'new';
alter table public.leads add column if not exists legacy_status text;
alter table public.leads add column if not exists legacy_source text;
alter table public.leads add column if not exists source text;
alter table public.leads add column if not exists source_normalized text;
alter table public.leads add column if not exists next_action_at timestamptz;
alter table public.leads add column if not exists next_action_type text;
alter table public.leads add column if not exists status_reason text;
alter table public.leads add column if not exists status_note text;
alter table public.leads add column if not exists lost_to_competitor text;

alter table public.properties add column if not exists status text default 'draft';
alter table public.properties add column if not exists legacy_status text;
alter table public.properties add column if not exists status_reason text;

alter table public.calendar_events add column if not exists type text;
alter table public.calendar_events add column if not exists status text;
alter table public.calendar_events add column if not exists legacy_status text;
alter table public.calendar_events add column if not exists cancellation_reason text;
alter table public.calendar_events add column if not exists outcome text;

alter table public.transactions add column if not exists status text;
alter table public.transactions add column if not exists legacy_status text;
alter table public.transactions add column if not exists status_reason text;

alter table public.demands add column if not exists status text default 'activa';
alter table public.demands add column if not exists legacy_status text;
alter table public.demands add column if not exists source text;
alter table public.demands add column if not exists source_normalized text;
alter table public.demands add column if not exists legacy_source text;

alter table public.activities add column if not exists type text;
alter table public.activities add column if not exists legacy_type text;

update public.leads
set legacy_source=coalesce(legacy_source, source), source_normalized=public.crm_normalize_source(source)
where source is not null and (source_normalized is null or source_normalized <> public.crm_normalize_source(source));

update public.demands
set legacy_source=coalesce(legacy_source, source), source_normalized=public.crm_normalize_source(source)
where source is not null and (source_normalized is null or source_normalized <> public.crm_normalize_source(source));

update public.leads
set legacy_source=coalesce(legacy_source, source_normalized), source_normalized=public.crm_normalize_source(source_normalized)
where source is null and source_normalized is not null
  and source_normalized is distinct from public.crm_normalize_source(source_normalized);

update public.demands
set legacy_source=coalesce(legacy_source, source_normalized), source_normalized=public.crm_normalize_source(source_normalized)
where source is null and source_normalized is not null
  and source_normalized is distinct from public.crm_normalize_source(source_normalized);

update public.leads
set legacy_status=coalesce(legacy_status, status), status=coalesce(public.crm_normalize_status('lead', status), 'in_progress')
where status is null or public.crm_normalize_status('lead', status) is distinct from status;

update public.properties
set legacy_status=coalesce(legacy_status, status), status=coalesce(public.crm_normalize_status('property', status), 'draft')
where status is null or public.crm_normalize_status('property', status) is distinct from status;

update public.calendar_events
set legacy_status=coalesce(legacy_status, status, '__NULL__'), status=coalesce(public.crm_normalize_status('viewing', status), 'programata')
where type='vizionare' and (status is null or public.crm_normalize_status('viewing', status) is distinct from status);

update public.transactions t
set legacy_status=coalesce(legacy_status, status, '__NULL__'),
    status=coalesce(public.crm_normalize_status('transaction', status),
      case when nullif(to_jsonb(t)->>'closed_at', '') is not null then 'finalizata' else 'draft' end)
where status is null or public.crm_normalize_status('transaction', status) is distinct from status;

update public.demands set legacy_status=coalesce(legacy_status, status), status='activa'
where status is null;

-- Unknown historical activity codes become inactive catalog entries instead of being deleted.
insert into public.activity_types(code, display_name, display_order, category, ui_color, is_active)
select distinct a.type, a.type, 900, 'legacy', 'gray', false
from public.activities a
where a.type is not null and not exists (select 1 from public.activity_types t where t.code=a.type)
on conflict (code) do nothing;

-- Every active lead gets a deterministic follow-up. Existing future values are preserved.
update public.leads l
set next_action_at=now() + interval '1 day', next_action_type=coalesce(next_action_type, 'follow_up')
where exists (select 1 from public.lead_statuses s where s.code=l.status and s.requires_next_action)
  and (l.next_action_at is null or l.next_action_type is null);

insert into public.crm_status_transitions(entity_type, from_code, to_code) values
  ('lead','new','contacted'), ('lead','new','no_answer'), ('lead','new','in_progress'), ('lead','new','lost'), ('lead','new','withdrawn'),
  ('lead','contacted','no_answer'), ('lead','contacted','to_send_offers'), ('lead','contacted','in_progress'), ('lead','contacted','upcoming_viewing'), ('lead','contacted','negotiation'), ('lead','contacted','lost'), ('lead','contacted','withdrawn'),
  ('lead','no_answer','contacted'), ('lead','no_answer','in_progress'), ('lead','no_answer','lost'), ('lead','no_answer','withdrawn'),
  ('lead','to_send_offers','contacted'), ('lead','to_send_offers','in_progress'), ('lead','to_send_offers','upcoming_viewing'), ('lead','to_send_offers','lost'), ('lead','to_send_offers','withdrawn'),
  ('lead','in_progress','contacted'), ('lead','in_progress','no_answer'), ('lead','in_progress','to_send_offers'), ('lead','in_progress','upcoming_viewing'), ('lead','in_progress','viewing'), ('lead','in_progress','negotiation'), ('lead','in_progress','precontract'), ('lead','in_progress','won'), ('lead','in_progress','lost'), ('lead','in_progress','withdrawn'),
  ('lead','upcoming_viewing','viewing'), ('lead','upcoming_viewing','in_progress'), ('lead','upcoming_viewing','contacted'), ('lead','upcoming_viewing','lost'), ('lead','upcoming_viewing','withdrawn'),
  ('lead','viewing','upcoming_viewing'), ('lead','viewing','negotiation'), ('lead','viewing','in_progress'), ('lead','viewing','lost'), ('lead','viewing','withdrawn'),
  ('lead','negotiation','precontract'), ('lead','negotiation','in_progress'), ('lead','negotiation','won'), ('lead','negotiation','lost'), ('lead','negotiation','withdrawn'),
  ('lead','precontract','negotiation'), ('lead','precontract','won'), ('lead','precontract','lost'), ('lead','precontract','withdrawn'),
  ('lead','won','in_progress'), ('lead','lost','in_progress'), ('lead','withdrawn','in_progress'),
  ('property','draft','activa'), ('property','draft','arhivata'),
  ('property','activa','draft'), ('property','activa','rezervata'), ('property','activa','tranzactionata'), ('property','activa','inchiriata'), ('property','activa','retrasa'), ('property','activa','expirata'), ('property','activa','arhivata'),
  ('property','rezervata','activa'), ('property','rezervata','tranzactionata'), ('property','rezervata','inchiriata'), ('property','rezervata','retrasa'), ('property','rezervata','arhivata'),
  ('property','tranzactionata','activa'), ('property','tranzactionata','arhivata'), ('property','inchiriata','activa'), ('property','inchiriata','arhivata'),
  ('property','retrasa','activa'), ('property','retrasa','arhivata'), ('property','expirata','activa'), ('property','expirata','retrasa'), ('property','expirata','arhivata'), ('property','arhivata','draft'), ('property','arhivata','activa'),
  ('viewing','programata','confirmata'), ('viewing','programata','amanata'), ('viewing','programata','efectuata'), ('viewing','programata','anulata'),
  ('viewing','confirmata','amanata'), ('viewing','confirmata','efectuata'), ('viewing','confirmata','anulata'),
  ('viewing','amanata','programata'), ('viewing','amanata','confirmata'), ('viewing','amanata','efectuata'), ('viewing','amanata','anulata'), ('viewing','anulata','programata'),
  ('transaction','draft','negociere'), ('transaction','draft','rezervata'), ('transaction','draft','antecontract'), ('transaction','draft','finalizata'), ('transaction','draft','anulata'),
  ('transaction','negociere','draft'), ('transaction','negociere','rezervata'), ('transaction','negociere','antecontract'), ('transaction','negociere','finalizata'), ('transaction','negociere','anulata'),
  ('transaction','rezervata','negociere'), ('transaction','rezervata','antecontract'), ('transaction','rezervata','finalizata'), ('transaction','rezervata','anulata'),
  ('transaction','antecontract','negociere'), ('transaction','antecontract','finalizata'), ('transaction','antecontract','anulata'),
  ('transaction','finalizata','draft'), ('transaction','anulata','draft')
on conflict (entity_type, from_code, to_code) do update set is_active=true;

create or replace function public.enforce_crm_status_transition()
returns trigger language plpgsql security invoker set search_path=public, pg_temp
as $$
declare
  catalog_table text := tg_argv[1];
  known_status boolean;
  requires_action boolean := false;
  payload jsonb := to_jsonb(new);
begin
  if tg_argv[0]='viewing' and coalesce(payload->>'type','') <> 'vizionare' then return new; end if;
  if new.status is null then raise exception 'crm_status_required:%', tg_argv[0]; end if;

  execute format('select exists(select 1 from public.%I where code=$1 and is_active)', catalog_table)
    into known_status using new.status;
  if not known_status then raise exception 'crm_status_invalid:%:%', tg_argv[0], new.status; end if;

  if tg_op='UPDATE' and old.status is distinct from new.status and not exists (
    select 1 from public.crm_status_transitions
    where entity_type=tg_argv[0] and from_code=old.status and to_code=new.status and is_active
  ) then
    raise exception 'crm_status_transition_invalid:%:%:%', tg_argv[0], old.status, new.status;
  end if;

  if tg_argv[0]='lead' then
    select requires_next_action into requires_action from public.lead_statuses where code=new.status;
    if requires_action and (nullif(payload->>'next_action_at','') is null or nullif(payload->>'next_action_type','') is null) then
      raise exception 'lead_next_action_required:%', new.status;
    end if;
    if requires_action and (payload->>'next_action_at')::timestamptz <= now() then
      raise exception 'lead_next_action_must_be_future:%', new.status;
    end if;
    if new.status='lost' and (nullif(btrim(payload->>'status_reason'),'') is null or nullif(btrim(payload->>'status_note'),'') is null) then
      raise exception 'lead_lost_details_required';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_lead_status_transition on public.leads;
create trigger enforce_lead_status_transition before insert or update of status, next_action_at, next_action_type, status_reason, status_note
on public.leads for each row execute function public.enforce_crm_status_transition('lead','lead_statuses');

drop trigger if exists enforce_property_status_transition on public.properties;
create trigger enforce_property_status_transition before insert or update of status
on public.properties for each row execute function public.enforce_crm_status_transition('property','property_statuses');

drop trigger if exists enforce_viewing_status_transition on public.calendar_events;
create trigger enforce_viewing_status_transition before insert or update of status
on public.calendar_events for each row execute function public.enforce_crm_status_transition('viewing','viewing_statuses');

drop trigger if exists enforce_transaction_status_transition on public.transactions;
create trigger enforce_transaction_status_transition before insert or update of status
on public.transactions for each row execute function public.enforce_crm_status_transition('transaction','transaction_statuses');

alter table public.leads drop constraint if exists leads_source_normalized_fk;
alter table public.leads add constraint leads_source_normalized_fk foreign key(source_normalized) references public.lead_sources(code) not valid;
alter table public.leads validate constraint leads_source_normalized_fk;
alter table public.demands drop constraint if exists demands_source_normalized_fk;
alter table public.demands add constraint demands_source_normalized_fk foreign key(source_normalized) references public.lead_sources(code) not valid;
alter table public.demands validate constraint demands_source_normalized_fk;
alter table public.activities drop constraint if exists activities_type_fk;
alter table public.activities add constraint activities_type_fk foreign key(type) references public.activity_types(code) not valid;
alter table public.activities validate constraint activities_type_fk;

create index if not exists leads_source_normalized_idx on public.leads(agency_id, source_normalized);
create index if not exists demands_source_normalized_idx on public.demands(agency_id, source_normalized);

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='received_at')
    and exists (select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='association_status')
    and exists (select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='deleted_at') then
    drop index if exists public.leads_unmatched_storia_idx;
    execute 'create index leads_unmatched_storia_idx on public.leads(agency_id, received_at desc)
      where property_id is null and association_status=''pending''
        and source_normalized in (''storia'',''olx'',''storia_olx'') and deleted_at is null';
  end if;
end $$;

insert into public.crm_normalization_runs(migration_key, summary)
select '20260720_070', jsonb_build_object(
  'lead_sources_normalized', (select count(*) from public.leads where legacy_source is not null),
  'demand_sources_normalized', (select count(*) from public.demands where legacy_source is not null),
  'lead_statuses_changed', (select count(*) from public.leads where legacy_status is not null),
  'property_statuses_changed', (select count(*) from public.properties where legacy_status is not null),
  'viewing_statuses_changed', (select count(*) from public.calendar_events where legacy_status is not null),
  'transaction_statuses_changed', (select count(*) from public.transactions where legacy_status is not null),
  'active_leads_with_next_action', (select count(*) from public.leads where next_action_at is not null)
)
on conflict (migration_key) do update set summary=excluded.summary, created_at=now();

alter table public.lead_sources enable row level security;
alter table public.lead_statuses enable row level security;
alter table public.property_statuses enable row level security;
alter table public.viewing_statuses enable row level security;
alter table public.transaction_statuses enable row level security;
alter table public.activity_types enable row level security;
alter table public.crm_status_transitions enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array['lead_sources','lead_statuses','property_statuses','viewing_statuses','transaction_statuses','activity_types','crm_status_transitions'] loop
    execute format('drop policy if exists %I on public.%I', 'crm_catalog_read_authenticated', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (true)', 'crm_catalog_read_authenticated', table_name);
  end loop;
end $$;

revoke all on public.lead_sources, public.lead_statuses, public.property_statuses,
  public.viewing_statuses, public.transaction_statuses, public.activity_types,
  public.crm_status_transitions, public.lead_source_aliases, public.crm_status_aliases,
  public.crm_normalization_runs from public, anon;
grant select on public.lead_sources, public.lead_statuses, public.property_statuses,
  public.viewing_statuses, public.transaction_statuses, public.activity_types,
  public.crm_status_transitions to authenticated, service_role;
grant all on public.lead_sources, public.lead_statuses, public.property_statuses,
  public.viewing_statuses, public.transaction_statuses, public.activity_types,
  public.crm_status_transitions, public.lead_source_aliases, public.crm_status_aliases,
  public.crm_normalization_runs to service_role;

commit;
