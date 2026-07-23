export const PASSWORD_POLICY_MESSAGE =
  'Parola trebuie să aibă 12–128 caractere și cel puțin trei tipuri: litere mici, litere mari, cifre, simboluri.';

export function isStrongPassword(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) return false;
  return [
    /[a-z]/.test(value),
    /[A-Z]/.test(value),
    /\d/.test(value),
    /[^A-Za-z0-9]/.test(value),
  ].filter(Boolean).length >= 3;
}
