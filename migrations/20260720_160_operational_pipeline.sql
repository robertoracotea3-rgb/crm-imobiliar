-- Phase 18: a verifiable operational pipeline layered over historical statuses.
-- Existing lead.status and lead.legacy_status values are preserved.

begin;

create table if not exists public.lead_pipeline_stages (
  code text primary key,
  label text not null,
  sort_order integer not null unique,
  category text not null check(category in ('intake','qualification','viewing','closing','closed')),
  color text not null,
  entry_condition text not null,
  mandatory_actions jsonb not null default '[]'::jsonb,
  required_fields jsonb not null default '[]'::jsonb,
  automation text not null,
  requires_next_action boolean not null default true,
  is_terminal boolean not null default false,
  is_active boolean not null default true
);

create table if not exists public.lead_pipeline_transitions (
  from_stage text not null references public.lead_pipeline_stages(code),
  to_stage text not null references public.lead_pipeline_stages(code),
  is_active boolean not null default true,
  primary key(from_stage,to_stage),
  check(from_stage<>to_stage)
);

insert into public.lead_pipeline_stages(
  code,label,sort_order,category,color,entry_condition,mandatory_actions,
  required_fields,automation,requires_next_action,is_terminal
) values
  ('lead_nou','Lead nou',10,'intake','emerald','Leadul a fost creat și păstrează sursa solicitării.',
   '["Verifică datele de contact","Atribuie agentul responsabil"]','["contact_name","source"]',
   'Notifică agentul responsabil.',true,false),
  ('de_contactat','De contactat',20,'intake','cyan','Leadul are agent responsabil și un termen real de contact.',
   '["Alege canalul","Planifică primul contact"]','["agent_id","next_action_at","next_action_type"]',
   'Creează reminder dacă termenul expiră.',true,false),
  ('contactat','Contactat',30,'qualification','blue','Există o confirmare factuală de contact.',
   '["Notează rezultatul contactului"]','["first_response_at"]',
   'Pornește termenul pentru calificare.',true,false),
  ('calificat','Calificat',40,'qualification','sky','Nevoia, zona, tranzacția și bugetul sunt cunoscute.',
   '["Confirmă criteriile clientului"]','["contact_id","category","transaction","location","budget"]',
   'Propune crearea cererii complete.',true,false),
  ('cerere_completata','Cerere completată',50,'qualification','indigo','Există o cerere activă legată de client.',
   '["Verifică criteriile cererii"]','["demand"]',
   'Rulează matchingul cu proprietăți.',true,false),
  ('proprietati_trimise','Proprietăți trimise',60,'qualification','amber','Există o proprietate înregistrată ca trimisă clientului.',
   '["Înregistrează proprietatea și canalul"]','["property_share"]',
   'Programează follow-up pentru răspuns.',true,false),
  ('vizionare_programata','Vizionare programată',70,'viewing','violet','Există o vizionare reală în calendar.',
   '["Confirmă data, clientul și proprietatea"]','["calendar_event"]',
   'Trimite reminder agentului.',true,false),
  ('vizionare_efectuata','Vizionare efectuată',80,'viewing','purple','Vizionarea este efectuată și are rezultat.',
   '["Înregistrează feedbackul","Planifică follow-up-ul"]','["completed_viewing","viewing_outcome"]',
   'Creează task de follow-up.',true,false),
  ('oferta','Ofertă',90,'closing','sky','Există o tranzacție legată aflată în etapa Ofertă.',
   '["Înregistrează suma și proprietatea"]','["transaction"]',
   'Notifică agentul la schimbarea ofertei.',true,false),
  ('negociere','Negociere',100,'closing','orange','Există o tranzacție legată aflată în negociere.',
   '["Actualizează condițiile negociate"]','["transaction"]',
   'Creează reminder pentru următorul răspuns.',true,false),
  ('rezervare','Rezervare',110,'closing','blue','Tranzacția rezervată are proprietate, client, sumă și dată.',
   '["Înregistrează data rezervării"]',
   '["transaction.property_id","transaction.contact_id","transaction.sale_price","transaction.reservation_at"]',
   'Blochează publicarea disponibilă și notifică echipa.',true,false),
  ('antecontract','Antecontract',120,'closing','yellow','Tranzacția legată este în etapa Antecontract.',
   '["Verifică documentele și termenele"]','["transaction"]',
   'Creează termenele contractuale.',true,false),
  ('credit','Credit',130,'closing','indigo','Tranzacția legată este în etapa Finanțare.',
   '["Înregistrează stadiul finanțării"]','["transaction"]',
   'Reamintește verificarea dosarului.',true,false),
  ('notar','Notar',140,'closing','fuchsia','Tranzacția legată este în etapa Notar.',
   '["Confirmă programarea și documentele"]','["transaction"]',
   'Trimite reminder pentru termenul notarial.',true,false),
  ('finalizat','Finalizat',150,'closed','emerald','Există o tranzacție finalizată atomic.',
   '["Verifică retragerea din portaluri și înregistrarea financiară"]','["finalized_transaction"]',
   'Închide acțiunile și retrage listările.',false,true),
  ('pierdut','Pierdut',160,'closed','red','Motivul și observația pierderii sunt completate.',
   '["Înregistrează motivul pierderii"]','["status_reason","status_note"]',
   'Închide reminderele active.',false,true)
on conflict(code) do update set
  label=excluded.label,sort_order=excluded.sort_order,category=excluded.category,
  color=excluded.color,entry_condition=excluded.entry_condition,
  mandatory_actions=excluded.mandatory_actions,required_fields=excluded.required_fields,
  automation=excluded.automation,requires_next_action=excluded.requires_next_action,
  is_terminal=excluded.is_terminal,is_active=true;

insert into public.lead_pipeline_transitions(from_stage,to_stage) values
  ('lead_nou','de_contactat'),('lead_nou','contactat'),('lead_nou','pierdut'),
  ('de_contactat','contactat'),('de_contactat','pierdut'),
  ('contactat','calificat'),('contactat','pierdut'),
  ('calificat','cerere_completata'),('calificat','proprietati_trimise'),
  ('calificat','vizionare_programata'),('calificat','pierdut'),
  ('cerere_completata','proprietati_trimise'),('cerere_completata','vizionare_programata'),
  ('cerere_completata','pierdut'),
  ('proprietati_trimise','vizionare_programata'),('proprietati_trimise','oferta'),
  ('proprietati_trimise','pierdut'),
  ('vizionare_programata','vizionare_efectuata'),('vizionare_programata','pierdut'),
  ('vizionare_efectuata','proprietati_trimise'),('vizionare_efectuata','oferta'),
  ('vizionare_efectuata','negociere'),('vizionare_efectuata','pierdut'),
  ('oferta','negociere'),('oferta','rezervare'),('oferta','pierdut'),
  ('negociere','oferta'),('negociere','rezervare'),('negociere','pierdut'),
  ('rezervare','antecontract'),('rezervare','credit'),('rezervare','notar'),('rezervare','pierdut'),
  ('antecontract','credit'),('antecontract','notar'),('antecontract','finalizat'),('antecontract','pierdut'),
  ('credit','antecontract'),('credit','notar'),('credit','pierdut'),
  ('notar','finalizat'),('notar','pierdut'),
  ('pierdut','de_contactat')
on conflict(from_stage,to_stage) do update set is_active=true;

alter table public.leads add column if not exists pipeline_stage text references public.lead_pipeline_stages(code);
alter table public.leads add column if not exists pipeline_legacy_status text;
alter table public.leads add column if not exists pipeline_stage_changed_at timestamptz;

update public.leads
set pipeline_legacy_status=coalesce(pipeline_legacy_status,status),
    pipeline_stage=case status
      when 'new' then 'lead_nou'
      when 'contacted' then 'contactat'
      when 'no_answer' then 'de_contactat'
      when 'to_send_offers' then 'calificat'
      when 'in_progress' then 'calificat'
      when 'upcoming_viewing' then 'vizionare_programata'
      when 'viewing' then 'vizionare_efectuata'
      when 'negotiation' then 'negociere'
      when 'precontract' then 'antecontract'
      when 'won' then 'finalizat'
      when 'lost' then 'pierdut'
      when 'withdrawn' then 'pierdut'
      else 'lead_nou'
    end,
    pipeline_stage_changed_at=coalesce(pipeline_stage_changed_at,received_at,now())
where pipeline_stage is null;

alter table public.leads alter column pipeline_stage set default 'lead_nou';
alter table public.leads alter column pipeline_stage set not null;
alter table public.leads alter column pipeline_stage_changed_at set default now();
alter table public.leads alter column pipeline_stage_changed_at set not null;

alter table public.transactions add column if not exists reservation_at timestamptz;
alter table public.transactions add column if not exists reservation_amount numeric;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='transactions_reservation_amount_nonnegative') then
    alter table public.transactions add constraint transactions_reservation_amount_nonnegative
      check(reservation_amount is null or reservation_amount>=0) not valid;
  end if;
end
$$;
alter table public.transactions validate constraint transactions_reservation_amount_nonnegative;

create or replace function public.crm_require_transaction_reservation_evidence()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
begin
  if new.status='rezervata' and (
    new.property_id is null or new.contact_id is null or coalesce(new.sale_price,0)<=0
    or new.reservation_at is null
  ) then
    raise exception 'transaction_reservation_evidence_required';
  end if;
  return new;
end
$$;

drop trigger if exists crm_require_transaction_reservation_evidence_trigger on public.transactions;
create trigger crm_require_transaction_reservation_evidence_trigger
before insert or update of status,property_id,contact_id,sale_price,reservation_at
on public.transactions for each row
execute function public.crm_require_transaction_reservation_evidence();

create table if not exists public.lead_property_shares (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete restrict,
  contact_id uuid references public.contacts(id) on delete set null,
  property_id uuid not null references public.properties(id) on delete restrict,
  channel text not null check(channel in ('whatsapp','email','sms','phone','in_person','other')),
  public_url text,
  sent_at timestamptz not null default now(),
  sent_by uuid not null references auth.users(id),
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(agency_id,idempotency_key)
);

create table if not exists public.lead_pipeline_events (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete restrict,
  from_stage text references public.lead_pipeline_stages(code),
  to_stage text not null references public.lead_pipeline_stages(code),
  reason text,
  note text,
  source text not null check(source in ('migration','manual','automation','system')),
  actor_id uuid references auth.users(id),
  evidence jsonb not null default '{}'::jsonb,
  dedup_key text,
  created_at timestamptz not null default now(),
  unique(agency_id,lead_id,dedup_key)
);

create index if not exists leads_pipeline_board_idx
  on public.leads(agency_id,pipeline_stage,pipeline_stage_changed_at desc)
  where deleted_at is null;
create index if not exists lead_property_shares_lead_idx
  on public.lead_property_shares(agency_id,lead_id,sent_at desc);
create index if not exists lead_pipeline_events_lead_idx
  on public.lead_pipeline_events(agency_id,lead_id,created_at desc);

insert into public.lead_pipeline_events(
  agency_id,lead_id,from_stage,to_stage,reason,note,source,evidence,dedup_key,created_at
)
select agency_id,id,null,pipeline_stage,'Inițializare fără rescrierea statusului istoric',
       concat('Status istoric păstrat: ',coalesce(status,'—')),'migration',
       jsonb_build_object('legacy_status',status,'legacy_status_original',legacy_status),
       concat('migration:',pipeline_stage),pipeline_stage_changed_at
from public.leads
on conflict(agency_id,lead_id,dedup_key) do nothing;

create or replace function public.crm_record_initial_pipeline_stage()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  insert into public.lead_pipeline_events(
    agency_id,lead_id,from_stage,to_stage,reason,note,source,evidence,dedup_key,created_at
  ) values (
    new.agency_id,new.id,null,new.pipeline_stage,'Lead creat',
    concat('Status inițial păstrat: ',coalesce(new.status,'—')),'system',
    jsonb_build_object('legacy_status',new.status),
    'initial-stage',coalesce(new.received_at,now())
  )
  on conflict(agency_id,lead_id,dedup_key) do nothing;
  return new;
end
$$;

revoke all on function public.crm_record_initial_pipeline_stage()
  from public, anon, authenticated;
grant execute on function public.crm_record_initial_pipeline_stage()
  to service_role;

drop trigger if exists crm_record_initial_pipeline_stage_trigger on public.leads;
create trigger crm_record_initial_pipeline_stage_trigger
after insert on public.leads for each row
execute function public.crm_record_initial_pipeline_stage();

create or replace function public.crm_pipeline_stage_blockers(
  p_agency_id uuid,
  p_lead_id uuid,
  p_to_stage text,
  p_next_action_at timestamptz default null,
  p_next_action_type text default null,
  p_reason text default null,
  p_note text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  lead_row public.leads%rowtype;
  stage_row public.lead_pipeline_stages%rowtype;
  blockers jsonb := '[]'::jsonb;
begin
  select * into lead_row from public.leads
  where id=p_lead_id and agency_id=p_agency_id and deleted_at is null;
  if not found then return jsonb_build_array('Leadul nu există în această agenție.'); end if;

  select * into stage_row from public.lead_pipeline_stages
  where code=p_to_stage and is_active;
  if not found then return jsonb_build_array('Etapa pipeline nu este validă.'); end if;

  if stage_row.requires_next_action then
    if coalesce(p_next_action_at,lead_row.next_action_at) is null
      or coalesce(p_next_action_at,lead_row.next_action_at)<=now() then
      blockers:=blockers||jsonb_build_array('Următoarea acțiune trebuie să aibă o dată viitoare.');
    end if;
    if nullif(trim(coalesce(p_next_action_type,lead_row.next_action_type,'')),'') is null then
      blockers:=blockers||jsonb_build_array('Tipul următoarei acțiuni este obligatoriu.');
    end if;
  end if;

  if p_to_stage='de_contactat' and lead_row.agent_id is null then
    blockers:=blockers||jsonb_build_array('Atribuie un agent înainte de primul contact.');
  elsif p_to_stage='contactat'
    and lead_row.first_response_at is null and lead_row.last_contacted_at is null then
    blockers:=blockers||jsonb_build_array('Lipsește confirmarea factuală a contactului cu clientul.');
  elsif p_to_stage='calificat' then
    if lead_row.contact_id is null then blockers:=blockers||jsonb_build_array('Leagă leadul de profilul unic al clientului.'); end if;
    if nullif(trim(coalesce(lead_row.category,'')),'') is null then blockers:=blockers||jsonb_build_array('Categoria căutată este obligatorie.'); end if;
    if nullif(trim(coalesce(lead_row.transaction,'')),'') is null then blockers:=blockers||jsonb_build_array('Tipul tranzacției este obligatoriu.'); end if;
    if nullif(trim(coalesce(lead_row.city,lead_row.county,'')),'') is null then blockers:=blockers||jsonb_build_array('Completează zona sau localitatea.'); end if;
    if lead_row.budget_min is null and lead_row.budget_max is null
      and coalesce(lead_row.criteria->>'budget_unknown','false')<>'true' then
      blockers:=blockers||jsonb_build_array('Completează bugetul sau marchează-l ca necunoscut.');
    end if;
  elsif p_to_stage='cerere_completata' and not exists(
    select 1 from public.demands d where d.agency_id=p_agency_id
      and d.contact_id=lead_row.contact_id and d.deleted_at is null and d.status='activa'
  ) then
    blockers:=blockers||jsonb_build_array('Nu există o cerere activă legată de acest client.');
  elsif p_to_stage='proprietati_trimise' and not exists(
    select 1 from public.lead_property_shares s where s.agency_id=p_agency_id
      and s.lead_id=lead_row.id
  ) then
    blockers:=blockers||jsonb_build_array('Nu există nicio proprietate înregistrată ca trimisă.');
  elsif p_to_stage='vizionare_programata' and not exists(
    select 1 from public.calendar_events e where e.agency_id=p_agency_id
      and e.lead_id=lead_row.id and e.type='vizionare' and e.deleted_at is null
      and e.status in ('programata','confirmata','amanata') and e.start_at>now()
  ) then
    blockers:=blockers||jsonb_build_array('Nu există o vizionare reală, viitoare, în calendar.');
  elsif p_to_stage='vizionare_efectuata' and not exists(
    select 1 from public.calendar_events e where e.agency_id=p_agency_id
      and e.lead_id=lead_row.id and e.type='vizionare' and e.deleted_at is null
      and e.status='efectuata' and e.completed_at is not null and nullif(trim(coalesce(e.outcome,'')),'') is not null
  ) then
    blockers:=blockers||jsonb_build_array('Nu există o vizionare efectuată cu rezultat înregistrat.');
  elsif p_to_stage in ('oferta','negociere','antecontract','credit','notar','finalizat') and not exists(
    select 1 from public.transactions t where t.agency_id=p_agency_id and t.deleted_at is null
      and (t.lead_id=lead_row.id or (lead_row.contact_id is not null and t.contact_id=lead_row.contact_id))
      and t.status=case p_to_stage
        when 'oferta' then 'oferta' when 'negociere' then 'negociere'
        when 'antecontract' then 'antecontract' when 'credit' then 'finantare'
        when 'notar' then 'notar' when 'finalizat' then 'finalizata' end
  ) then
    blockers:=blockers||jsonb_build_array(
      case when p_to_stage='finalizat'
        then 'Nu se poate finaliza fără o tranzacție finalizată atomic.'
        else 'Nu există o tranzacție legată în etapa necesară.' end
    );
  elsif p_to_stage='rezervare' and not exists(
    select 1 from public.transactions t where t.agency_id=p_agency_id and t.deleted_at is null
      and (t.lead_id=lead_row.id or (lead_row.contact_id is not null and t.contact_id=lead_row.contact_id))
      and t.status='rezervata' and t.property_id is not null and t.contact_id is not null
      and coalesce(t.sale_price,0)>0 and t.reservation_at is not null
  ) then
    blockers:=blockers||jsonb_build_array('Rezervarea cere tranzacție, proprietate, client, sumă și dată.');
  elsif p_to_stage='pierdut' then
    if nullif(trim(coalesce(p_reason,lead_row.status_reason,'')),'') is null then
      blockers:=blockers||jsonb_build_array('Motivul pierderii este obligatoriu.');
    end if;
    if nullif(trim(coalesce(p_note,lead_row.status_note,'')),'') is null then
      blockers:=blockers||jsonb_build_array('Observația pierderii este obligatorie.');
    end if;
  end if;

  return blockers;
end
$$;

create or replace function public.crm_guard_pipeline_stage_update()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
begin
  if old.pipeline_stage is distinct from new.pipeline_stage
    and coalesce(current_setting('app.crm_pipeline_transition',true),'')<>'allowed' then
    raise exception 'pipeline_transition_rpc_required';
  end if;
  return new;
end
$$;

drop trigger if exists crm_guard_pipeline_stage_update_trigger on public.leads;
create trigger crm_guard_pipeline_stage_update_trigger
before update of pipeline_stage on public.leads
for each row execute function public.crm_guard_pipeline_stage_update();

create or replace function public.crm_transition_lead_pipeline(
  p_agency_id uuid,
  p_actor_id uuid,
  p_lead_id uuid,
  p_to_stage text,
  p_next_action_at timestamptz default null,
  p_next_action_type text default null,
  p_reason text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  lead_row public.leads%rowtype;
  blockers jsonb;
  event_id uuid;
begin
  if not exists(select 1 from public.profiles p where p.user_id=p_actor_id
    and p.agency_id=p_agency_id and coalesce(p.status,'active')='active') then
    raise exception 'pipeline_actor_not_in_agency';
  end if;

  select * into lead_row from public.leads
  where id=p_lead_id and agency_id=p_agency_id and deleted_at is null
  for update;
  if not found then raise exception 'pipeline_lead_not_found'; end if;
  if lead_row.pipeline_stage=p_to_stage then
    return jsonb_build_object('lead_id',lead_row.id,'stage',lead_row.pipeline_stage,'unchanged',true);
  end if;
  if not exists(select 1 from public.lead_pipeline_transitions
    where from_stage=lead_row.pipeline_stage and to_stage=p_to_stage and is_active) then
    raise exception 'pipeline_transition_invalid:%:%',lead_row.pipeline_stage,p_to_stage;
  end if;

  blockers:=public.crm_pipeline_stage_blockers(
    p_agency_id,p_lead_id,p_to_stage,p_next_action_at,p_next_action_type,p_reason,p_note
  );
  if jsonb_array_length(blockers)>0 then raise exception 'pipeline_blocked:%',blockers::text; end if;

  perform set_config('app.crm_pipeline_transition','allowed',true);
  update public.leads set
    pipeline_stage=p_to_stage,
    pipeline_stage_changed_at=now(),
    next_action_at=case when p_to_stage in ('finalizat','pierdut') then null
      else coalesce(p_next_action_at,next_action_at) end,
    next_action_type=case when p_to_stage in ('finalizat','pierdut') then null
      else coalesce(nullif(trim(p_next_action_type),''),next_action_type) end,
    status_reason=case when p_to_stage='pierdut' then trim(p_reason) else status_reason end,
    status_note=case when p_to_stage='pierdut' then trim(p_note) else status_note end
  where id=p_lead_id and agency_id=p_agency_id;

  insert into public.lead_pipeline_events(
    agency_id,lead_id,from_stage,to_stage,reason,note,source,actor_id,evidence
  ) values (
    p_agency_id,p_lead_id,lead_row.pipeline_stage,p_to_stage,
    nullif(trim(p_reason),''),nullif(trim(p_note),''),'manual',p_actor_id,
    jsonb_build_object('legacy_status',lead_row.status,'contact_id',lead_row.contact_id,'property_id',lead_row.property_id)
  ) returning id into event_id;

  insert into public.activities(
    agency_id,user_id,agent_id,lead_id,contact_id,property_id,type,title,description
  ) values (
    p_agency_id,p_actor_id,lead_row.agent_id,p_lead_id,lead_row.contact_id,
    lead_row.property_id,'pipeline_stage','Etapă pipeline schimbată',
    concat(lead_row.pipeline_stage,' → ',p_to_stage)
  );

  return jsonb_build_object(
    'lead_id',p_lead_id,'from_stage',lead_row.pipeline_stage,'stage',p_to_stage,
    'event_id',event_id,'changed_at',now()
  );
end
$$;

create or replace function public.crm_record_lead_property_share(
  p_agency_id uuid,
  p_actor_id uuid,
  p_lead_id uuid,
  p_property_id uuid,
  p_channel text,
  p_public_url text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  lead_row public.leads%rowtype;
  share_id uuid;
begin
  if p_channel not in ('whatsapp','email','sms','phone','in_person','other') then
    raise exception 'property_share_channel_invalid';
  end if;
  if nullif(trim(coalesce(p_idempotency_key,'')),'') is null then
    raise exception 'property_share_idempotency_required';
  end if;
  if not exists(select 1 from public.profiles p where p.user_id=p_actor_id
    and p.agency_id=p_agency_id and coalesce(p.status,'active')='active') then
    raise exception 'property_share_actor_not_in_agency';
  end if;
  select * into lead_row from public.leads where id=p_lead_id and agency_id=p_agency_id
    and deleted_at is null;
  if not found then raise exception 'property_share_lead_not_found'; end if;
  if not exists(select 1 from public.properties where id=p_property_id
    and agency_id=p_agency_id and deleted_at is null) then
    raise exception 'property_share_property_not_found';
  end if;

  insert into public.lead_property_shares(
    agency_id,lead_id,contact_id,property_id,channel,public_url,sent_by,idempotency_key
  ) values (
    p_agency_id,p_lead_id,lead_row.contact_id,p_property_id,p_channel,
    nullif(trim(p_public_url),''),p_actor_id,trim(p_idempotency_key)
  )
  on conflict(agency_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key
  returning id into share_id;

  return jsonb_build_object('share_id',share_id,'lead_id',p_lead_id,'property_id',p_property_id);
end
$$;

alter table public.lead_pipeline_stages enable row level security;
alter table public.lead_pipeline_transitions enable row level security;
alter table public.lead_property_shares enable row level security;
alter table public.lead_pipeline_events enable row level security;

drop policy if exists crm_pipeline_catalog_read on public.lead_pipeline_stages;
create policy crm_pipeline_catalog_read on public.lead_pipeline_stages
  for select to authenticated using(true);
drop policy if exists crm_pipeline_transitions_read on public.lead_pipeline_transitions;
create policy crm_pipeline_transitions_read on public.lead_pipeline_transitions
  for select to authenticated using(true);
drop policy if exists crm_pipeline_events_read on public.lead_pipeline_events;
create policy crm_pipeline_events_read on public.lead_pipeline_events
  for select to authenticated using(
    agency_id=public.current_crm_agency_id() and public.crm_has_permission('leads','view')
  );
drop policy if exists crm_property_shares_read on public.lead_property_shares;
create policy crm_property_shares_read on public.lead_property_shares
  for select to authenticated using(
    agency_id=public.current_crm_agency_id() and public.crm_has_permission('leads','view')
  );

revoke all on public.lead_pipeline_stages,public.lead_pipeline_transitions,
  public.lead_property_shares,public.lead_pipeline_events from public,anon;
grant select on public.lead_pipeline_stages,public.lead_pipeline_transitions,
  public.lead_property_shares,public.lead_pipeline_events to authenticated,service_role;
grant all on public.lead_pipeline_stages,public.lead_pipeline_transitions,
  public.lead_property_shares,public.lead_pipeline_events to service_role;

revoke all on function public.crm_pipeline_stage_blockers(uuid,uuid,text,timestamptz,text,text,text)
  from public,anon,authenticated;
revoke all on function public.crm_transition_lead_pipeline(uuid,uuid,uuid,text,timestamptz,text,text,text)
  from public,anon,authenticated;
revoke all on function public.crm_record_lead_property_share(uuid,uuid,uuid,uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.crm_pipeline_stage_blockers(uuid,uuid,text,timestamptz,text,text,text)
  to service_role;
grant execute on function public.crm_transition_lead_pipeline(uuid,uuid,uuid,text,timestamptz,text,text,text)
  to service_role;
grant execute on function public.crm_record_lead_property_share(uuid,uuid,uuid,uuid,text,text,text)
  to service_role;

commit;
