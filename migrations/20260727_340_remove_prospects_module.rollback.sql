-- This phase intentionally deletes prospecting data at the owner's request.
-- An automatic rollback cannot reconstruct deleted rows. Restore the verified
-- pre-deployment backup into an isolated Supabase project instead.

do $rollback_guard$
begin
  raise exception 'crm_prospects_removal_requires_verified_backup_restore';
end
$rollback_guard$;
