import 'server-only';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** A small page in the site's colours for the Storia / OLX connection steps (opened from Administrator CRM Kira). */
export function storiaPage(title: string, text: string, status = 200, good = false, portal = 'Storia'): Response {
  const body = `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)} · Kira Imobiliare</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f3ee;color:#121417;font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px;box-sizing:border-box}
main{max-width:520px;background:#fff;border:1px solid #e7e1d6;border-radius:16px;padding:32px;box-shadow:0 10px 30px rgba(18,20,23,.06)}
p.k{margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:${good ? '#2f7d4f' : '#9a7a35'}}
h1{margin:0 0 12px;font-size:24px;line-height:1.3}p{margin:0;color:#4b4842}</style></head>
<body><main><p class="k">${esc(portal)} · Kira Imobiliare</p><h1>${esc(title)}</h1><p>${esc(text)}</p></main></body></html>`;
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}
