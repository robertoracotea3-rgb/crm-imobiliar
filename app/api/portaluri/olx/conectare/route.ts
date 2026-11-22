import { NextResponse } from 'next/server';
import { OLX_AUTH_URL, OLX_REDIRECT_URI, olxClientId, olxConfigProblem, olxSqlReady } from '@/lib/olx';
import { DbError, dbMessage, portalDb } from '@/lib/storia';
import { storiaPage } from '@/lib/storia-page';

/*
 * Step 1 of connecting the agency's OLX.ro account. Administrator CRM Kira opens this page with a one-time code
 * (crm_admin_portal_stare, valid 15 minutes); only then does it send the browser to OLX's authorization page.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const stare = new URL(request.url).searchParams.get('stare') || '';
  const problem = olxConfigProblem();
  if (problem) return storiaPage('OLX.ro nu e pregătit încă', `În Vercel ${problem}. Pune-le, dă Redeploy și pornește din nou conectarea din Administrator CRM Kira.`, 503, false, 'OLX');
  if (!/^[0-9a-f]{64}$/.test(stare)) return storiaPage('Link incomplet', 'Pornește conectarea din Administrator CRM Kira › Setări › OLX.ro › Conectează contul OLX.', 400, false, 'OLX');
  try {
    if (!(await olxSqlReady())) {
      return storiaPage('Baza nu e pregătită pentru OLX.ro', 'Rulează crm-online.sql (versiunea 7) în Supabase › SQL Editor, apoi pornește din nou conectarea din Administrator CRM Kira.', 503, false, 'OLX');
    }
    if (!(await portalDb<boolean>('crm_portal_stare_ok', { p_stare: stare, p_consuma: false }))) {
      return storiaPage('Linkul a expirat', 'Linkul de conectare e valabil 15 minute și o singură dată. Pornește din nou conectarea din Administrator CRM Kira.', 400, false, 'OLX');
    }
  } catch (e) {
    return storiaPage('Nu pot verifica linkul', dbMessage(e instanceof DbError ? e.code : ''), 503, false, 'OLX');
  }
  const url = new URL(OLX_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: olxClientId(), response_type: 'code', state: stare, scope: 'read write v2', redirect_uri: OLX_REDIRECT_URI,
  }).toString();
  return NextResponse.redirect(url.toString(), 302);
}
