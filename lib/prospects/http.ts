// Acces HTTP simplu, identificabil și limitat. Nu există proxy, rotire de IP,
// CAPTCHA solving sau alt mecanism de ocolire a protecțiilor portalurilor.
const USER_AGENT = 'KiraCRM/1.0 (+https://kiraimobiliare.ro/contact)';

async function publicFetch(url: string, accept: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'User-Agent': USER_AGENT, Accept: accept, 'Accept-Language': 'ro-RO,ro;q=0.9' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchHtml(url: string, timeoutMs = 25_000): Promise<string> {
  return (await publicFetch(url, 'text/html,application/xhtml+xml', timeoutMs)).text();
}

export async function fetchJson<T>(url: string, timeoutMs = 20_000): Promise<T> {
  return (await publicFetch(url, 'application/json', timeoutMs)).json() as Promise<T>;
}
