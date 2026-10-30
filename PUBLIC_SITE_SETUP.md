# Public Kira site setup

The public site and CRM share this repository. Vercel serves the public pages on `kiraimobiliare.ro` / `www.kiraimobiliare.ro` and the CRM on `crm.kiraimobiliare.ro`.

## Vercel environment

The public property feed uses Supabase from server-side code. Configure the URL and service key for the public deployment in the required environments:

- `SUPABASE_URL` — preferred server-only name for the Supabase project URL. Use the project root, for example `https://<project-ref>.supabase.co`; do not append `/rest/v1/`.
- `NEXT_PUBLIC_SUPABASE_URL` — retained for existing CRM/browser code paths during migration. The URL itself is public configuration, not a credential.
- `SUPABASE_SERVICE_ROLE_KEY` — the service-role key. Keep it secret and server-side; never use a `NEXT_PUBLIC_` name.
- `KIRA_PUBLIC_AGENCY_ID` — the UUID in `profiles.agency_id` for the Kira account. This scopes public property reads to Kira in the multi-agency CRM.

If the agency ID or database variables are missing, the public pages still render, but property cards stay empty. Never remove the agency filter to make listings appear; that could expose another agency's inventory.

## How listings appear

A property appears only when its CRM status is `activa` and `attributes.publicare.site` is enabled. The public site reads only the fields used for a listing and a small allowlist of display attributes. It does not expose the street address, owner contact, private notes, or other CRM fields.

## Domains

Keep the public domain and CRM domain assigned to the Vercel deployments configured for their respective hosts. The app selects the public or CRM layout from the incoming host. Public website previews intentionally return 404 for CRM API paths; test CRM API routes on the CRM host.

## Before launch

- Preview the public site and CRM separately and confirm redirects work in both directions.
- Confirm the agency ID against the Kira profile in Supabase.
- Confirm privacy/cookie wording against the data flows and third-party scripts actually enabled.
- Check the production sitemap, canonical URLs, and social profile links.
