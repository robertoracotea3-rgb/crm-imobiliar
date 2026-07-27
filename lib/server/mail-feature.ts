import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export function mailOnboardingEnabled(): boolean {
  return process.env.MAIL_ONBOARDING_ENABLED?.trim().toLowerCase() === 'true';
}

export async function mailboxAddressForUser(
  client: SupabaseClient,
  agencyId: string,
  userId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from('crm_mailboxes')
    .select('address')
    .eq('agency_id', agencyId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return typeof data?.address === 'string' ? data.address : null;
}
