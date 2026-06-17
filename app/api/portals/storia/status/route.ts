import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getValidToken } from '@/lib/storia-api';

// GET /api/portals/storia/status?property_id=<optional>
// Returns: connection status + listings for a specific property (or all listings).
export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: agency } = await supabase.from('agencies').select('id').single();
  if (!agency) return NextResponse.json({ error: 'No agency' }, { status: 400 });

  // Check connection
  const { data: tokenRow } = await supabase
    .from('portal_tokens')
    .select('expires_at, scope, created_at')
    .eq('agency_id', agency.id)
    .eq('portal', 'storia')
    .single();

  const connected = !!tokenRow;
  const token = connected ? await getValidToken(supabase, agency.id) : null;
  const tokenValid = !!token;

  const { searchParams } = new URL(request.url);
  const propertyId = searchParams.get('property_id');

  let listing = null;
  let listings: unknown[] = [];

  if (propertyId) {
    const { data } = await supabase
      .from('portal_listings')
      .select('*')
      .eq('property_id', propertyId)
      .eq('portal', 'storia')
      .single();
    listing = data;
  } else {
    const { data } = await supabase
      .from('portal_listings')
      .select('*')
      .eq('agency_id', agency.id)
      .eq('portal', 'storia')
      .order('updated_at', { ascending: false });
    listings = data || [];
  }

  return NextResponse.json({
    connected,
    token_valid: tokenValid,
    connected_at: tokenRow?.created_at || null,
    listing,
    listings,
    credentials_configured: !!(
      process.env.STORIA_CLIENT_ID && process.env.STORIA_CLIENT_SECRET && process.env.STORIA_API_KEY
    ),
  });
}
