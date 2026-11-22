import { NextResponse } from 'next/server';
import { DbError, STORIA_AUTH_URL, dbMessage, loadKeys, portalDb, storiaConfigProblem } from '@/lib/storia';
import { storiaPage } from '@/lib/storia-page';

/*
 * Step 1 of connecting the agency's Storia account. Administrator CRM Kira opens this page with a one-time code
 * (crm_admin_portal_stare, valid 15 minutes); only then does it send the browser to Storia's authorization page.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const stare = new URL(request.url).searchParams.get('stare') || '';
  const problem = await storiaConfigProblem(true).catch((e) => dbMessage(e instanceof DbError ? e.code : ''));
  if (problem) return storiaPage('Storia nu e pregătită încă', `Ce lipsește: ${problem}. După ce rezolvi, pornește din nou conectarea din Administrator CRM Kira.`, 503);
  if (!/^[0-9a-f]{64}$/.test(stare)) return storiaPage('Link incomplet', 'Pornește conectarea din Administrator CRM Kira › Setări › Storia / OLX › Conectează contul Storia.', 400);
  try {
    if (!(await portalDb<boolean>('crm_portal_stare_ok', { p_stare: stare, p_consuma: false }))) {
      return storiaPage('Linkul a expirat', 'Linkul de conectare e valabil 15 minute și o singură dată. Pornește din nou conectarea din Administrator CRM Kira.', 400);
    }
  } catch (e) {
    return storiaPage('Nu pot verifica linkul', dbMessage(e instanceof DbError ? e.code : ''), 503);
  }
  const url = new URL(STORIA_AUTH_URL);
  const keys = (await loadKeys()).keys;
  if (!keys) return storiaPage('Storia nu e pregătită încă', 'Lipsesc cheile aplicației OLX Group: le pui în Administrator CRM Kira › Setări › Storia / OLX.', 503);
  url.search = new URLSearchParams({ response_type: 'code', client_id: keys.clientId, state: stare }).toString();
  return NextResponse.redirect(url.toString(), 302);
}
