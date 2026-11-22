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

## Storia / OLX (lib/storia.ts, app/api/portaluri/storia/)

Properties ticked "Storia/OLX" in the CRM and active are published on Storia (exported by Storia to OLX.ro) through the
OLX Group Real Estate Partner API, and buyers' messages come back into the CRM as clients with a "Cerere nouă".
Everything stays off until these variables are set (Production; Preview only if you want to try it there):

- `STORIA_CLIENT_ID`, `STORIA_CLIENT_SECRET`, `STORIA_API_KEY`, `STORIA_WEBHOOK_SECRET` — the OLX app's Client ID, Client
  Secret, API Key and Notification secret (developer.olxgroup.com › Application Manager).
- `KIRA_PORTAL_KEY` — `kp_` + 64 hex, made by `crm-online.sql` version 6 or later (last row of its result; also Administrator CRM Kira
  › Setări › Storia / OLX › Copiază cheia). The site reaches the CRM's database only through the `crm_portal_*` functions,
  which check this key; it never gets a service_role key.
- `CRON_SECRET` — optional. With it, the daily round must carry `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends it).

In Application Manager: authentication callback `https://www.kiraimobiliare.ro/api/portaluri/storia/callback`, notification
callback `https://www.kiraimobiliare.ro/api/portaluri/storia/notificari`.

Routes:
- `GET /api/portaluri/storia/conectare?stare=<code>` — opened from Administrator CRM Kira with a one-time code
  (`crm_admin_portal_stare`, 15 minutes); redirects to Storia's authorization page.
- `GET /api/portaluri/storia/callback` — exchanges the code (valid 60 s) for the account's tokens, kept in the CRM's database
  (`crm_portal_cont`), then starts a first round.
- `POST /api/portaluri/storia/notificari` — OLX notifications, checked with `x-signature` (HMAC-SHA1 of
  `<object_id>,<transaction_id>` with the Notification secret); unsigned or wrongly signed ones get 401. Taken once each.
- `POST /api/portaluri/storia/lucreaza` — the CRM apps call it after uploading a property, with the agent's Supabase session
  (members only). `GET` is the daily Vercel Cron (`vercel.json`, 05:15 UTC). A round publishes, updates and removes
  at most 8 adverts per pass for about 45 seconds; a database lease keeps two rounds from running at once.

`/stare-site` includes `storia`: which variables are missing, or whether the account is connected (never a value).

## OLX.ro directly (lib/olx.ts, app/api/portaluri/olx/)

Properties ticked "OLX" in the CRM and active are published on OLX.ro from the agency's own OLX account through the OLX
Partner API (developer.olx.ro), and the messages buyers send there come back into the CRM as clients with a "Cerere nouă".
It is separate from "Storia/OLX" (Storia exports to OLX.ro by itself): ticking both can show the same property twice on OLX.ro.
It needs `crm-online.sql` version 7 and these variables (Production):

- `OLX_CLIENT_ID`, `OLX_CLIENT_SECRET` — the app's Client ID and Client Secret (developer.olx.ro › My apps).
- `KIRA_PORTAL_KEY` — the same key as for Storia.

On developer.olx.ro the app's Redirect URI is `https://www.kiraimobiliare.ro/api/portaluri/olx/callback`.

Routes:
- `GET /api/portaluri/olx/conectare?stare=<code>` — opened from Administrator CRM Kira › Setări › OLX.ro with a one-time
  code; checks the database is version 7, then redirects to OLX's authorization page.
- `GET /api/portaluri/olx/callback` — exchanges the code for the account's tokens (`crm_portal_cont`, portal `olx`), then
  starts a first round. Without a code it only shows an information page.
- The rounds run inside `/api/portaluri/storia/lucreaza` (apps and daily cron), next to Storia: `runOlx()` publishes,
  updates and takes off adverts, asks OLX about adverts still in moderation (OLX has no notifications for this API) and,
  at most every 2 minutes, reads new messages (`/threads`). Threads that existed before the account was connected are
  not imported. The answer carries the OLX part in `olx`.

OLX's real estate categories and their required fields are read from the API (cached 6 hours). A required field the CRM
cannot fill, or an advert OLX refuses, shows in the CRM with OLX's reason. Real estate adverts may need a paid package on
OLX.ro: such an advert shows as "neplătit" until it is paid in the OLX account.

`/stare-site` includes `olx`: which variables are missing, or whether the account is connected (never a value).

## Before launch

- In Supabase › SQL Editor, run `crm-online.sql` version 7 (it adds the site functions, the map position, the "Adaugă anunț" requests, Storia/OLX and OLX.ro; it deletes nothing).
- Set the two variables above, redeploy, and check a Preview deployment: `/proprietati`, a property page, a photo, `/sitemap.xml`.
- Confirm privacy/cookie wording against the data flows and third-party scripts actually enabled.
