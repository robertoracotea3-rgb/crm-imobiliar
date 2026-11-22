import { after } from 'next/server';
import { DbError, dbMessage, exchangeCode, loadKeys, portalDb, runStoria, storiaConfigProblem } from '@/lib/storia';
import { storiaPage } from '@/lib/storia-page';

/*
 * Step 2: Storia sends the browser back here (the "authentication callback URL" set in OLX's Application Manager)
 * with ?code=…&state=…. The code (valid 60 seconds) becomes the account's tokens, kept in the CRM's database.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const code = q.get('code') || '', state = q.get('state') || '', error = q.get('error');
  if (error) return storiaPage('Conectarea a fost oprită', 'Storia nu a dat acces (ai apăsat Renunță sau contul nu are drept). Poți încerca din nou din Administrator CRM Kira.', 400);
  const problem = await storiaConfigProblem(true).catch((e) => dbMessage(e instanceof DbError ? e.code : ''));
  if (problem) return storiaPage('Storia nu e pregătită încă', `Ce lipsește: ${problem}.`, 503);
  if (!code || code.length > 2000 || !/^[0-9a-f]{64}$/.test(state)) return storiaPage('Link incomplet', 'Pornește conectarea din Administrator CRM Kira › Setări › Storia / OLX.', 400);
  try {
    if (!(await portalDb<boolean>('crm_portal_stare_ok', { p_stare: state, p_consuma: false }))) {
      return storiaPage('Linkul a expirat', 'Pornește din nou conectarea din Administrator CRM Kira (linkul e valabil 15 minute).', 400);
    }
    const keys = (await loadKeys()).keys;
    if (!keys) return storiaPage('Storia nu e pregătită încă', 'Lipsesc cheile aplicației OLX Group: le pui în Administrator CRM Kira › Setări › Storia / OLX.', 503);
    const t = await exchangeCode(keys, code);
    if (!t.ok) return storiaPage('Storia nu a acceptat conectarea', `Răspunsul Storia: ${t.error}. Verifică cheile aplicației (Administrator CRM Kira › Setări › Storia / OLX) și, în Application Manager, adresa de întoarcere, apoi încearcă din nou.`, 400);
    if (!(await portalDb<boolean>('crm_portal_stare_ok', { p_stare: state, p_consuma: true }))) {
      return storiaPage('Linkul a fost deja folosit', 'Contul s-a conectat deja din acest link. Verifică starea în Administrator CRM Kira.', 400);
    }
    await portalDb('crm_portal_cont_set', { p: { access_token: t.t.access_token, refresh_token: t.t.refresh_token, expires_in: t.t.expires_in ?? 3600 } });
  } catch (e) {
    return storiaPage('Conectarea nu s-a salvat', dbMessage(e instanceof DbError ? e.code : ''), 503);
  }
  // Properties already ticked "Storia/OLX" leave right away.
  after(() => runStoria().then(() => undefined, () => undefined));
  return storiaPage('Contul Storia e conectat', 'Proprietățile bifate „Storia/OLX” și active pleacă singure pe Storia (și de acolo pe OLX.ro), iar mesajele de la anunțuri intră în Kira Imobiliare. Poți închide această pagină.', 200, true);
}
