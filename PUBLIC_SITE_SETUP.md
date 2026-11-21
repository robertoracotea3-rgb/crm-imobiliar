# Public Kira site setup

The public site and the old CRM code share this repository. Vercel serves the public pages on `kiraimobiliare.ro` / `www.kiraimobiliare.ro`.

## Where the listings come from

The listings come from **Kira Imobiliare**, the agency's CRM (PC and phone apps), through its online database on Supabase.
A property appears on the site when, in the CRM, it is ticked **„Site Kira”** under Promovare and its status is **Activă**.
It disappears when it is unticked, set to Rezervată / Retrasă / Tranzacționată, or deleted (within about a minute).

The site reads the CRM's database with the **publishable** key, through the SQL function `crm_site_properties()` (from `crm-online.sql`, version 5). Each property carries `geo` (`crm_site_geo`): the pin set in the CRM, or, when the agent ticked "Locație aproximativă", a point 120–320 m away from it, which the map draws as a 500 m circle. Without a pin, the map draws a circle on the locality (`components/public/places.ts`).

The "Adaugă anunț" form posts to `/api/site/preluare` (allowed on the public host in `proxy.ts`), which checks the origin, the size and two bot traps, then calls `crm_site_preluare(p)`: the request becomes a "Preluare" activity in the CRM (at most 3 a day per phone, 40 an hour in total). If the database is older than version 5 or unreachable, the form offers the same message on WhatsApp.
That function returns only the listing text: title, description, price, type, transaction, surfaces, rooms, floor, year, condition, heating,
locality, area, county, the ticked features and the photo ids. It never returns the street, the number, the owner, the internal notes,
clients, activities or contracts. A storage policy lets visitors read only the photos of published properties.

- `lib/public-properties.ts` reads and maps the listings (cached for 60 s, never waits more than 3.5 s).
- `app/poze/[id]/route.ts` serves a published photo at `/poze/<id>` from the private `crm-poze` bucket.
- Property pages live at `/proprietati/<title>-<code>` (e.g. `/proprietati/apartament-3-camere-de-vanzare-galaxiei-p101`).
  The code decides: an older link (a changed title) redirects permanently to the current one. The CRM builds the same link.

## Vercel environment

Project › Settings › Environment Variables (Production and Preview):

- `KIRA_CRM_URL` — the CRM's Supabase project URL, e.g. `https://abcdefghijklmnop.supabase.co` (no `/rest/v1/`).
- `KIRA_CRM_PUBLISHABLE_KEY` — the project's publishable key (`sb_publishable_...`). It is public by design: the database rules decide what it can read.
  A secret key (`sb_secret_...`) or a `service_role` key is refused by the code; never use one for the public site.

Without these variables the pages still render, instantly, with no listings.

`/stare-site` says what is wrong when no listings show (missing or malformed variable, script not run, key refused, nothing ticked) without echoing the values. A pasted dashboard address or bare project code also works for `KIRA_CRM_URL`.

The old variables (`SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `KIRA_PUBLIC_AGENCY_ID`) belonged to the old CRM database,
which was deleted. The public pages no longer use them; they are still referenced by the old CRM code and the XML feed (`/api/feed/properties.xml`).

## Domains

Keep the public domain assigned to this Vercel project. The app selects the public layout from the incoming host.
Public website hosts return 404 for `/api/*` except the feed, and redirect old CRM paths to `crm.kiraimobiliare.ro`.

## The agents' app (app.kiraimobiliare.ro)

`app.kiraimobiliare.ro` must also be assigned to this project (Vercel › Settings › Domains; the DNS is already on Vercel).
On that host `next.config.ts` rewrites every path to `public/aplicatie/`: in a browser tab it shows the download page
(iPhone, Android, Windows kit at `/descarca/Kira-Imobiliare-Windows.zip`); added to the home screen it is the CRM.
`public/aplicatie/` is generated: run the CRM's `mobile/build-mobile.ps1 -Site <this folder>` (after `desktop/build.ps1`)
and push. Phones pick the new version up by themselves and show "Versiune nouă · Actualizează"; nothing else is needed.
`/aplicatie` answers 404 on every other host, so the app never shares an origin (and its stored data) with the site.

## Before launch

- In Supabase › SQL Editor, run `crm-online.sql` version 5 (it adds the site functions, the map position and the "Adaugă anunț" requests; it deletes nothing).
- Set the two variables above, redeploy, and check a Preview deployment: `/proprietati`, a property page, a photo, `/sitemap.xml`.
- Confirm privacy/cookie wording against the data flows and third-party scripts actually enabled.
