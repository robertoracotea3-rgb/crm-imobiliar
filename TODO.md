# TODO — Property Intelligence & CRM

**Ultima actualizare:** 2026-06-23

---

## 🔴 BLOCKER — Trebuie făcut înainte de a folosi PI

### 1. Rulează migrarea SQL (MANUAL în Supabase)
```
Supabase → SQL Editor → migrations/pi-property-intelligence.sql → Run
```
**Impact:** Fără asta, TOATE rutele `/api/pi/*` returnează 500.

---

## 🟡 Funcțional parțial / cu limitări cunoscute

### 2. OLX Adapter — rate limiting și blocare
- **Problemă:** OLX.ro poate returna 403/429 sau HTML în loc de JSON dacă nu există un
  User-Agent convingător sau dacă IP-ul Vercel este detectat ca bot.
- **Status:** Adapter are fallback la endpoint-ul `/api/v1/offers/?category_id=15`, dar dacă
  și acela e blocat, importul returnează 0 listings.
- **Soluție completă:** Proxy rezidențial sau folosirea Story API oficial (necesită cont business).

### 3. Publi24 Adapter — scraping HTML fragil
- **Problemă:** Scraping pe HTML se poate rupe dacă Publi24 schimbă structura paginii.
- **Status:** Are fallback pe JSON-LD, dar nu este testat pe HTML real.
- **Soluție completă:** Trecere la API oficial dacă devine disponibil.

### 4. Import Job — async non-blocking pe Vercel Hobby
- **Problemă:** `runImportJob().catch()` rulează în background pe durata request-ului HTTP.
  Pe Vercel Hobby, funcțiile se opresc după 10s (nu 300s). Jobs mari pot fi întrerupte.
- **Status:** Declarat `maxDuration = 300` dar asta funcționează doar pe Vercel Pro.
- **Soluție completă:** Vercel Queue / Supabase pg_boss / cron extern.

### 5. Deduplicare cross-listing (O(n²))
- **Problemă:** `groupDuplicates()` compară fiecare listing cu fiecare — ineficient la volum mare.
- **Status:** Nu este apelat automat în worker (doar clasificarea rulează). Deduplicarea se face
  doar la nivel de `same source + same external_id`.
- **Soluție completă:** Index pe telefon normalizat în DB + query targetat în loc de O(n²).

### 6. Count total la search — nu reflectă filtrele owner_type/source
- **Problemă:** `/api/pi/listings/search` face un count separat fără filtrele post-query
  (owner_types, sources). Numărul afișat poate fi mai mare decât cel real.
- **Soluție:** Returnarea `filtered.length` + un count estimativ sau count server-side pe
  `pi_owner_classification`.

### 7. Notifications — badge afișat dar panel inexistent
- **Problemă:** Badge-ul clopotel din pagina PI arată count-ul, dar click pe el nu deschide
  un panel cu notificările PI. Redirectează implicit spre `/notifications` (notificările CRM,
  nu PI).
- **Soluție:** Dropdown panel în pagina PI sau pagină dedicată `/property-intelligence/notifications`.

### 8. Filtru owner_type pe pagina principală — afișează doar 3 din 5
- **Status:** Quick filter arată doar CONFIRMED_INDIVIDUAL, PROBABLE_INDIVIDUAL, UNKNOWN.
  PROBABLE_AGENCY și CONFIRMED_AGENCY sunt ascunse din quick filter (disponibile dacă salvezi
  filtrul avansat).
- **Decizie:** Intenționat sau de adăugat în panoul avansat? Panoul avansat există dar nu
  conține checkbox-urile pentru toate 5 tipuri.

---

## 🟢 De implementat în iterația următoare

### 9. Storia Adapter
- **Descriere:** Adaptorul pentru Storia.ro (imobiliare.ro) folosind API-ul oficial pe care
  l-am integrat deja în Portaluri. Storia are API autentificat → necesită `api_key` per sursă.
- **Fișier:** `lib/pi-adapters/storia-adapter.ts`
- **Efort:** ~3h

### 10. Scheduler import automat
- **Descriere:** Cron job care declanșează importuri la intervalul configurat în `pi_sources.import_interval_minutes`.
- **Opțiuni:** Vercel Cron (vercel.json), Supabase Edge Function cron, sau serviciu extern.
- **Efort:** ~2h

### 11. Panel notificări PI inline
- **Descriere:** Dropdown la click pe clopoțel → lista notificărilor PI cu link spre listing.
- **Fișier:** componentă nouă `PINotificationsPanel.tsx`
- **Efort:** ~2h

### 12. Vizualizare hartă anunțuri PI
- **Descriere:** Toggle "Hartă" în pagina PI — pini pe Leaflet cu popup preț+tip.
  Anunțurile care au `latitude/longitude` pot fi afișate pe hartă.
- **Efort:** ~3h (reutilizează PropertiesMapView)

### 13. Export CSV
- **Descriere:** Buton "Exportă" în pagina PI → CSV cu coloanele: titlu, preț, cameră, suprafață,
  localitate, telefon, tip proprietar, URL sursă.
- **Efort:** ~1h

### 14. Rebrand KIRA IMOBILIARE
- **Status:** În așteptare (din memory `project_rebrand_kira.md`)
- **Ce trebuie schimbat:** Nume agenție în DB, logo, domenii, referințe cod "fortis"

---

## ✅ Funcționalități care NU sunt mockup — logică implementată 100%

Toate funcționalitățile de mai jos au logică reală, nu simulată:

| Funcționalitate | Logică implementată |
|---|---|
| Classificare proprietar | Scoring 0-100 pe 4 factori reali din datele listingului |
| Deduplicare same-source | Hash + external_id → upsert real în DB |
| Import worker | Fetch → parse → upsert → classify → notify → log (complet) |
| 1-click "Preia" | Crează Contact + Proprietate + Lead real în CRM |
| Filtre salvate | CRUD real în `pi_saved_filters` |
| Notificări match | `matchAndNotify()` rulat la fiecare listing nou importat |
| Favorit/Notes | PATCH real pe `pi_external_listings` |
| Văzut de | Array `viewed_by` actualizat la fiecare GET |
| Import jobs log | `pi_import_logs` populat cu INFO/WARN/ERROR reale |
| Admin: trigger import | Job creat în DB + `runImportJob()` apelat async |
