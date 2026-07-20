-- Rollback for Phase 5 policies.
-- Historical permission/security-event data and profile permissions are kept.
-- This intentionally falls back to agency-only RLS and must be used only as an
-- emergency rollback together with the previous application release.

begin;

do $$
declare
  tbl_name text;
  scoped_tables text[] := array[
    'properties','contacts','demands','leads','calendar_events','tasks','prospects',
    'transactions','activities','activity_logs','property_documents','portal_listings',
    'portal_tokens','message_templates'
  ];
begin
  foreach tbl_name in array scoped_tables loop
    if to_regclass('public.' || tbl_name) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', 'crm_' || tbl_name || '_select', tbl_name);
    execute format('drop policy if exists %I on public.%I', 'crm_' || tbl_name || '_insert', tbl_name);
    execute format('drop policy if exists %I on public.%I', 'crm_' || tbl_name || '_update', tbl_name);
    execute format('drop policy if exists %I on public.%I', 'crm_' || tbl_name || '_delete', tbl_name);
    execute format('drop policy if exists %I on public.%I', 'crm_' || tbl_name || '_managed', tbl_name);
    execute format('drop policy if exists %I on public.%I', 'crm_' || tbl_name || '_agency_scope', tbl_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (agency_id = public.current_crm_agency_id()) with check (agency_id = public.current_crm_agency_id())',
      'crm_' || tbl_name || '_agency_scope', tbl_name
    );
  end loop;
end $$;

commit;
