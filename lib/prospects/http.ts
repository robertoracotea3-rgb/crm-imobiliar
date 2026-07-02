// Fetch cu antet de browser + timeout, folosit de toate adaptoarele.
// Notă: în producție (Vercel) unele portaluri pot bloca IP-urile de datacenter;
// dacă apare, se poate ruta prin proxy setând PROSPECTS_PROXY_URL (ex: un scraper API).

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export async function fetchHtml(url: string, timeoutMs = 25000): Promise<string> {
  const proxy = process.env.PROSPECTS_PROXY_URL; // opțional: `https://api.scraperapi.com?api_key=...&url=`
  const target = proxy ? proxy + encodeURIComponent(url) : url;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(target, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ro-RO,ro;q=0.9,en;q=0.8',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}
