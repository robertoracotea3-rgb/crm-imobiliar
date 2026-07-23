export type CommissionInput = {
  price?: unknown;
  currency?: unknown;
  attributes?: Record<string, unknown> | null;
};

export type CommissionBreakdown = {
  owner: number;
  counterparty: number;
  total: number;
  currency: string;
  source: 'explicit_value' | 'percentage' | 'legacy_percentage' | 'none';
};

const money = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0;
};

const percentageValue = (price: number, percentage: unknown): number =>
  Math.round((price * money(percentage) / 100) * 100) / 100;

export function calculatePropertyCommission(input: CommissionInput): CommissionBreakdown {
  const attributes = input.attributes || {};
  const price = money(input.price);
  const ownerExplicit = money(attributes.comision_prop_val);
  const counterpartyExplicit = money(attributes.comision_chir_val);
  const owner = ownerExplicit || percentageValue(price, attributes.comision_prop_pct);
  const counterparty = counterpartyExplicit || percentageValue(price, attributes.comision_chir_pct);
  const legacy = !owner && !counterparty
    ? percentageValue(price, attributes.comision)
    : 0;
  const total = Math.round((owner + counterparty + legacy) * 100) / 100;

  return {
    owner: owner || legacy,
    counterparty,
    total,
    currency: String(attributes.currency || input.currency || 'EUR').toUpperCase(),
    source: ownerExplicit || counterpartyExplicit
      ? 'explicit_value'
      : owner || counterparty
        ? 'percentage'
        : legacy
          ? 'legacy_percentage'
          : 'none',
  };
}
