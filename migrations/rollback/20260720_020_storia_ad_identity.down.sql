-- Non-destructive Phase 2 rollback.
-- The application can stop using the new fields while linkage and audit history stay intact.

begin;

drop index if exists public.leads_portal_listing_conversation_idx;
drop index if exists public.leads_agency_webhook_transaction_uidx;
drop index if exists public.leads_unmatched_storia_idx;
drop index if exists public.portal_listings_portal_ad_lookup_idx;
drop index if exists public.portal_listings_agency_portal_ad_uidx;

revoke all on table public.portal_unmatched_messages from authenticated, anon;
revoke all on table public.portal_backfill_runs from authenticated, anon;

comment on table public.portal_unmatched_messages is
  'Preserved after rollback so unmatched-message history is not destroyed.';
comment on table public.portal_backfill_runs is
  'Preserved after rollback so migration audit history is not destroyed.';

commit;
