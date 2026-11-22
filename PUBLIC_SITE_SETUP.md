# Public Kira site setup

This repository is the public site only (the old Next.js CRM that used to live here was removed in November 2026).
Vercel serves it on `kiraimobiliare.ro` / `www.kiraimobiliare.ro`, and the agents' app on `app.kiraimobiliare.ro` (below).

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

The old variables (`SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`KIRA_PUBLIC_AGENCY_ID`, and any `ANTHROPIC_*` ones) belonged to the old CRM and its database, which was deleted.
Nothing reads them any more: delete them from the Vercel project. (`STORIA_*` are read again, by the Storia integration below.)

## Domains

Keep `kiraimobiliare.ro` and `www.kiraimobiliare.ro` assigned to this Vercel project. Only they are indexed; Vercel previews
and local copies get `noindex` (`lib/site-host.ts`). The APIs are `/api/site/preluare` ("Adaugă anunț") and `/api/portaluri/storia/*`
(below); anything else is a 404.
`crm.kiraimobiliare.ro` belonged to the old CRM and is no longer used.

## The agents' app (app.kiraimobiliare.ro)

`app.kiraimobiliare.ro` must also be assigned to this project (Vercel › Settings › Domains; the DNS is already on Vercel).
On that host `next.config.ts` rewrites every path to `public/aplicatie/`: in a browser tab it shows the download page
(iPhone, Android, Windows kit at `/descarca/Kira-Imobiliare-Windows.zip`); added to the home screen it is the CRM.
`public/aplicatie/` is generated: run the CRM's `mobile/build-mobile.ps1 -Site <this folder>` (after `desktop/build.ps1`)
and push. Phones pick the new version up by themselves and show "Versiune nouă · Actualizează"; nothing else is needed.
`/aplicatie` answers 404 on every other host, so the app never shares an origin (and its stored data) with the site.

`app.kiraimobiliare.ro/conectare.json` (`app/aplicatie/conectare.json/route.ts`) hands the CRM apps (phone and PC) the same
`KIRA_CRM_URL` and `KIRA_CRM_PUBLISHABLE_KEY`, so agents sign in with only their email and password. Both are public by
design: the data needs an account the administrator added (`crm_is_member`). `crmConfig()` refuses a secret or service_role
key, so one is never handed out. Change the database or the key only in Vercel (then Redeploy); the apps follow.

## Storia and OLX.ro (lib/storia.ts, app/api/portaluri/storia/)

Properties ticked "Storia" in the CRM and active are published on Storia through the OLX Group Real Estate Partner API,
and buyers' messages come back into the CRM as clients with a "Cerere nouă". Properties also ticked "OLX" go on to OLX.ro
from their Storia advert: once it is live, the site asks the same Storia account for the OLX export (a VAS of the advert,
`POST /vas/v1/advert/{uuid}`), which some Storia packages charge for. The old tick "Storia/OLX" counts as both.
Everything stays off until these variables are set (Production; Preview only if you want to try it there):

- `STORIA_CLIENT_ID`, `STORIA_CLIENT_SECRET`, `STORIA_API_KEY`, `STORIA_WEBHOOK_SECRET` — the OLX app's Client ID, Client
  Secret, API Key and Notification secret (developer.olxgroup.com › Application Manager).
- `KIRA_PORTAL_KEY` — `kp_` + 64 hex, made by `crm-online.sql` version 6 or later (last row of its result; also Administrator CRM Kira
  › Setări › Storia / OLX › Copiază cheia). The site reaches the CRM's database only through the `crm_portal_*` functions,
  which check this key; it never gets a service_role key.
- `CRON_SECRET` — optional. With it, the daily round must carry `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends it).
- `STORIA_OLX_PROMOTION` — optional: the OLX export's promotion code (`code` or `code:days`) when OLX Group names one.
  Without it the site picks the export from `GET /taxonomy/v1/promotions/urn:site:storiaro` (cached 6 hours), 30 days
  when offered.

In Application Manager: authentication callback `https://www.kiraimobiliare.ro/api/portaluri/storia/callback`, notification
callback `https://www.kiraimobiliare.ro/api/portaluri/storia/notificari`. For the OLX export the app also needs the scopes
`read:vas` and `write:vas` and the notification flows `vas_lifecycle` and `publish_vas`; after adding them, connect the
account again (Administrator CRM Kira › Setări › Storia / OLX › Conectează din nou).

Routes:
- `GET /api/portaluri/storia/conectare?stare=<code>` — opened from Administrator CRM Kira with a one-time code
  (`crm_admin_portal_stare`, 15 minutes); redirects to Storia's authorization page.
- `GET /api/portaluri/storia/callback` — exchanges the code (valid 60 s) for the account's tokens, kept in the CRM's database
  (`crm_portal_cont`), then starts a first round.
- `POST /api/portaluri/storia/notificari` — OLX notifications, checked with `x-signature` (HMAC-SHA1 of
  `<object_id>,<transaction_id>` with the Notification secret); unsigned or wrongly signed ones get 401. Taken once each.
  The export's events (`advert_vas_applied_success`, `advert_vas_applied_error`, `advert_vas_expired`,
  `advert_vas_removed`) update its state; when an advert ticked "OLX" goes live, the export is asked for right after
  the answer (`after()`).
- `POST /api/portaluri/storia/lucreaza` — the CRM apps call it after uploading a property, with the agent's Supabase session
  (members only). `GET` is the daily Vercel Cron (`vercel.json`, 05:15 UTC). A round publishes, updates and removes
  at most 8 adverts per pass for about 45 seconds; a database lease keeps two rounds from running at once. Then it asks
  for the OLX exports due and checks the ones not confirmed yet (`GET /vas/v1/advert/{uuid}`, every 5 minutes; after 24
  hours without a confirmation the export shows an error). An export that ends is not renewed by itself (no surprise
  charges): the agent presses "Trimite din nou pe OLX". It cannot be ended early through the API; it ends with the
  Storia advert.

`/stare-site` includes `storia`: which variables are missing, or whether the account is connected (never a value); once
connected, `export_olx` says how the OLX export works.

The direct OLX.ro integration of version 7 (developer.olx.ro, `OLX_CLIENT_ID`, `OLX_CLIENT_SECRET`, `/api/portaluri/olx/*`)
is gone: `crm-online.sql` version 8 drops its tables and functions. Adverts it placed on OLX.ro stay there until they are
removed in the OLX account.

## Before launch

- In Supabase › SQL Editor, run `crm-online.sql` version 8 (it adds the site functions, the map position, the "Adaugă anunț" requests, Storia and the OLX.ro export; it deletes no CRM data).
- Set the two variables above, redeploy, and check a Preview deployment: `/proprietati`, a property page, a photo, `/sitemap.xml`.
- Confirm privacy/cookie wording against the data flows and third-party scripts actually enabled.
