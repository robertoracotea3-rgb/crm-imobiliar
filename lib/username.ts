// Login uses a synthetic email derived from a username: "robert" → "robert@fortis.crm".
// Keep this transform in ONE place so the login page and the team API never drift apart.
export const USERNAME_EMAIL_DOMAIN = 'fortis.crm';

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase().replace(/\s+/g, '.');
}

export function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@${USERNAME_EMAIL_DOMAIN}`;
}

// Returns the username for a login email, or '' if the email isn't a username@fortis.crm
// address (e.g. legacy agents created with a real email — they have no username yet).
export function emailToUsername(email: string | null | undefined): string {
  if (!email) return '';
  const suffix = `@${USERNAME_EMAIL_DOMAIN}`;
  return email.toLowerCase().endsWith(suffix) ? email.slice(0, email.length - suffix.length) : '';
}
