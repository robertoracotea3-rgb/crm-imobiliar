-- Rollback sigur pentru Faza 6.
-- Tabelele și jurnalele sunt păstrate intenționat pentru audit și restaurare.

begin;

comment on table public.feed_tokens is
  'Păstrat după rollback-ul aplicației; tokenurile nu sunt în clar și nu trebuie șterse fără arhivare.';
comment on table public.feed_export_logs is
  'Păstrat după rollback-ul aplicației pentru istoricul exporturilor.';
comment on table public.feed_export_log_items is
  'Păstrat după rollback-ul aplicației pentru motivele includerii/excluderii.';

revoke all on public.feed_tokens from public, anon, authenticated;
revoke all on public.feed_export_logs from public, anon, authenticated;
revoke all on public.feed_export_log_items from public, anon, authenticated;

commit;
