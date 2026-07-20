const onlyDigits = (value) => value.replace(/\D/g, '');

export function normalizeWhatsAppPhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return { ok: false, reason: 'missing_phone', digits: null, e164: null };

  let compact = raw.replace(/^tel:/i, '').trim();
  const hadPlus = compact.startsWith('+');
  compact = onlyDigits(compact);
  if (compact.startsWith('00')) compact = compact.slice(2);

  let digits = compact;
  if (!hadPlus && /^07\d{8}$/.test(digits)) digits = `4${digits}`;

  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    return { ok: false, reason: 'invalid_e164', digits: null, e164: null };
  }
  return { ok: true, reason: null, digits, e164: `+${digits}` };
}

export function buildDefaultWhatsAppMessage({ clientName, propertyTitle, propertyUrl }) {
  const greeting = clientName ? `Bună ziua, ${clientName}!` : 'Bună ziua!';
  const property = propertyTitle ? ` despre proprietatea „${propertyTitle}”` : '';
  const link = propertyUrl ? `\n\nDetalii: ${propertyUrl}` : '';
  return `${greeting} Vă contactez din partea Kira Imobiliare${property}.${link}`;
}

export function createWhatsAppLink({ phone, message }) {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized.ok) return { ...normalized, url: null };
  const text = String(message || '').trim();
  if (!text) return { ok: false, reason: 'missing_message', digits: normalized.digits, e164: normalized.e164, url: null };
  return {
    ...normalized,
    url: `https://wa.me/${normalized.digits}?text=${encodeURIComponent(text)}`,
  };
}
