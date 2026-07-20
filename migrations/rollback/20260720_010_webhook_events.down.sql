-- Rollback sigur pentru Faza 1.
-- Oprește rezervarea de evenimente, dar păstrează tabela și istoricul primit.
-- După rollbackul aplicației, tabela poate fi arhivată manual numai după export.

begin;

revoke execute on function public.reserve_webhook_event(text, text, text, text, text, text, jsonb)
  from service_role;

drop function if exists public.reserve_webhook_event(text, text, text, text, text, text, jsonb);

comment on table public.webhook_events is
  'Retained after application rollback on 2026-07-20; do not drop before archival.';

commit;
