import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Webhook endpoint for OLX/Storia notifications.
// Registered in the Developer Hub. The "Test Callback" button there pings this URL
// and requires a 2xx response, so we ALWAYS return 200 (never 4xx/5xx) — that also
// follows webhook best practice: acknowledge receipt, then process asynchronously.

// GET — used by some availability checks / the Test Callback button.
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  // Parse leniently — an empty/non-JSON body (e.g. the Test Callback ping) must still 200.
  const raw = await request.text().catch(() => '');
  let payload: { event?: string; data?: { id?: string; advert_id?: string; status?: string; reason?: string } } | null = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }

  // Nothing actionable (ping / test) → acknowledge.
  if (!payload || !payload.data) {
    return NextResponse.json({ ok: true });
  }

  // Signature check gates whether we TRUST the event — it never changes the 200 response.
  const signature = request.headers.get('x-olx-signature') || request.headers.get('x-olxgroup-signature');
  const secret    = process.env.STORIA_WEBHOOK_SECRET;
  let trusted = true;
  if (secret && signature) {
    try {
      const crypto = await import('crypto');
      const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
      trusted = signature === expected;
    } catch {
      trusted = false;
    }
  }

  if (trusted) {
    const { event, data } = payload;
    const externalId = data!.id || data!.advert_id;
    const newStatus  = data!.status;
    if (externalId && newStatus) {
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        await supabase.from('portal_listings')
          .update({
            status:        newStatus,
            last_sync_at:  new Date().toISOString(),
            error_message: data!.reason || null,
            updated_at:    new Date().toISOString(),
          })
          .eq('external_id', externalId)
          .eq('portal', 'storia');
      } catch (e) {
        console.error('[Storia webhook] db update failed', e);
      }
    }
    console.log('[Storia webhook]', event, externalId, newStatus);
  } else {
    console.warn('[Storia webhook] untrusted signature — ignored event');
  }

  return NextResponse.json({ ok: true });
}
