# TODO — CRM KIRA IMOBILIARE

**Ultima actualizare:** 2026-06-30

---

## ✅ Curățat / finalizat recent

- **Property Intelligence** (agregare anunțuri externe OLX/Publi24, `lib/pi-adapters/`,
  `app/property-intelligence/`, migrarea `pi-property-intelligence.sql`) — **eliminat**, nu se
  mai implementează. Toate task-urile aferente au fost scoase din acest fișier.
- **Rebrand fortis → KIRA** — finalizat în cod (domenii `crm.kiraimobiliare.ro` și
  `kiraimobiliare.ro`). Rămase intenționat: redirectul 301 de pe domeniul vechi din site
  (`next.config.ts`) și emailul de login `*@fortis.crm` (a se vedea nota de mai jos).

---

## ⚠️ De reținut (nu sunt bug-uri — constrângeri intenționate)

- **Email login `*@fortis.crm`** (`lib/username.ts`): e emailul sintetic stocat în Supabase Auth.
  NU îl schimba fără o migrare prealabilă a coloanei email din `auth.users`, altfel se rup toate
  login-urile existente.
- **Redirect domeniu vechi** (site `next.config.ts`): păstrat pentru SEO până la retragerea
  completă a domeniului `fortisfagaras.ro`.

---

## ✅ Securitate — rezolvat (2026-06-30)

- **Scurgere date publice** (site): `/api/properties-public` + `lib/data.ts` trimiteau tot
  `attributes` (obs_interne, adresă exactă, date proprietar) + `private_notes`. Adăugat
  sanitizare `toPublicProperty()` în `lib/property-utils.ts`, aplicată pe toate citirile publice.
- **Cod înregistrare** (CRM): scos fallback-ul hardcodat `KIRA2024`. Acum fail-closed — necesită
  `REGISTRATION_ACCESS_CODE` în env (setat local; **de setat în Vercel**).
- **Anti-spam lead** (site): honeypot + validare telefon/email + cap lungime + rate-limit
  best-effort pe IP în `/api/lead`.
- **`server-only`** pe `lib/supabase.ts` (site) — cheia service-role nu poate ajunge client-side.
- Scos `signUp` cod-mort din `lib/auth-context.tsx` (CRM).
- **ESLint**: adăugat `.netlify/**` + `.vercel/**` la ignores (CRM lint 9503 → 143 probleme reale).

## 🟢 De făcut în continuare (recomandări)

- **Rate-limit real** pentru `/api/lead` (site): Upstash Ratelimit — cel in-memory e best-effort
  pe serverless. Opțional honeypot și pe celelalte formulare (EvaluationForm, AppointmentModal,
  PropertyAlertForm, FloatingCallback).
- **Curățenie lint CRM** (143): 45× `any`, 28× variabile nefolosite, 16× hooks immutability
  (`auth-context`), 13× set-state-in-effect, 8× entități neescapate, 7× exhaustive-deps.
- **Curățenie lint site** (3 erori): `set-state-in-effect` în FavoriteButton/Header/CookieConsent.
- **Migrare `@supabase/auth-helpers-*` → `@supabase/ssr`** (pachetele actuale sunt deprecate).
- **Verifică mismatch chei `attributes`**: CRM salvează `sup_utila/sup_construita`, site-ul citește
  `surface/surface_total` — posibil caracteristici neafișate pe site.
- Opțional: Node 20 via `nvm-windows` pentru paritate cu deploy-ul (acum 24 LTS).
