begin;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  entity_type text,
  entity_id text,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  action_url text,
  dedup_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  dismissed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(agency_id, user_id, dedup_key)
);

-- The old document schema had no expiry field. It remains nullable and does not
-- alter any historical document.
alter table public.property_documents add column if not exists expires_at timestamptz;

create index if not exists notifications_user_inbox_idx
  on public.notifications(agency_id, user_id, created_at desc) where dismissed_at is null;
create index if not exists notifications_user_unread_idx
  on public.notifications(agency_id, user_id, created_at desc) where read_at is null and dismissed_at is null;
create index if not exists notifications_entity_idx
  on public.notifications(agency_id, entity_type, entity_id) where entity_id is not null;
create index if not exists property_documents_expiry_idx
  on public.property_documents(agency_id, expires_at) where expires_at is not null;

create or replace function public.crm_enqueue_notification(
  p_agency_id uuid,
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_entity_type text,
  p_entity_id text,
  p_priority text,
  p_action_url text,
  p_dedup_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare inserted_count integer;
begin
  if p_agency_id is null or nullif(trim(p_dedup_key), '') is null then return 0; end if;
  if p_priority not in ('low','normal','high','urgent') then raise exception 'invalid_notification_priority'; end if;

  if p_user_id is not null then
    insert into public.notifications(
      agency_id,user_id,type,title,message,entity_type,entity_id,priority,action_url,dedup_key,metadata
    )
    select p_agency_id,p.user_id,p_type,trim(p_title),trim(p_message),p_entity_type,p_entity_id,
      p_priority,p_action_url,p_dedup_key,coalesce(p_metadata,'{}'::jsonb)
    from public.profiles p
    where p.user_id = p_user_id and p.agency_id = p_agency_id and coalesce(p.status,'active') = 'active'
    on conflict (agency_id,user_id,dedup_key) do update set
      title=excluded.title,message=excluded.message,priority=excluded.priority,action_url=excluded.action_url,
      metadata=excluded.metadata,updated_at=now();
  else
    insert into public.notifications(
      agency_id,user_id,type,title,message,entity_type,entity_id,priority,action_url,dedup_key,metadata
    )
    select p_agency_id,p.user_id,p_type,trim(p_title),trim(p_message),p_entity_type,p_entity_id,
      p_priority,p_action_url,p_dedup_key,coalesce(p_metadata,'{}'::jsonb)
    from public.profiles p
    where p.agency_id = p_agency_id and coalesce(p.status,'active') = 'active'
      and coalesce(p.role,'viewer') in ('owner','admin','manager')
    on conflict (agency_id,user_id,dedup_key) do update set
      title=excluded.title,message=excluded.message,priority=excluded.priority,action_url=excluded.action_url,
      metadata=excluded.metadata,updated_at=now();
  end if;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.crm_emit_notification_from_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  row_data jsonb := to_jsonb(new);
  old_data jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  agency uuid;
  target uuid;
  entity_id text;
  demand_agent uuid;
  property_agent uuid;
begin
  agency := nullif(row_data->>'agency_id','')::uuid;
  entity_id := row_data->>'id';
  target := coalesce(
    nullif(row_data->>'agent_id','')::uuid,
    nullif(row_data->>'assigned_to','')::uuid,
    nullif(row_data->>'created_by','')::uuid
  );

  if tg_table_name = 'leads' and tg_op = 'INSERT' then
    perform public.crm_enqueue_notification(agency,target,'new_lead','Lead nou',
      concat('Client nou: ',coalesce(nullif(row_data->>'contact_name',''),'fără nume')),
      'lead',entity_id,'high','/clients/'||entity_id,'new_lead:'||entity_id,'{}'::jsonb);
  elsif tg_table_name = 'tasks' and coalesce(row_data->>'status','open') <> 'done'
      and nullif(row_data->>'due_at','')::timestamptz <= now() then
    perform public.crm_enqueue_notification(agency,target,'task_overdue','Task expirat',
      coalesce(nullif(row_data->>'title',''),'Task scadent'),'task',entity_id,'high','/tasks',
      'task_overdue:'||entity_id,'{}'::jsonb);
  elsif tg_table_name = 'calendar_events' and row_data->>'type' = 'vizionare'
      and row_data->>'status' in ('programata','confirmata')
      and nullif(row_data->>'start_at','')::timestamptz between now() and now()+interval '48 hours' then
    perform public.crm_enqueue_notification(agency,target,'viewing_reminder','Vizionare programată',
      coalesce(nullif(row_data->>'title',''),'Ai o vizionare programată'),'viewing',entity_id,'high','/viewings',
      'viewing_reminder:'||entity_id,'{}'::jsonb);
  elsif tg_table_name = 'matches' and tg_op = 'INSERT' then
    select d.agent_id into demand_agent from public.demands d where d.id = nullif(row_data->>'demand_id','')::uuid and d.agency_id = agency;
    perform public.crm_enqueue_notification(agency,demand_agent,'demand_match','Potrivire nouă',
      concat('O proprietate se potrivește cererii cu scor ',coalesce(row_data->>'score','0'),'%.'),
      'demand',row_data->>'demand_id','normal','/matches?demand_id='||(row_data->>'demand_id'),
      'demand_match:'||entity_id,jsonb_build_object('match_id',entity_id));
  elsif tg_table_name = 'properties' and row_data->>'status' = 'expirata'
      and row_data->>'status' is distinct from old_data->>'status' then
    perform public.crm_enqueue_notification(agency,target,'property_expired','Proprietate expirată',
      coalesce(nullif(row_data->>'title',''),'O proprietate a expirat'),'property',entity_id,'high',
      '/properties/'||entity_id,'property_expired:'||entity_id,'{}'::jsonb);
  elsif tg_table_name = 'portal_listings' and (
      row_data->>'status' in ('error','rejected','removal_failed') or nullif(row_data->>'error_message','') is not null
    ) then
    select p.agent_id into property_agent from public.properties p
      where p.id = nullif(row_data->>'property_id','')::uuid and p.agency_id = agency;
    perform public.crm_enqueue_notification(agency,property_agent,'portal_error','Eroare portal',
      coalesce(nullif(row_data->>'error_message',''),'Listarea de portal necesită verificare'),
      'portal_listing',entity_id,'urgent','/portals','portal_error:'||entity_id,'{}'::jsonb);
  elsif tg_table_name = 'webhook_events' and (
      row_data->>'processing_status' in ('failed','rejected') or row_data->>'security_flag' = 'true'
    ) then
    perform public.crm_enqueue_notification(agency,null,'webhook_rejected','Webhook respins',
      'Un eveniment de portal a fost respins sau a eșuat.','webhook_event',entity_id,'urgent','/portals',
      'webhook_error:'||entity_id,'{}'::jsonb);
  elsif tg_table_name = 'transactions' and tg_op = 'INSERT' then
    perform public.crm_enqueue_notification(agency,target,'transaction','Tranzacție înregistrată',
      concat('Tranzacție ',coalesce(row_data->>'type','imobiliară'),' înregistrată.'),
      'transaction',entity_id,'normal','/finance','transaction:'||entity_id,'{}'::jsonb);
  elsif tg_table_name = 'property_documents' and nullif(row_data->>'expires_at','')::timestamptz <= now() then
    select p.agent_id into property_agent from public.properties p
      where p.id = nullif(row_data->>'property_id','')::uuid and p.agency_id = agency;
    perform public.crm_enqueue_notification(agency,property_agent,'document_expired','Document expirat',
      concat('Documentul ',coalesce(row_data->>'file_name',''),' a expirat.'),
      'property_document',entity_id,'high','/properties/'||(row_data->>'property_id'),
      'document_expired:'||entity_id,'{}'::jsonb);
  end if;
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['leads','tasks','calendar_events','matches','properties','portal_listings','webhook_events','transactions','property_documents'] loop
    if to_regclass('public.'||table_name) is null then continue; end if;
    execute format('drop trigger if exists crm_notification_event_trigger on public.%I',table_name);
    execute format('create trigger crm_notification_event_trigger after insert or update on public.%I for each row execute function public.crm_emit_notification_from_change()',table_name);
  end loop;
end $$;

-- Safe backfill of current actionable events. Deduplication keys make this
-- section restartable and preserve read/dismissed state on repeated migration.
do $$
declare row record;
begin
  for row in
    select l.*, coalesce(l.agent_id,l.assigned_to) target
    from public.leads l where l.deleted_at is null and l.received_at >= now()-interval '30 days'
  loop
    perform public.crm_enqueue_notification(row.agency_id,row.target,'new_lead','Lead nou',
      concat('Client nou: ',coalesce(nullif(row.contact_name,''),'fără nume')),'lead',row.id::text,
      case when row.status='new' and row.received_at<now()-interval '24 hours' then 'urgent' else 'high' end,
      '/clients/'||row.id::text,'new_lead:'||row.id::text,'{}'::jsonb);
    if row.status='new' and row.received_at<now()-interval '24 hours' then
      perform public.crm_enqueue_notification(row.agency_id,row.target,'lead_uncontacted','Lead necontactat',
        concat(coalesce(nullif(row.contact_name,''),'Clientul'),' nu a fost contactat în 24 de ore.'),'lead',row.id::text,
        'urgent','/clients/'||row.id::text,'lead_uncontacted:'||row.id::text,'{}'::jsonb);
    end if;
  end loop;
  for row in select * from public.tasks where status<>'done' and due_at<now() loop
    perform public.crm_enqueue_notification(row.agency_id,row.assigned_to,'task_overdue','Task expirat',row.title,
      'task',row.id::text,'high','/tasks','task_overdue:'||row.id::text,'{}'::jsonb);
  end loop;
  for row in select * from public.calendar_events where deleted_at is null and type='vizionare'
    and status in ('programata','confirmata') and start_at between now() and now()+interval '48 hours'
  loop
    perform public.crm_enqueue_notification(row.agency_id,row.agent_id,'viewing_reminder','Vizionare programată',row.title,
      'viewing',row.id::text,'high','/viewings','viewing_reminder:'||row.id::text,'{}'::jsonb);
  end loop;
  for row in select m.*,d.agent_id from public.matches m join public.demands d on d.id=m.demand_id and d.agency_id=m.agency_id
    where m.status='noua' and m.created_at>=now()-interval '30 days'
  loop
    perform public.crm_enqueue_notification(row.agency_id,row.agent_id,'demand_match','Potrivire nouă',
      concat('Potrivire nouă cu scor ',round(row.score),'%.'),'demand',row.demand_id::text,'normal',
      '/matches?demand_id='||row.demand_id::text,'demand_match:'||row.id::text,jsonb_build_object('match_id',row.id));
  end loop;
  for row in select * from public.properties where deleted_at is null and status='expirata' loop
    perform public.crm_enqueue_notification(row.agency_id,row.agent_id,'property_expired','Proprietate expirată',
      coalesce(nullif(row.title,''),'O proprietate a expirat'),'property',row.id::text,'high',
      '/properties/'||row.id::text,'property_expired:'||row.id::text,'{}'::jsonb);
  end loop;
  for row in select pl.*,p.agent_id from public.portal_listings pl join public.properties p on p.id=pl.property_id and p.agency_id=pl.agency_id
    where pl.status in ('error','rejected','removal_failed') or nullif(pl.error_message,'') is not null
  loop
    perform public.crm_enqueue_notification(row.agency_id,row.agent_id,'portal_error','Eroare portal',
      coalesce(nullif(row.error_message,''),'Listarea necesită verificare'),'portal_listing',row.id::text,
      'urgent','/portals','portal_error:'||row.id::text,'{}'::jsonb);
  end loop;
  for row in select * from public.webhook_events
    where processing_status in ('failed','rejected') or security_flag
  loop
    perform public.crm_enqueue_notification(row.agency_id,null,'webhook_rejected','Webhook respins',
      'Un eveniment de portal a fost respins sau a eșuat.','webhook_event',row.id::text,'urgent',
      '/portals','webhook_error:'||row.id::text,'{}'::jsonb);
  end loop;
  for row in select t.* from public.transactions t where t.deleted_at is null and t.created_at>=now()-interval '30 days' loop
    perform public.crm_enqueue_notification(row.agency_id,row.agent_id,'transaction','Tranzacție înregistrată',
      concat('Tranzacție ',coalesce(row.type,'imobiliară'),' înregistrată.'),'transaction',row.id::text,
      'normal','/finance','transaction:'||row.id::text,'{}'::jsonb);
  end loop;
  for row in select pd.*,p.agent_id from public.property_documents pd join public.properties p on p.id=pd.property_id and p.agency_id=pd.agency_id
    where pd.expires_at is not null and pd.expires_at<=now()
  loop
    perform public.crm_enqueue_notification(row.agency_id,row.agent_id,'document_expired','Document expirat',
      concat('Documentul ',row.file_name,' a expirat.'),'property_document',row.id::text,'high',
      '/properties/'||row.property_id::text,'document_expired:'||row.id::text,'{}'::jsonb);
  end loop;
end $$;

alter table public.notifications enable row level security;
revoke all on public.notifications from public,anon,authenticated;
grant select on public.notifications to authenticated;
grant update(read_at,dismissed_at,updated_at) on public.notifications to authenticated;

drop policy if exists crm_notifications_select on public.notifications;
create policy crm_notifications_select on public.notifications for select to authenticated using (
  agency_id=public.current_crm_agency_id() and user_id=auth.uid() and public.crm_has_permission('notifications','view')
);
drop policy if exists crm_notifications_update on public.notifications;
create policy crm_notifications_update on public.notifications for update to authenticated using (
  agency_id=public.current_crm_agency_id() and user_id=auth.uid() and public.crm_has_permission('notifications','edit')
) with check (
  agency_id=public.current_crm_agency_id() and user_id=auth.uid() and public.crm_has_permission('notifications','edit')
);

revoke all on function public.crm_enqueue_notification(uuid,uuid,text,text,text,text,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.crm_emit_notification_from_change() from public,anon,authenticated;
grant execute on function public.crm_enqueue_notification(uuid,uuid,text,text,text,text,text,text,text,text,jsonb) to service_role;

commit;
