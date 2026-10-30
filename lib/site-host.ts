const PUBLIC_HOSTS = new Set(["kiraimobiliare.ro", "www.kiraimobiliare.ro"]);
const CRM_HOSTS = new Set(["crm.kiraimobiliare.ro", "crm-fortis.vercel.app"]);

function normalizeHost(value: string | null | undefined): string {
  return (value || "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
}

/** Public website production domains and Vercel previews for fortis-website. */
export function isPublicWebsiteHost(value: string | null | undefined): boolean {
  const host = normalizeHost(value);
  return PUBLIC_HOSTS.has(host) || /^fortis-website(?:-|\.)/.test(host);
}

/** CRM production domains and Vercel previews for crm-fortis. */
export function isCrmApplicationHost(value: string | null | undefined): boolean {
  const host = normalizeHost(value);
  return CRM_HOSTS.has(host) || /^crm-fortis(?:-|\.)/.test(host);
}

export function canonicalHost(value: string | null | undefined): string {
  return isCrmApplicationHost(value) ? "https://crm.kiraimobiliare.ro" : "https://www.kiraimobiliare.ro";
}
