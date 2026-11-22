import { storiaPage } from '@/lib/storia-page';

/*
 * The redirect URI registered for the OLX.ro Partner API app (developer.olx.ro). OLX sends the browser back here
 * after the agency's OLX account allows the app. The OLX.ro connection (publishing on OLX.ro and its buyer messages)
 * is not switched on yet: until it is, this page only says so.
 */
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  if (q.get('error')) {
    return storiaPage('Conectarea a fost oprită', 'OLX nu a dat acces (ai apăsat Renunță sau contul nu are drept).', 400, false, 'OLX');
  }
  return storiaPage(
    'Legătura cu OLX.ro nu e pornită încă',
    'Aici se va întoarce OLX după ce contul OLX al agenției dă acces aplicației Kira Imobiliare. Până atunci nu ai nimic de făcut pe această pagină.',
    200, false, 'OLX',
  );
}
