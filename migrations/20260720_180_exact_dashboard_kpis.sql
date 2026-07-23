begin;

create or replace function public.crm_dashboard_kpis(
  p_agency_id uuid,
  p_user_id uuid,
  p_scope_all boolean,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  profile_role text;
  use_all boolean;
  result jsonb;
begin
  if p_from is null or p_to is null or p_from>=p_to then
    raise exception 'dashboard_period_invalid';
  end if;
  select role into profile_role
  from public.profiles
  where user_id=p_user_id and agency_id=p_agency_id and coalesce(status,'active')='active';
  if not found then raise exception 'dashboard_profile_not_found'; end if;

  -- Scope cannot be escalated by changing the RPC payload.
  use_all := coalesce(p_scope_all,false)
    and coalesce(profile_role,'viewer') in ('owner','admin','manager');

  with
  scoped_leads as (
    select l.* from public.leads l
    where l.agency_id=p_agency_id and l.deleted_at is null
      and (use_all or coalesce(l.agent_id,l.assigned_to)=p_user_id)
  ),
  period_leads as (
    select * from scoped_leads where received_at>=p_from and received_at<p_to
  ),
  scoped_properties as (
    select p.* from public.properties p
    where p.agency_id=p_agency_id and p.deleted_at is null
      and (use_all or p.agent_id=p_user_id)
  ),
  scoped_viewings as (
    select e.* from public.calendar_events e
    where e.agency_id=p_agency_id and e.deleted_at is null and e.type='vizionare'
      and (use_all or e.agent_id=p_user_id)
  ),
  scoped_transactions as (
    select t.* from public.transactions t
    where t.agency_id=p_agency_id and t.deleted_at is null
      and (use_all or t.agent_id=p_user_id)
  ),
  scoped_tasks as (
    select t.* from public.tasks t
    where t.agency_id=p_agency_id and t.deleted_at is null
      and (use_all or t.assigned_to=p_user_id)
  ),
  portal_rows as (
    select pl.*
    from public.portal_listings pl
    join scoped_properties p on p.id=pl.property_id
    where pl.agency_id=p_agency_id
  ),
  agent_rows as (
    select
      p.user_id,
      coalesce(nullif(p.full_name,''),'Agent') name,
      p.role,
      (select count(*) from public.leads l
        where l.agency_id=p_agency_id and l.deleted_at is null and coalesce(l.agent_id,l.assigned_to)=p.user_id
          and l.received_at>=p_from and l.received_at<p_to) leads,
      (select count(*) from public.leads l
        where l.agency_id=p_agency_id and l.deleted_at is null and coalesce(l.agent_id,l.assigned_to)=p.user_id
          and l.received_at>=p_from and l.received_at<p_to
          and (l.pipeline_stage='finalizat' or l.status='won')) converted,
      (select count(*) from public.calendar_events e
        where e.agency_id=p_agency_id and e.deleted_at is null and e.type='vizionare'
          and e.status='efectuata' and e.agent_id=p.user_id
          and e.start_at>=p_from and e.start_at<p_to) viewings,
      (select count(*) from public.transactions t
        where t.agency_id=p_agency_id and t.deleted_at is null and t.status='finalizata'
          and t.agent_id=p.user_id and coalesce(t.completed_at,t.created_at)>=p_from
          and coalesce(t.completed_at,t.created_at)<p_to) transactions,
      (select round(avg(extract(epoch from (
          coalesce(l.first_response_at,l.last_contacted_at)-l.received_at
        ))/60.0)::numeric,1)
        from public.leads l
        where l.agency_id=p_agency_id and l.deleted_at is null and coalesce(l.agent_id,l.assigned_to)=p.user_id
          and l.received_at>=p_from and l.received_at<p_to
          and coalesce(l.first_response_at,l.last_contacted_at)>=l.received_at) response_minutes
    from public.profiles p
    where p.agency_id=p_agency_id and coalesce(p.status,'active')='active'
      and p.role in ('owner','admin','manager','agent_senior','agent')
  )
  select jsonb_build_object(
    'scope',case when use_all then 'agency' else 'mine' end,
    'period',jsonb_build_object('from',p_from,'to',p_to),
    'kpis',jsonb_build_object(
      'new_leads',(select count(*) from period_leads),
      'uncontacted_leads',(select count(*) from scoped_leads
        where first_response_at is null and last_contacted_at is null
          and pipeline_stage not in ('finalizat','pierdut')),
      'average_response_minutes',coalesce((select round(avg(extract(epoch from (
          coalesce(first_response_at,last_contacted_at)-received_at
        ))/60.0)::numeric,1)
        from period_leads
        where coalesce(first_response_at,last_contacted_at)>=received_at),0),
      'viewings',(select count(*) from scoped_viewings
        where start_at>=p_from and start_at<p_to and status<>'anulata'),
      'offers',(select count(distinct e.lead_id)
        from public.lead_pipeline_events e join scoped_leads l on l.id=e.lead_id
        where e.agency_id=p_agency_id and e.to_stage='oferta'
          and e.created_at>=p_from and e.created_at<p_to),
      'reservations',(select count(distinct e.lead_id)
        from public.lead_pipeline_events e join scoped_leads l on l.id=e.lead_id
        where e.agency_id=p_agency_id and e.to_stage='rezervare'
          and e.created_at>=p_from and e.created_at<p_to),
      'transactions',(select count(*) from scoped_transactions
        where status='finalizata' and coalesce(completed_at,created_at)>=p_from
          and coalesce(completed_at,created_at)<p_to),
      'active_properties',(select count(*) from scoped_properties where status='activa'),
      'expired_properties',(select count(*) from scoped_properties where status='expirata'),
      'listing_errors',(select count(*) from portal_rows
        where status in ('error','rejected','removal_failed') or nullif(error_message,'') is not null),
      'open_tasks',(select count(*) from scoped_tasks where status<>'done'),
      'overdue_tasks',(select count(*) from scoped_tasks
        where status<>'done' and due_at is not null and due_at<now()),
      'followups',(select count(*) from scoped_tasks
        where status<>'done' and lower(title) like 'follow-up%'),
      'leads_without_next_action',(select count(*) from scoped_leads
        where pipeline_stage not in ('finalizat','pierdut') and next_action_at is null),
      'conversion_rate',coalesce((select round(
        100.0*count(*) filter(where pipeline_stage='finalizat' or status='won')
        /nullif(count(*),0),1
      ) from period_leads),0)
    ),
    'revenue_by_currency',coalesce((
      select jsonb_agg(jsonb_build_object('currency',x.currency,'amount',x.amount) order by x.currency)
      from (
        select f.currency,round(sum(f.amount),2) amount
        from public.transaction_financial_entries f
        join scoped_transactions t on t.id=f.transaction_id
        where f.agency_id=p_agency_id and f.status<>'cancelled'
          and f.recorded_at>=p_from and f.recorded_at<p_to
          and (
            (use_all and f.entry_type='agency_commission')
            or (not use_all and f.entry_type='agent_commission' and f.beneficiary_user_id=p_user_id)
          )
        group by f.currency
      ) x
    ),'[]'::jsonb),
    'estimated_commission_by_currency',coalesce((
      select jsonb_agg(jsonb_build_object('currency',x.currency,'amount',x.amount) order by x.currency)
      from (
        select t.currency,round(sum(
          case when use_all then coalesce(t.agency_commission,0) else coalesce(t.agent_commission,0) end
        ),2) amount
        from scoped_transactions t
        where t.status not in ('finalizata','anulata')
        group by t.currency
      ) x
    ),'[]'::jsonb),
    'lead_sources',coalesce((
      select jsonb_agg(jsonb_build_object('source',x.source,'count',x.total) order by x.total desc,x.source)
      from (
        select coalesce(nullif(source_normalized,''),nullif(source,''),'necunoscuta') source,count(*) total
        from period_leads group by 1
      ) x
    ),'[]'::jsonb),
    'portal_performance',coalesce((
      select jsonb_agg(jsonb_build_object(
        'portal',x.portal,'total',x.total,'active',x.active,'errors',x.errors,
        'pending',x.pending,'removed',x.removed,
        'success_rate',case when x.total-x.removed=0 then 0
          else round(100.0*x.active/(x.total-x.removed),1) end
      ) order by x.portal)
      from (
        select coalesce(portal,'necunoscut') portal,count(*) total,
          count(*) filter(where status in ('active','published') and coalesce(remote_exists,true)) active,
          count(*) filter(where status in ('error','rejected','removal_failed') or nullif(error_message,'') is not null) errors,
          count(*) filter(where status in ('pending','processing','pending_removal','retry')) pending,
          count(*) filter(where status in ('deleted','expired')) removed
        from portal_rows group by 1
      ) x
    ),'[]'::jsonb),
    'agent_performance',case when use_all then coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id',a.user_id,'name',a.name,'role',a.role,'leads',a.leads,
        'viewings',a.viewings,'transactions',a.transactions,
        'average_response_minutes',coalesce(a.response_minutes,0),
        'conversion_rate',case when a.leads=0 then 0 else round(100.0*a.converted/a.leads,1) end
      ) order by a.transactions desc,a.converted desc,a.leads desc,a.name)
      from agent_rows a
    ),'[]'::jsonb) else '[]'::jsonb end,
    'definitions',jsonb_build_object(
      'new_leads','Leaduri primite în perioada selectată.',
      'uncontacted_leads','Leaduri active, fără primul răspuns și fără contact confirmat, indiferent de data intrării.',
      'average_response_minutes','Media minutelor dintre primirea leadului și primul răspuns/contact confirmat, pentru cohorta perioadei.',
      'viewings','Vizionări neanulate cu data programată în perioadă.',
      'offers','Leaduri distincte care au intrat în etapa Ofertă în perioadă.',
      'reservations','Leaduri distincte care au intrat în etapa Rezervare în perioadă.',
      'transactions','Tranzacții finalizate în perioadă.',
      'revenue','Comisioane înregistrate în registrul financiar în perioadă, separate pe monedă.',
      'estimated_commission','Comisionul din tranzacțiile încă nefinalizate, separat pe monedă.',
      'active_properties','Proprietăți active în acest moment.',
      'expired_properties','Proprietăți cu status Expirată în acest moment.',
      'listing_errors','Listări curente cu status de eroare/respingere sau mesaj de eroare.',
      'conversion_rate','Procentul leadurilor primite în perioadă care sunt acum finalizate/câștigate.',
      'open_tasks','Taskuri nefinalizate în acest moment.',
      'followups','Taskuri deschise de follow-up în acest moment.',
      'leads_without_next_action','Leaduri active fără data următoarei acțiuni.'
      ,'lead_sources','Distribuția leadurilor primite în perioada selectată după sursa normalizată.'
      ,'portal_performance','Starea curentă a listărilor; rata activă exclude listările retrase sau expirate din numitor.'
      ,'agent_performance','Leaduri, răspuns, vizionări, tranzacții și conversie calculate cu aceeași perioadă pentru fiecare agent.'
    )
  ) into result;

  return result;
end
$$;

revoke all on function public.crm_dashboard_kpis(uuid,uuid,boolean,timestamptz,timestamptz)
  from public,anon,authenticated;
grant execute on function public.crm_dashboard_kpis(uuid,uuid,boolean,timestamptz,timestamptz)
  to service_role;

comment on function public.crm_dashboard_kpis(uuid,uuid,boolean,timestamptz,timestamptz) is
  'Exact, unbounded KPI aggregation. Validates tenant/user and refuses all-agency scope for non-management roles.';

commit;
