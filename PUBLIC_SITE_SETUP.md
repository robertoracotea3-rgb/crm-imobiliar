# Public Kira site setup

The public site and CRM share this repository. Vercel serves the public pages on `kiraimobiliare.ro` / `www.kiraimobiliare.ro` and the CRM on `crm.kiraimobiliare.ro`.

## Vercel environment

For the public website deployment, configure these server-side variables for Production and Preview:

- `SUPABASE_URL` — the existing Supabase project URL. This stays server-side; avoid exposing infrastructure settings in browser bundles.
- `SUPABASE_SERVICE_ROLE_KEY` — the existing service-role key. Keep it server-side; never use a `NEXT_PUBLIC_` name.
- `KIRA_PUBLIC_AGENCY_ID` — the UUID in `profiles.agency_id` for the Kira account. This scopes public property reads to Kira in the multi-agency CRM.

The code accepts `NEXT_PUBLIC_SUPABASE_URL` as a migration fallback for existing deployments, but new configuration should use `SUPABASE_URL`.

If the agency ID or database variables are missing, the public pages still render, but property cards stay empty. Never remove the agency filter to make listings appear; that could expose another agency's inventory.

## How listings appear

A property appears only when its CRM status is `activa` and `attributes.publicare.site` is enabled. The public site reads only the fields used for a listing and a small allowlist of display attributes. It does not expose the street address, owner contact, private notes, or other CRM fields.

## Domains

Keep the public domain and CRM domain assigned to the Vercel deployments configured for their respective hosts. The app selects the public or CRM layout from the incoming host. Verify both domains in Vercel after deployment.

## Before launch

- Preview the public site and CRM separately and confirm redirects work in both directions.
- Confirm the agency ID against the Kira profile in Supabase.
- Confirm privacy/cookie wording against the data flows and third-party scripts actually enabled.
- Check the production sitemap, canonical URLs, and social profile links.
