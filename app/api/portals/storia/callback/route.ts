import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { exchangeCode } from '@/lib/storia-api';

// GET /api/portals/storia/callback?code=...
// OAuth2 callback — exchanges code for tokens and saves them.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code  = searchParams.get('code');
  const error = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://crm.fortisfagaras.ro';

  if (error) {
    return NextResponse.redirect(
      `${appUrl}/portals?storia_error=${encodeURIComponent(error)}`
    );
  }
  if (!code) {
    return NextResponse.redirect(`${appUrl}/portals?storia_error=no_code`);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const tokens = await exchangeCode(code);

    const { data: agency } = await supabase
      .from('agencies')
      .select('id')
      .single();

    if (!agency) throw new Error('Agency not found');

    await supabase.from('portal_tokens').upsert(
      {
        agency_id:     agency.id,
        portal:        'storia',
        access_token:  tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type:    tokens.token_type,
        expires_at:    new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        scope:         tokens.scope,
        updated_at:    new Date().toISOString(),
      },
      { onConflict: 'agency_id,portal' }
    );

    return NextResponse.redirect(`${appUrl}/portals?storia_connected=1`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Eroare necunoscuta';
    return NextResponse.redirect(
      `${appUrl}/portals?storia_error=${encodeURIComponent(msg)}`
    );
  }
}
