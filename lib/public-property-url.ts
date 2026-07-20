import { buildPublicPropertyUrl as buildPublicPropertyUrlImpl } from './public-property-url.mjs';

export type PublicPropertyUrlInput = {
  id: string;
  internal_code?: string | null;
  category?: string | null;
  city?: string | null;
  attributes?: Record<string, unknown> | null;
};

export function buildPublicPropertyUrl(property: PublicPropertyUrlInput): string {
  return buildPublicPropertyUrlImpl(property);
}
