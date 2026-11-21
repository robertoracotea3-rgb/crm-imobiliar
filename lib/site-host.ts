const PUBLIC_HOSTS = new Set(["kiraimobiliare.ro", "www.kiraimobiliare.ro"]);

function normalizeHost(value: string | null | undefined): string {
  return (value || "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
}

/** The public website's production domains and the Vercel previews of fortis-website. */
export function isPublicWebsiteHost(value: string | null | undefined): boolean {
  const host = normalizeHost(value);
  return PUBLIC_HOSTS.has(host) || /^fortis-website(?:-|\.)/.test(host);
}

export function canonicalHost(): string {
  return "https://www.kiraimobiliare.ro";
}
