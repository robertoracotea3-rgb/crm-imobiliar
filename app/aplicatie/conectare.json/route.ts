import { crmConfig } from '@/lib/public-properties';

/*
 * app.kiraimobiliare.ro/conectare.json: the CRM's database address and its publishable key, so agents sign in to
 * Kira Imobiliare (phone and PC) with only their email and password. Both are public by design: the data is guarded
 * by the account and by the membership the administrator gives (crm_is_member). crmConfig() refuses a secret or
 * service_role key, so one can never be handed out here. Only on the app host (proxy.ts, next.config.ts rewrites).
 */
export const dynamic = 'force-dynamic';

const HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
  // The PC app runs on http://localhost and asks for it from there.
  'Access-Control-Allow-Origin': '*',
};

export function GET() {
  const cfg = crmConfig();
  if (!cfg) return Response.json({ ok: false }, { status: 503, headers: HEADERS });
  return Response.json({ url: cfg.url, key: cfg.key }, { headers: HEADERS });
}
