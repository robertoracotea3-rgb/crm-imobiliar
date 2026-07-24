-- Non-destructive rollback. Interaction evidence and the corrected WhatsApp
-- behavior remain in place so rollback cannot recreate false contacts.

begin;

drop trigger if exists crm_enforce_contact_evidence_trigger on public.leads;
drop function if exists public.crm_enforce_contact_evidence();
drop function if exists public.crm_missing_contact_description_count(uuid, uuid, boolean);
drop function if exists public.crm_record_lead_contact(
  uuid, uuid, uuid, text, text, text, text, uuid, numeric, numeric,
  text, text, text, text, timestamptz, timestamptz, text
);

comment on table public.lead_contact_interactions is
  'Retained after rollback; factual contact history must not be deleted.';
comment on function public.record_whatsapp_outcome(uuid, uuid, uuid, text, timestamptz) is
  'Corrected behavior retained: a sent WhatsApp message is not a successful contact.';

commit;
