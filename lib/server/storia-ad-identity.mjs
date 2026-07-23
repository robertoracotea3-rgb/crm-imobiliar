export const STORIA_PORTAL_KEY = 'storia';
export const STORIA_CRM_PORTAL_ID = 'storia_olx';

const asIdentifier = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
};

const record = (value) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : null
);

/**
 * OLX/Storia uses two advert identifiers:
 * - uuid: API object identifier, used by /advert/v1/{uuid}
 * - id: numeric public advert identifier, delivered as data.ad_id in messages
 */
export function extractStoriaAdvertIdentity(payload) {
  const root = record(payload) || {};
  const data = record(root.data) || root;
  const advert = record(data.advert) || record(root.advert) || {};
  const state = record(data.state) || record(advert.state) || record(root.state) || {};

  const externalId = asIdentifier(
    data.uuid ?? advert.uuid ?? root.uuid ?? data.external_id ?? root.external_id,
  );
  const portalAdId = asIdentifier(
    data.id ?? data.ad_id ?? data.advert_id ?? advert.id ?? root.ad_id ?? root.advert_id,
  );
  const advertUrl = asIdentifier(
    state.url ?? data.url ?? data.advert_url ?? advert.url ?? root.url ?? root.advert_url,
  );

  return { externalId, portalAdId, advertUrl };
}

export function normalizePortalAdId(value) {
  return asIdentifier(value);
}

export function buildStoriaAdvertLookupPlan(input = {}) {
  const plan = [];
  const portalAdId = normalizePortalAdId(input.ad_id);
  const externalId = asIdentifier(input.external_id);
  const propertyId = asIdentifier(input.property_id);
  const advertUrl = asIdentifier(input.ad_url);
  if (portalAdId) plan.push({ kind: 'portal_ad_id', value: portalAdId });
  if (externalId) plan.push({ kind: 'external_id', value: externalId });
  if (propertyId) plan.push({ kind: 'property_id', value: propertyId });
  if (advertUrl) plan.push({ kind: 'advert_url', value: advertUrl });
  return plan;
}
