import { after } from 'next/server';
import { exchangeOlxCode, olxConfigProblem, olxSqlReady, runOlx } from '@/lib/olx';
import { DbError, dbMessage, portalDb } from '@/lib/storia';
import { storiaPage } from '@/lib/storia-page';

/*
 * Step 2: OLX sends the browser back here (the "Redirect URI" of the app on developer.olx.ro) with ?code=…&state=….
 * The code becomes the account's tokens, kept in the CRM's database (crm_portal_cont, portal 'olx').
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const page = (title: string, text: string, status = 200, good = false) => storiaPage(title, text, status, good, 'OLX');
const OLD_SQL = 'Baza nu are încă partea de OLX.ro: rulează crm-online.sql (versiunea 7) în Supabase › SQL Editor, apoi conectează din nou din Administrator CRM Kira.';

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const code = q.get('code') || '', state = q.get('state') || '', error = q.get('error');
  if (error) return page('Conectarea a fost oprită', 'OLX nu a dat acces (ai apăsat Renunță sau contul nu are drept). Poți încerca din nou din Administrator CRM Kira.', 400);
  // Opened by hand (or OLX checking the address): nothing to do.
  if (!code && !state) return page('Aici se întoarce OLX după conectare', 'Contul OLX al agenției se conectează din Administrator CRM Kira › Setări › OLX.ro. Nu ai nimic de făcut pe această pagină.');
  const problem = olxConfigProblem();
  if (problem) return page('OLX.ro nu e pregătit încă', `În Vercel ${problem}.`, 503);
  if (!code || code.length > 2000 || !/^[0-9a-f]{64}$/.test(state)) return page('Link incomplet', 'Pornește conectarea din Administrator CRM Kira › Setări › OLX.ro.', 400);
  try {
    // Before version 7 the database keeps one account only (Storia's): OLX's must not take its place.
    if (!(await olxSqlReady())) return page('Conectarea nu s-a salvat', OLD_SQL, 503);
    if (!(await portalDb<boolean>('crm_portal_stare_ok', { p_stare: state, p_consuma: false }))) {
      return page('Linkul a expirat', 'Pornește din nou conectarea din Administrator CRM Kira (linkul e valabil 15 minute).', 400);
    }
    const t = await exchangeOlxCode(code);
    if (!t.ok) return page('OLX nu a acceptat conectarea', `Răspunsul OLX: ${t.error}. Verifică în Vercel OLX_CLIENT_ID și OLX_CLIENT_SECRET, iar pe developer.olx.ro adresa de întoarcere, apoi încearcă din nou.`, 400);
    if (!(await portalDb<boolean>('crm_portal_stare_ok', { p_stare: state, p_consuma: true }))) {
      return page('Linkul a fost deja folosit', 'Contul s-a conectat deja din acest link. Verifică starea în Administrator CRM Kira.', 400);
    }
    await portalDb('crm_portal_cont_set', {
      p: { access_token: t.t.access_token, refresh_token: t.t.refresh_token, expires_in: t.t.expires_in ?? 86400, portal: 'olx' },
    });
  } catch (e) {
    const c = e instanceof DbError ? e.code : '';
    return page('Conectarea nu s-a salvat', c === 'old_sql' ? OLD_SQL : dbMessage(c), 503);
  }
  // Properties already ticked "OLX" leave right away.
  after(() => runOlx().then(() => undefined, () => undefined));
  return page('Contul OLX e conectat', 'Proprietățile bifate „OLX” și active pleacă singure pe OLX.ro, iar mesajele primite pe OLX intră în Kira Imobiliare ca clienți. Poți închide această pagină.', 200, true);
}
