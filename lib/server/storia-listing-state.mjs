import { extractStoriaAdvertIdentity } from './storia-ad-identity.mjs';

export const STORIA_STALE_AFTER_MS = 36 * 60 * 60 * 1000;
export const STORIA_ON_DEMAND_FRESH_MS = 5 * 60 * 1000;

const record = value => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

const shortText = (value, limit = 500) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized ? normalized.slice(0, limit) : null;
};

export function mapStoriaStatus(raw) {
  const up = String(raw || '').toUpperCase();
  if (up === 'POSTED' || up === 'POST' || up === 'PUT') return 'active';
  if (up === 'TO_POST' || up === 'TO_PUT' || up === 'TO_DELETE'
    || up === 'TO_ACTIVATE' || up === 'TO_DEACTIVATE') return 'pending';
  if (up === 'NOT_POSTED') return 'error';
  if (up === 'REJECTED') return 'rejected';
  if (up === 'EXPIRED' || up === 'DEACTIVATED') return 'expired';
  if (up.includes('DELETE')) return 'deleted';
  return String(raw || 'pending').toLowerCase();
}

export function parseStoriaMetadata(payload) {
  const root = record(payload);
  const data = record(root.data);
  const item = Object.keys(data).length ? data : root;
  const state = record(item.state);
  const moderation = record(state.moderation);
  const lastError = record(item.last_error);
  const identity = extractStoriaAdvertIdentity(item);
  const rawStatus = item.last_action_status ?? item.status ?? state.code ?? 'pending';
  const reason = shortText(
    moderation.description
      ?? moderation.reason
      ?? lastError.description
      ?? lastError.detail
      ?? item.error_message
      ?? item.reason,
  );
  return {
    externalId: identity.externalId,
    portalAdId: identity.portalAdId,
    advertUrl: identity.advertUrl,
    status: mapStoriaStatus(rawStatus),
    rawStatus: String(rawStatus || ''),
    reason,
    payload: {
      external_id: identity.externalId,
      portal_ad_id: identity.portalAdId,
      advert_url: identity.advertUrl,
      status: mapStoriaStatus(rawStatus),
      raw_status: String(rawStatus || ''),
      state_code: shortText(state.code, 80),
      visible_in_profile: state.visible_in_profile ?? null,
      expires_at: shortText(state.ttl, 80),
      last_action_at: shortText(item.last_action_at, 80),
      reason,
    },
    raw: payload,
  };
}

export function listingIsConfirmedActive(
  listing,
  now = Date.now(),
  staleAfterMs = STORIA_STALE_AFTER_MS,
) {
  if (!listing || listing.status !== 'active' || listing.remote_exists !== true) return false;
  if (listing.last_check_result !== 'verified' || !listing.last_checked_at) return false;
  const checkedAt = new Date(listing.last_checked_at).getTime();
  return Number.isFinite(checkedAt) && now - checkedAt <= staleAfterMs;
}

export function presentStoriaListing(listing, now = Date.now()) {
  if (!listing) return null;
  const verifiedActive = listingIsConfirmedActive(listing, now);
  let effectiveStatus = listing.status || 'pending';
  if (listing.status === 'active' && !verifiedActive) {
    effectiveStatus = listing.last_check_result === 'error'
      ? 'error'
      : listing.last_checked_at
        ? 'stale'
        : 'unverified';
  }
  return {
    ...listing,
    remote_status: listing.remote_status || listing.status || null,
    status: effectiveStatus,
    verified_active: verifiedActive,
  };
}

export function listingNeedsOnDemandCheck(
  listing,
  now = Date.now(),
  freshnessMs = STORIA_ON_DEMAND_FRESH_MS,
) {
  if (!listing?.external_id || listing.status === 'deleted') return false;
  if (!listing.last_checked_at) return true;
  const checkedAt = new Date(listing.last_checked_at).getTime();
  return !Number.isFinite(checkedAt) || now - checkedAt > freshnessMs;
}
