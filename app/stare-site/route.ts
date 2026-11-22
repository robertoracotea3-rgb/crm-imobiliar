import { crmConfig, crmConfigProblem, crmHeaders } from '@/lib/public-properties';
import { storiaStatus } from '@/lib/storia';

/*
 * /stare-site: why the properties from the CRM do or do not show on the site.
 * It reads the same function as the pages, fresh, and says what to fix. It never shows the address or the key.
 */
export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };

export async function GET() {
  const problem = crmConfigProblem();
  const cfg = crmConfig();
  if (problem || !cfg) {
    return Response.json({ ok: false, setari_vercel: problem || 'lipsesc', ce_faci: 'Vercel › Settings › Environment Variables, apoi Redeploy.' }, { headers: HEADERS });
  }

  let baza = '';
  let proprietati: number | null = null;
  let cod: string | null = null;
  try {
    const res = await fetch(`${cfg.url}/rest/v1/rpc/crm_site_properties`, {
      headers: { ...crmHeaders(cfg.key), Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    baza = `răspunde (HTTP ${res.status})`;
    const body: unknown = await res.json().catch(() => null);
    if (res.ok && Array.isArray(body)) proprietati = body.length;
    else if (body && typeof body === 'object' && typeof (body as { code?: unknown }).code === 'string') cod = (body as { code: string }).code.slice(0, 20);
    if (res.status === 401 || res.status === 403) cod = cod || `HTTP ${res.status}`;
  } catch (e) {
    baza = e instanceof Error && e.name === 'TimeoutError' ? 'nu răspunde în 8 secunde (proiectul e oprit?)' : 'nu se poate conecta (adresa e greșită sau proiectul e oprit)';
  }

  let ceFaci: string;
  if (proprietati === null && !baza.startsWith('răspunde')) ceFaci = 'Verifică în Supabase că proiectul e pornit și că KIRA_CRM_URL e adresa lui.';
  else if (cod === 'PGRST202' || cod === '42883' || cod === 'HTTP 404') ceFaci = 'Actualizează baza online: Administrator CRM Kira › Setări › Baza online (sau crm-online.sql în Supabase › SQL Editor).';
  else if (cod && /^(HTTP 40[13]|PGRST30\d|42501)$/.test(cod)) ceFaci = 'Cheia nu e acceptată: pune în KIRA_CRM_PUBLISHABLE_KEY cheia publică a ACELUIAȘI proiect, apoi Redeploy.';
  else if (proprietati === null) ceFaci = 'Baza a răspuns neașteptat; actualizeaz-o din nou: Administrator CRM Kira › Setări › Baza online (sau crm-online.sql în Supabase › SQL Editor).';
  else if (proprietati === 0) ceFaci = 'Totul e legat, dar în baza online nu e nicio proprietate bifată „Site Kira” cu statusul Activă. Verifică în Kira Imobiliare că norișorul e verde.';
  else ceFaci = 'Totul e în regulă. O schimbare din CRM apare pe pagini în 1-2 minute.';

  return Response.json({ ok: (proprietati ?? 0) > 0, setari_vercel: 'corecte', baza, cod_eroare: cod, proprietati_pe_site: proprietati, ce_faci: ceFaci, storia: await storiaStatus() }, { headers: HEADERS });
}
