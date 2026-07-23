// OLX RE Partner API client (Storia.ro).
// Endpoints & shape per official docs: https://developer.olxgroup.com/docs/authorization-flow
// Base URL is the unified OLX Group API; the marketplace is selected via site_urn.

import { SupabaseClient } from '@supabase/supabase-js';
import {
  decryptPortalToken,
  encryptPortalToken,
} from '@/lib/server/portal-token-crypto.mjs';

// Authorization redirect goes to the marketplace itself (Storia.ro, locale `ro`).
// Format: https://www.storia.ro/ro/crm/authorization/?response_type=code&client_id=..&state=..
export const STORIA_AUTH_URL  = 'https://www.storia.ro/ro/crm/authorization/';
// For OLX test account (api-integration+fortis@olx.com) — Otodom.pl portal.
export const OTODOM_AUTH_URL  = 'https://www.otodom.pl/pl/crm/authorization/';
// Token + all API calls go to the unified OLX Group API host.
export const OLX_API_BASE     = 'https://api.olxgroup.com';
export const OLX_TOKEN_URL    = `${OLX_API_BASE}/oauth/v1/token`;
export const STORIA_SITE_URN  = 'urn:site:storiaro';
export const OTODOM_SITE_URN  = 'urn:site:otodompl';
export const OLX_USER_AGENT   = 'KiraCRM/1.0';

// OLX test mode: set STORIA_TEST_MODE=true in env to use the Otodom.pl test account.
// Test ads must have [qatest-mercury] prefix and OLX-mandated description.
export const OLX_TEST_DESCRIPTION =
  'Acesta este un anunț de testare, vă rugăm să îl ignorați.<br/><br/> Mulțumesc pentru înțelegere.';
export const isTestMode = () => process.env.STORIA_TEST_MODE === 'true';

// ─── Category mapping (CRM category + transaction → OLX concept URN) ──────────
// URNs verified live against GET /taxonomy/v1/categories/partner/urn:site:storiaro.
// NOTE: Storia uses `lots-*`, `stores-*`, `warehouses-*` (not lands/commercial).
const CATEGORY_URNS: Record<string, Record<string, string>> = {
  apartament:       { vanzare: 'urn:concept:apartments-for-sale',  inchiriere: 'urn:concept:apartments-for-rent' },
  casa_vila:        { vanzare: 'urn:concept:houses-for-sale',      inchiriere: 'urn:concept:houses-for-rent' },
  casa:             { vanzare: 'urn:concept:houses-for-sale',      inchiriere: 'urn:concept:houses-for-rent' },
  vila:             { vanzare: 'urn:concept:houses-for-sale',      inchiriere: 'urn:concept:houses-for-rent' },
  teren:            { vanzare: 'urn:concept:lots-for-sale',        inchiriere: 'urn:concept:lots-for-rent' },
  spatiu_comercial: { vanzare: 'urn:concept:stores-for-sale',      inchiriere: 'urn:concept:stores-for-rent' },
  comercial:        { vanzare: 'urn:concept:stores-for-sale',      inchiriere: 'urn:concept:stores-for-rent' },
  birou:            { vanzare: 'urn:concept:stores-for-sale',      inchiriere: 'urn:concept:stores-for-rent' },
  industrial:       { vanzare: 'urn:concept:warehouses-for-sale',  inchiriere: 'urn:concept:warehouses-for-rent' },
  hala:             { vanzare: 'urn:concept:warehouses-for-sale',  inchiriere: 'urn:concept:warehouses-for-rent' },
};

export function getCategoryUrn(category: string, transaction: string): string {
  const cat = (category || 'apartament').toLowerCase();
  const txn = (transaction || 'vanzare').toLowerCase();
  return CATEGORY_URNS[cat]?.[txn] ?? 'urn:concept:apartments-for-sale';
}

// Group CRM categories into OLX attribute "families" with shared mandatory fields.
type CatFamily = 'apartment' | 'house' | 'land' | 'store' | 'warehouse';
function categoryFamily(category: string): CatFamily {
  const c = (category || '').toLowerCase();
  if (c.includes('apartament') || c.includes('garson')) return 'apartment';
  if (c.includes('casa') || c.includes('vila'))         return 'house';
  if (c.includes('teren') || c.includes('lot'))         return 'land';
  if (c.includes('industrial') || c.includes('hala') || c.includes('depozit')) return 'warehouse';
  if (c.includes('comercial') || c.includes('birou') || c.includes('spatiu'))  return 'store';
  return 'apartment';
}

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// Parse a coordinate value, rejecting empty strings, NaN and 0 (Number('') === 0,
// which OLX's Mercury geocoder rejects as the "null island" 0,0 point).
function parseCoord(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return isNaN(n) || n === 0 ? null : n;
}

// Resolve a property's coordinates from the top-level columns or the attributes
// fallback. Returns null when neither holds a valid (non-zero) coordinate pair.
export function resolveCoords(
  property: Record<string, unknown>,
  a: Record<string, unknown>
): { lat: number; lon: number } | null {
  const lat = parseCoord(property.latitude) ?? parseCoord(a.lat);
  const lon = parseCoord(property.longitude) ?? parseCoord(a.lon);
  if (lat == null || lon == null) return null;
  return { lat, lon };
}

// number-of-rooms is a select: urn:concept:1 … urn:concept:10, urn:concept:more.
function roomsUrn(nrCamere: unknown): string | null {
  const n = toNum(nrCamere);
  if (n == null || n < 1) return null;
  if (n > 10) return 'urn:concept:more';
  return `urn:concept:${Math.round(n)}`;
}

// Build the OLX `attributes` array (mandatory per category, verified via taxonomy).
// Format: [{ code: 'urn:concept:...', value: '<urn or raw string>' }].
export function buildAdvertAttributes(
  property: Record<string, unknown>,
  a: Record<string, unknown>
): Array<{ urn: string; value: string }> {
  const fam   = categoryFamily(property.category as string);
  const isSale = (String(property.transaction || 'vanzare').toLowerCase()) === 'vanzare';
  const attrs: Array<{ urn: string; value: string }> = [];

  const netArea  = toNum(a.sup_utila)  ?? toNum(property.surface_useful);
  const landArea = toNum(a.sup_teren)  ?? toNum(property.surface_land);
  const market   = 'urn:concept:secondary'; // agency resale default; OLX accepts primary|secondary

  if (fam === 'apartment') {
    const rooms = roomsUrn(a.nr_camere);
    if (rooms)           attrs.push({ urn: 'urn:concept:number-of-rooms', value: rooms });
    if (netArea != null)  attrs.push({ urn: 'urn:concept:net-area-m2',     value: String(netArea) });
    if (isSale)           attrs.push({ urn: 'urn:concept:market',          value: market });
  } else if (fam === 'house') {
    // OLX Export (cross-post to OLX.ro) requires number-of-rooms for houses —
    // without it the advert posts on Storia but never reaches OLX.ro.
    const rooms = roomsUrn(a.nr_camere);
    if (rooms)            attrs.push({ urn: 'urn:concept:number-of-rooms', value: rooms });
    if (netArea != null)  attrs.push({ urn: 'urn:concept:net-area-m2',     value: String(netArea) });
    if (landArea != null) attrs.push({ urn: 'urn:concept:terrain-area-m2', value: String(landArea) });
    if (isSale)           attrs.push({ urn: 'urn:concept:market',          value: market });
  } else if (fam === 'land') {
    const area = landArea ?? netArea;
    if (area != null) attrs.push({ urn: 'urn:concept:net-area-m2', value: String(area) });
  } else { // store | warehouse
    if (netArea != null) attrs.push({ urn: 'urn:concept:net-area-m2', value: String(netArea) });
    if (isSale)          attrs.push({ urn: 'urn:concept:market',      value: market });
  }
  return attrs;
}

// OLX requires these fields on every advert: title, description, category_urn,
// price, location, custom_fields. We always build the first three + custom_fields,
// but price and location come from CRM data that may be empty. Pre-flight check so
// the user gets a clear Romanian message instead of a raw OLX validation error.
export function missingAdvertFields(
  property: Record<string, unknown>,
  a: Record<string, unknown>
): string[] {
  const missing: string[] = [];
  const title = (property.title as string) || '';
  const desc  = (a.descriere || property.description || '') as string;
  // OLX limits: title 5–70 chars, description 50–65535 chars.
  if (title.trim().length < 5)  missing.push('Titlu (minim 5 caractere)');
  // In test mode the description is overridden with the OLX-mandated test string — skip check.
  if (!isTestMode() && desc.trim().length < 50) missing.push('Descriere (minim 50 caractere)');
  if (!property.price || Number(property.price) <= 0) missing.push('Preț');

  // OLX's Mercury geocoder requires valid coordinates. Missing/zero coords are
  // rejected asynchronously with MercuryLatLonException — block early instead.
  if (!resolveCoords(property, a)) missing.push('Coordonate pe hartă (lat/lon)');

  // OLX requires at least one image (stored in attributes.photos as URL strings).
  const photoUrls = Array.isArray(a.photos) ? a.photos as string[] : [];
  const hasPhoto = photoUrls.some(u => typeof u === 'string' && u.startsWith('http'));
  if (!hasPhoto) missing.push('Cel puțin o poză');

  // Per-category mandatory attributes (verified against OLX taxonomy + live errors).
  const fam = categoryFamily(property.category as string);
  const netArea  = toNum(a.sup_utila) ?? toNum(property.surface_useful);
  const landArea = toNum(a.sup_teren) ?? toNum(property.surface_land);
  if (fam === 'apartment') {
    const rooms = toNum(a.nr_camere);
    if (!rooms || rooms < 1) missing.push('Număr camere (obligatoriu pentru apartamente)');
    if (!netArea || netArea <= 0) missing.push('Suprafață utilă (mp)');
  } else if (fam === 'house') {
    // OLX rejects houses without terrain area: "Suprafata teren este necesar".
    // number-of-rooms is required by the OLX Export to reach OLX.ro.
    const rooms = toNum(a.nr_camere);
    if (!rooms || rooms < 1) missing.push('Număr camere (obligatoriu pentru OLX)');
    if (!netArea || netArea <= 0) missing.push('Suprafață utilă (mp)');
    if (!landArea || landArea <= 0) missing.push('Suprafață teren (mp)');
  } else if (fam === 'land') {
    if ((!landArea || landArea <= 0) && (!netArea || netArea <= 0)) missing.push('Suprafață teren (mp)');
  } else { // store | warehouse
    if (!netArea || netArea <= 0) missing.push('Suprafață utilă (mp)');
  }

  return missing;
}

// ─── Map a CRM property to an OLX advert payload ─────────────────────────────
export function propertyToAdvert(
  property: Record<string, unknown>,
  a: Record<string, unknown>   // property.attributes
): Record<string, unknown> {
  const testMode = isTestMode();
  const rawTitle = (property.title as string) || `Proprietate de ${property.transaction || 'vanzare'}`;
  // OLX test rules: title must start with [qatest-mercury]; max 70 chars total.
  const title = testMode
    ? `[qatest-mercury] ${rawTitle}`.slice(0, 70)
    : rawTitle.slice(0, 70);
  // OLX test rules: description must be exactly the mandated test string.
  const desc = testMode
    ? OLX_TEST_DESCRIPTION
    : (a.descriere || property.description || '') as string;

  // Photos live in attributes.photos as an array of public URL strings (varianta medium, 800px).
  // Trimitem varianta LARGE (1600px), nu medium — altfel pozele apar neclare când sunt
  // deschise pe mare pe Storia/OLX. Pentru URL-uri legacy (fără /medium.webp) înlocuirea
  // e no-op și trimitem originalul.
  const photoUrls = Array.isArray(a.photos) ? a.photos as string[] : [];
  const images = photoUrls
    .slice(0, 24) // OLX max 24 photos
    .filter(u => typeof u === 'string' && u.startsWith('http'))
    .map(url => ({ url: url.replace('/medium.webp', '/large.webp') }));

  const advert: Record<string, unknown> = {
    site_urn:     testMode ? OTODOM_SITE_URN : STORIA_SITE_URN,
    title,
    description:  desc.slice(0, 9000),
    category_urn: getCategoryUrn(property.category as string, property.transaction as string),
    // Mandatory per-category attributes (rooms / area / market), verified via taxonomy.
    attributes:   buildAdvertAttributes(property, a),
    images,
    // OLX requires custom_fields.id (our internal advert id) to reconcile webhooks.
    custom_fields: { id: String(property.id ?? '') },
  };

  if (property.price) {
    advert.price = { value: Number(property.price), currency: (property.currency as string) || 'EUR' };
  }

  // Only attach a location when we have valid, non-zero coordinates. Number('')
  // is 0, so a naive parse would send the 0,0 "null island" that OLX rejects.
  const coords = resolveCoords(property, a);
  if (coords) {
    advert.location = { lat: coords.lat, lon: coords.lon, exact: !a.ascunde_adresa };
  }

  // Contact is OPTIONAL. If present, OLX requires a valid email — so only send the
  // contact block when we actually have one. Otherwise OLX falls back to the
  // connected account's default contact details (the agency's Storia profile).
  const contactEmail = (a.contact_email as string) || '';
  if (contactEmail.trim()) {
    advert.contact = {
      name:  (a.contact_name as string) || 'Kira Imobiliare',
      email: contactEmail.trim(),
      ...(a.contact_phone ? { phone: a.contact_phone } : {}),
    };
  }

  // NOTE: `attributes` (rooms/area/floor as OLX URNs) are site-specific and must be
  // mapped from GET taxonomy before going fully live. Left out of the minimal payload.
  return advert;
}

// ─── Auth helpers ────────────────────────────────────────────────────────────
function basicAuth() {
  const id  = process.env.STORIA_CLIENT_ID!;
  const sec = process.env.STORIA_CLIENT_SECRET!;
  return `Basic ${Buffer.from(`${id}:${sec}`).toString('base64')}`;
}

// Every OLX API request needs these headers.
function olxHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'X-API-KEY':  process.env.STORIA_API_KEY || '',
    'User-Agent': OLX_USER_AGENT,
    'Accept':     'application/json',
    ...extra,
  };
}

export interface OlxTokens {
  access_token:  string;
  refresh_token: string;
  expires_in:    number;
  token_type:    string;
  scope?:        string;
}

export class StoriaOAuthError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = 'StoriaOAuthError';
  }
}

function oauthErrorCode(status: number, body: unknown): string {
  const candidate = body && typeof body === 'object'
    ? String((body as Record<string, unknown>).error || '')
    : '';
  const normalized = candidate.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 48);
  return normalized ? `oauth_${normalized}` : `oauth_http_${status}`;
}

async function requestTokens(payload: Record<string, string>): Promise<OlxTokens> {
  const res = await fetch(OLX_TOKEN_URL, {
    method: 'POST',
    headers: olxHeaders({ 'Authorization': basicAuth(), 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null) as Partial<OlxTokens> | Record<string, unknown> | null;
  if (!res.ok) throw new StoriaOAuthError(oauthErrorCode(res.status, body), res.status);
  if (
    !body
    || typeof body.access_token !== 'string'
    || !body.access_token
    || typeof body.refresh_token !== 'string'
    || !body.refresh_token
    || !Number.isFinite(Number(body.expires_in))
    || Number(body.expires_in) <= 0
  ) {
    throw new StoriaOAuthError('oauth_invalid_token_response', 502);
  }
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_in: Number(body.expires_in),
    token_type: typeof body.token_type === 'string' ? body.token_type : 'Bearer',
    scope: typeof body.scope === 'string' ? body.scope : undefined,
  };
}

export async function exchangeCode(code: string): Promise<OlxTokens> {
  return requestTokens({ grant_type: 'authorization_code', code });
}

export async function refreshAccessToken(refreshToken: string): Promise<OlxTokens> {
  return requestTokens({ grant_type: 'refresh_token', refresh_token: refreshToken });
}

interface PortalTokenRow {
  id: string;
  agency_id: string;
  portal: string;
  access_token: string | null;
  refresh_token: string | null;
  access_token_ciphertext: string | null;
  refresh_token_ciphertext: string | null;
  connection_status: string | null;
  expires_at: string | null;
  scope: string | null;
}

function encryptedTokenContext(agencyId: string, purpose: 'access' | 'refresh') {
  return { agencyId, portal: 'storia', purpose };
}

async function tokenSecrets(
  supabase: SupabaseClient,
  row: PortalTokenRow,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  if (row.access_token_ciphertext && row.refresh_token_ciphertext) {
    try {
      return {
        accessToken: decryptPortalToken(
          row.access_token_ciphertext,
          encryptedTokenContext(row.agency_id, 'access'),
        ),
        refreshToken: decryptPortalToken(
          row.refresh_token_ciphertext,
          encryptedTokenContext(row.agency_id, 'refresh'),
        ),
      };
    } catch {
      return null;
    }
  }

  // One-time, in-place upgrade for credentials created before Phase 15.
  if (!row.access_token || !row.refresh_token) return null;
  try {
    const accessCiphertext = encryptPortalToken(
      row.access_token,
      encryptedTokenContext(row.agency_id, 'access'),
    );
    const refreshCiphertext = encryptPortalToken(
      row.refresh_token,
      encryptedTokenContext(row.agency_id, 'refresh'),
    );
    const { error } = await supabase
      .from('portal_tokens')
      .update({
        access_token: null,
        refresh_token: null,
        access_token_ciphertext: accessCiphertext,
        refresh_token_ciphertext: refreshCiphertext,
        encryption_version: 'v1',
        connection_status: 'connected',
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('agency_id', row.agency_id)
      .eq('portal', 'storia');
    if (error) return null;
    await supabase.rpc('crm_record_legacy_token_encryption', {
      p_agency_id: row.agency_id,
      p_portal: 'storia',
      p_token_id: row.id,
    });
    return { accessToken: row.access_token, refreshToken: row.refresh_token };
  } catch {
    return null;
  }
}

async function waitForConcurrentRefresh(
  supabase: SupabaseClient,
  agencyId: string,
): Promise<string | null> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 250));
    const { data } = await supabase
      .from('portal_tokens')
      .select([
        'id','agency_id','portal','access_token','refresh_token',
        'access_token_ciphertext','refresh_token_ciphertext',
        'connection_status','expires_at','scope',
      ].join(','))
      .eq('agency_id', agencyId)
      .eq('portal', 'storia')
      .maybeSingle();
    const row = data as PortalTokenRow | null;
    const expiresAt = row?.expires_at ? new Date(row.expires_at).getTime() : 0;
    if (!row || row.connection_status !== 'connected') return null;
    if (expiresAt > Date.now() + 5 * 60 * 1000) {
      const secrets = await tokenSecrets(supabase, row);
      return secrets?.accessToken || null;
    }
  }
  return null;
}

// Returns a valid access token (refreshing if needed), or null if not connected.
export async function getValidToken(supabase: SupabaseClient, agencyId: string): Promise<string | null> {
  const { data } = await supabase
    .from('portal_tokens')
    .select([
      'id','agency_id','portal','access_token','refresh_token',
      'access_token_ciphertext','refresh_token_ciphertext',
      'connection_status','expires_at','scope',
    ].join(','))
    .eq('agency_id', agencyId)
    .eq('portal', 'storia')
    .maybeSingle();
  const row = data as PortalTokenRow | null;
  if (!row || !['connected', null].includes(row.connection_status)) return null;
  const secrets = await tokenSecrets(supabase, row);
  if (!secrets) return null;

  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 5 * 60 * 1000) {
    await supabase.from('portal_tokens').update({
      last_used_at: new Date().toISOString(),
    }).eq('id', row.id).eq('agency_id', agencyId);
    return secrets.accessToken;
  }

  const lockId = crypto.randomUUID();
  const { data: claimed } = await supabase.rpc('crm_claim_portal_token_refresh', {
    p_agency_id: agencyId,
    p_portal: 'storia',
    p_lock_id: lockId,
  });
  if (claimed !== true) return waitForConcurrentRefresh(supabase, agencyId);
  try {
    const tokens = await refreshAccessToken(secrets.refreshToken);
    const newRefreshToken = tokens.refresh_token || secrets.refreshToken;
    const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const { data: completed } = await supabase.rpc('crm_complete_portal_token_refresh', {
      p_agency_id: agencyId,
      p_portal: 'storia',
      p_lock_id: lockId,
      p_access_token_ciphertext: encryptPortalToken(
        tokens.access_token,
        encryptedTokenContext(agencyId, 'access'),
      ),
      p_refresh_token_ciphertext: encryptPortalToken(
        newRefreshToken,
        encryptedTokenContext(agencyId, 'refresh'),
      ),
      p_encryption_version: 'v1',
      p_expires_at: newExpiresAt,
      p_scope: tokens.scope || row.scope,
    });
    if (completed !== true) return null;
    return tokens.access_token;
  } catch (error) {
    const oauthError = error instanceof StoriaOAuthError ? error : null;
    const reconnectRequired = Boolean(
      oauthError && [400, 401, 403].includes(oauthError.status),
    );
    await supabase.rpc('crm_fail_portal_token_refresh', {
      p_agency_id: agencyId,
      p_portal: 'storia',
      p_lock_id: lockId,
      p_error_code: oauthError?.code || 'refresh_failed',
      p_reconnect_required: reconnectRequired,
    });
    return null;
  }
}

// Authenticated OLX API call (adverts live under /advert/v1).
export async function olxFetch(path: string, accessToken: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${OLX_API_BASE}${path}`, {
    ...options,
    headers: olxHeaders({
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type':  'application/json',
      ...((options.headers as Record<string, string>) || {}),
    }),
  });
}

// Map an OLX advert status to our canonical portal_listings status.
// Shared by publish, webhook and sync. The OLX lifecycle is action-based:
//   TO_POST → POSTED  (create: queued → live)
//   TO_PUT  → PUT     (update: queued → live with new data)
// So TO_* are transient "pending" states, while POSTED/PUT/POST mean the
// advert is live. Both PUT and POSTED must map to active.
export function mapOlxStatus(raw: unknown): string {
  const up = String(raw || '').toUpperCase();
  if (up === 'POSTED' || up === 'POST') return 'active';
  if (up === 'PUT')                     return 'active'; // update applied → live
  if (up === 'TO_POST' || up === 'TO_PUT') return 'pending';
  if (up === 'NOT_POSTED')   return 'error';
  if (up === 'REJECTED')     return 'rejected';
  if (up.includes('DELETE')) return 'deleted';
  return String(raw || 'pending').toLowerCase();
}

// Pull the live advert state straight from OLX — GET /advert/v1/{uuid}.
// Used to recover from missed webhooks (status stuck at pending). Returns the
// mapped status + an optional error reason, or null if the advert is gone (404).
export async function fetchAdvertStatus(
  externalId: string,
  accessToken: string
): Promise<{ status: string; reason: string | null; raw: unknown } | null> {
  const res = await olxFetch(`/advert/v1/${externalId}`, accessToken, { method: 'GET' });
  if (res.status === 404) return null; // advert no longer exists on OLX
  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    return { status: 'error', reason: JSON.stringify(body).slice(0, 500), raw: body };
  }
  const data = (body.data || body) as Record<string, unknown>;
  const rawStatus = data.last_action_status || data.status;
  // Extract validation errors from OLX's error.validation[] array (returned even on 2xx NOT_POSTED).
  const olxErr = data.error as Record<string, unknown> | undefined;
  const validation = olxErr?.validation as Array<{ detail: string }> | undefined;
  const reason = validation?.length
    ? validation.map(v => v.detail).join('; ')
    : ((data.rejection_reason || data.error_message || data.reason || olxErr?.detail || null) as string | null);
  return { status: mapOlxStatus(rawStatus), reason, raw: body };
}
