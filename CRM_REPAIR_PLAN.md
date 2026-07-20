# CRM Kira Imobiliare — plan de stabilizare și reparare

Data auditului: 20 iulie 2026  
Branch de lucru: `repair/crm-stabilizare-20260720`  
Stare: Faza 0 finalizată local; nicio migrare și niciun deploy în producție nu au fost executate.

## 1. Reguli de intervenție

- Datele istorice nu se șterg.
- Schimbările de schemă sunt aditive, versionate și reversibile.
- Backfillurile au obligatoriu mod `dry-run`, jurnal și reluare sigură.
- Nicio coloană nouă nu devine `NOT NULL` înainte de backfill și validare.
- Autorizarea se verifică în API și RLS, nu numai în interfață.
- Secretele nu se păstrează în repository, loguri sau răspunsuri.
- Producția nu primește migrații înainte de backup fizic/restaurabil, staging și raportul pre-deploy.

## 2. Backup și posibilitate de restaurare

### 2.1 Copia codului

Starea repository-ului dinaintea intervenției a fost salvată în:

`C:\Users\oligi\Documents\Codex\2026-07-05\vreau\crm-repair-snapshots\2026-07-20-pre-repair`

Conține:

- `crm-history.bundle` — istoricul Git;
- `crm-source.zip` — sursa curentă, inclusiv fișierele necomise, fără secrete și fără artefacte generate;
- `working-tree.patch` — diferențele binare și text ale fișierelor urmărite.

### 2.2 Exportul logic Supabase

Backup verificat:

`backups/supabase-2026-07-20T10-05-02-061Z`

Rezultat:

- 35/35 tabele publice exportate;
- 0 erori la tabele;
- 6 utilizatori Auth exportați ca metadate;
- 2 bucketuri Storage;
- 568/568 fișiere Storage descărcate;
- 0 erori Storage;
- 606 fișiere, 68.748.480 bytes;
- SHA-256 manifest: `33F7E669D53DFD655660815C64C79943AAA454007DBA46D9E518C84773B94F5E`.

Directorul `backups/` este ignorat de Git deoarece conține date personale.

### 2.3 Limitarea backupului

Acesta este un export logic verificat, nu un `pg_dump` fizic. Nu include complet:

- hashurile parolelor Supabase Auth;
- obiectele interne din schemele `auth`, `storage` și `supabase_migrations`;
- toate funcțiile, trigger-ele, politicile RLS și drepturile bazei;
- secretele gestionate de platformă;
- un test real de restaurare într-un proiect Supabase separat.

Prin urmare, migrațiile de producție rămân blocate până când există una dintre variante:

1. backup nativ Supabase/PITR și test de restaurare; sau
2. acces direct la baza PostgreSQL pentru `pg_dump`, plus proiect de staging pentru restore.

## 3. Incident critic cu secrete

`SUPABASE_SERVICE_ROLE_KEY` era scris direct în `netlify.toml`, fișier urmărit de Git, și apare în istoricul repository-ului începând cu commitul `5f5ac2b`.

Acțiune locală executată:

- cheia a fost eliminată din `netlify.toml`;
- configurația păstrează numai versiunea Node;
- `.env.local` rămâne ignorat de Git.

Acțiuni obligatorii înainte de orice deploy:

1. rotirea cheii service-role în Supabase;
2. actualizarea ei numai în variabilele securizate Netlify;
3. revocarea cheii vechi;
4. verificarea logurilor pentru utilizări neobișnuite;
5. scanarea completă a istoricului Git și, dacă repository-ul a fost distribuit, rescrierea controlată a istoricului;
6. rotirea celorlalte secrete de integrare care ar fi putut fi expuse în același mediu.

## 4. Stack și mediu

| Componentă | Versiune/stare |
|---|---|
| Next.js App Router | 16.2.9 |
| React / React DOM | 19.2.4 |
| Supabase JS | 2.108.1 |
| TypeScript | strict activ |
| Node declarat | 20 (`.nvmrc`, Netlify) |
| Node local folosit la audit | 24.18.0 |
| npm local | 11.16.0 |
| Hosting configurat | Netlify |
| Bază/Auth/Storage | Supabase |

Trebuie repetate buildul și testele pe Node 20 înainte de staging, deoarece auditul local a rulat pe Node 24.

Variabile locale prezente și validate fără afișarea valorilor:

- URL Supabase HTTPS;
- cheie Supabase anon;
- cheie Supabase service-role, diferită de anon;
- cod de înregistrare.

Variabilele Storia, Facebook și AI nu sunt toate disponibile local. Funcțiile respective nu pot fi validate end-to-end local până la configurarea unui mediu de staging separat.

## 5. Rezultatele de bază înainte de reparații

| Verificare | Rezultat |
|---|---|
| Pornire locală | `/login` HTTP 200 |
| Build producție | trecut, 32 pagini statice generate |
| Type-check | trecut |
| Lint | eșuat: 131 probleme, 83 erori și 48 avertismente |
| Teste existente | nu există script/suită de teste |
| Audit dependențe | 2 vulnerabilități moderate, în `postcss` tranzitiv prin Next |
| Migrare security foundation | coloanele soft-delete sunt prezente pe cele 8 tabele verificate |

`npm audit fix --force` nu se execută, deoarece propune o schimbare incompatibilă a Next.js. Dependențele vor fi actualizate controlat și retestate.

## 6. Inventarul bazei de date

### 6.1 Tabele de business principale

- `agencies`
- `profiles`
- `properties`
- `contacts`
- `leads`
- `demands`
- `calendar_events`
- `tasks`
- `transactions`
- `activities`
- `activity_logs`
- `matches`
- `message_templates`
- `offices`

### 6.2 Proprietăți și publicare

- `property_documents`
- `property_photos`
- `property_price_history`
- `property_publications`

### 6.3 Portaluri și sincronizare

- `portals`
- `portal_accounts`
- `portal_tokens`
- `portal_listings`
- `sync_jobs`

### 6.4 Particulari

- `prospects`
- `pi_sources`
- `pi_import_jobs`
- `pi_import_logs`
- `pi_external_listings`
- `pi_listing_images`
- `pi_listing_changes`
- `pi_owner_classification`
- `pi_phone_blacklist`
- `pi_deduplication_groups`
- `pi_saved_filters`
- `pi_notifications`

Majoritatea tabelelor `pi_*` există, dar sunt goale; implementarea actuală folosește încă aproape exclusiv tabela legacy `prospects`.

### 6.5 Relații existente relevante

- `profiles.agency_id -> agencies.id`
- `properties.agency_id -> agencies.id`
- `properties.owner_contact_id -> contacts.id`
- `contacts.agency_id -> agencies.id`
- `leads.agency_id -> agencies.id`
- `leads.property_id -> properties.id`
- `leads.converted_contact_id -> contacts.id`
- `leads.converted_demand_id -> demands.id`
- `demands.contact_id -> contacts.id`
- `transactions.property_id -> properties.id`
- `transactions.contact_id -> contacts.id`
- `activities.property_id/contact_id/lead_id/demand_id` leagă parțial istoricul.

Lipsuri structurale:

- `portal_listings` nu are `portal_ad_id` numeric/canonic;
- `leads` nu are `portal_listing_id`, `portal_ad_id` sau `webhook_transaction_id`;
- `calendar_events` nu are în producție `lead_id`, deși există un fișier local de migrare;
- nu există tabelă dedicată pentru evenimente webhook;
- nu există tabelă unică de notificări CRM;
- nu există un outbox pentru retrageri de pe portaluri;
- legăturile `agent_id` către utilizator nu sunt declarate consecvent ca foreign key;
- mai multe tabele noi nu sunt incluse în migrarea RLS existentă.

## 7. Situația datelor la momentul backupului

### 7.1 Volume

- 42 proprietăți;
- 263 contacte;
- 235 leaduri;
- 222 cereri;
- 25 evenimente calendar;
- 5 tranzacții;
- 2.642 anunțuri de particulari;
- 31 listări Storia.

### 7.2 Rupturi de integritate funcțională

- 223/235 leaduri nu au proprietate;
- 235/235 leaduri nu au `portal_id` completat;
- 0 leaduri au `converted_contact_id`;
- 0 leaduri au `converted_demand_id`;
- 227 leaduri provin din surse care conțin Storia;
- numai 10/227 leaduri Storia au proprietate;
- 0/7 leaduri Storia din ultimele 7 zile au proprietate;
- 7/222 cereri au buget;
- 5/222 cereri nu au contact;
- 5/5 tranzacții nu au contact;
- 3/5 tranzacții nu mai indică o proprietate validă din setul curent;
- 31/31 listări Storia au `external_id` UUID;
- 30/31 au ID numeric în răspunsul brut, dar acesta nu este salvat separat;
- 0/31 au URL public Storia;
- 1.394/2.642 particulari nu au mai fost văzuți de peste 7 zile;
- 2.642/2.642 particulari nu au telefon.

### 7.3 Statusuri și surse neuniforme

Leadurile folosesc simultan:

- `new`
- `in_progress`
- `contacted`
- `upcoming_viewing`
- `withdrawn`
- `lost`
- iar componenta WhatsApp introduce `replied`.

Sursele includ variante incompatibile:

- `Storia.ro + Olx.ro`
- `storia`
- `olx`
- `Website`
- `Manual`
- alte texte libere.

Cereri: toate cele 222 sunt încă `activa`, inclusiv date vechi.  
Particulari: 2.634 din 2.642 sunt încă `nou`, fără mecanism de expirare.

## 8. Inventarul API

Există 62 de fișiere Route Handler și 86 de handlers HTTP exportați.

### 8.1 Module și endpointuri

- autentificare: `POST /api/auth/register`;
- agenți: `GET /api/agents/list`;
- calendar: `GET/POST/PATCH/DELETE /api/calendar`;
- contacte: `GET/POST/PATCH/DELETE /api/contacts`;
- dashboard: `GET /api/dashboard/overview`;
- cereri: list, create, update, delete, close, bulk, auto-match, match-for-property;
- leaduri: list, create, update, delete, note, history, match, match-for-property;
- matching legacy: `POST /api/matches/calculate`;
- feed: `GET /api/feed/properties.xml`;
- financiar: overview și `GET/POST/PATCH/DELETE /api/transactions`;
- notificări: `GET /api/notifications`;
- portal Facebook: publish;
- portal Storia: connect, callback, publish, status, unpublish, webhook;
- proprietăți: list, get, create, update, update-full, delete, status, bulk, documents, photos, history, next-code, AI;
- particulari: list/update/delete și refresh;
- setări: get/update și watermark;
- echipă: membri, membru individual, statistici, activitate;
- tasks: `GET/POST/PATCH/DELETE /api/tasks`;
- vizionări: `GET/POST/PATCH/DELETE /api/viewings`;
- setup și endpointul SQL dezactivat.

### 8.2 Acoperire autentificare

- 43 rute folosesc helperul central `requireApiAuth`;
- 12 rute implementează autentificarea manual și neuniform;
- feedul, callbackul OAuth și webhookul sunt publice prin design;
- `POST /api/properties/analyze` este public și poate consuma credit AI fără autentificare;
- `POST /api/auth/register` este public și protejat numai printr-un cod global;
- `proxy.ts` verifică tipul conținutului, dar nu autentifică API-urile; fiecare handler rămâne public dacă uită verificarea proprie.

## 9. Integrări, webhookuri și joburi

### 9.1 Storia/OLX

Există:

- OAuth authorization-code;
- publicare, status și retragere;
- webhook unic pentru statusuri și mesaje;
- refresh token.

Probleme:

- OAuth `state` nu este persistat/verificat și nu conține sigur agenția;
- callbackul alege global `.from('agencies').single()`;
- mai multe rute Storia nu folosesc helperul central de permisiuni;
- semnătura webhook este verificată în format greșit și fail-open;
- asocierea caută ID-ul numeric în `external_id` UUID;
- procesarea este așteptată înainte de răspuns, deși comentariul spune asincron;
- nu există idempotency ledger pentru `transaction_id`;
- fallbackul poate atribui leadul ownerului/adminului când proprietatea nu este găsită.

### 9.2 Facebook

Există numai publicare. Nu există confirmare robustă, reconciliere periodică sau retragere sigură la vânzare/închiriere.

### 9.3 Particulari

Refreshul OLX și Publi24 este pornit manual din interfață. Nu există cron configurat, marcarea anunțurilor dispărute, health log complet sau paginare server-side reală.

### 9.4 Cron/cozi

Nu există job programat în repository și nici coadă de mesaje. `next/server after()` poate fi folosit numai după verificarea suportului adaptorului Netlify; nu va fi tratat ca o coadă durabilă.

## 10. Permisiuni

Există un început bun:

- roluri definite central;
- hartă `DEFAULT_PERMISSIONS`;
- helper server-side care validează userul, profilul și agenția;
- multe interogări moderne filtrează `agency_id`.

Probleme:

- rolurile din `auth-context` acceptă numai owner/admin/agent, în timp ce backendul definește șase roluri;
- meniul ascunde pagini după reguli hardcodate diferite de `DEFAULT_PERMISSIONS`;
- permisiunile din `user_metadata` pot diverge de backend;
- 12 rute au autentificare manuală;
- accesul per rând nu este implementat unitar;
- agentul poate vedea sau modifica în unele module datele altui agent;
- particularii, calendarul, vizionările, tasks și activitatea echipei au reguli diferite;
- migrarea RLS acoperă numai o parte din cele 35 de tabele;
- migrațiile vechi dezactivează explicit RLS pe mai multe tabele;
- ștergerea unui membru este hard-delete în Auth și `profiles`, contrar cerinței de păstrare a istoricului.

## 11. Componente și fluxuri duplicate

- `/leads` redirecționează la `/clients`, dar componenta legacy `LeadsList` rămâne nefolosită;
- `/matches` redirecționează la `/clients`, iar `DemandsList` și `AddDemandDialog` nu mai sunt montate;
- pagina `Contacts` rămâne separată de profilul „Client”, fără reconciliere;
- există editare rapidă și editare completă a proprietății, cu mapări duplicate;
- există `PublicationStatus` și `PublicationBadges`, parțial suprapuse;
- proprietățile au mai multe endpointuri de update cu validări diferite;
- notificările din dashboard și pagina Notificări sunt generate separat;
- vizionările sunt modelate ca `calendar_events`, deși UI le tratează ca entitate separată.

## 12. Harta fluxului actual și punctele de rupere

```text
Mesaj Storia
   │
   ├─ semnătură neverificată corect                      [RUPT: securitate]
   │
   ├─ ad_id numeric -> căutare în external_id UUID      [RUPT: proprietate]
   │
   └─ Lead creat
        │
        ├─ agent fallback owner/admin                    [RUPT: responsabil real]
        ├─ converted_contact_id = null                   [RUPT: Contact]
        ├─ converted_demand_id = null                    [RUPT: Cerere]
        ├─ WhatsApp marchează fals „replied”             [RUPT: conversație]
        └─ Programare schimbă doar statusul              [RUPT: Vizionare/Calendar]

Contact separat ── Cerere separată ── Matching parțial
                                      │
                                      └─ doar 7 cereri au buget          [RUPT: potrivire]

Vizionare/calendar
   └─ nu conduce controlat la ofertă/negociere

Proprietate ── status tranzacționată
   ├─ tranzacția poate rămâne fără contact/proprietate   [RUPT: Financiar]
   └─ retragerea portalului nu are outbox/retry          [RUPT: Portaluri]
```

Fluxul țintă:

```text
Webhook verificat + idempotent
  -> Portal listing exact
  -> Proprietate
  -> Agentul proprietății
  -> Contact canonic
  -> Lead + conversație
  -> Cerere calificată
  -> Matching explicabil
  -> Vizionare reală + calendar
  -> Ofertă / negociere / rezervare
  -> Tranzacție atomică + financiar
  -> Outbox retragere site/portaluri
  -> Audit + notificări + retry
```

## 13. Migrații propuse și ordinea lor

Numele finale vor primi timestamp complet la creare.

1. `20260720_010_webhook_events.sql`
   - tabelă `webhook_events`;
   - cheie unică `portal, transaction_id`;
   - hash payload, verificare semnătură, stare procesare, eroare sigură;
   - RLS și acces numai service-role/admin autorizat.

2. `20260720_020_storia_ad_identity.sql`
   - `portal_listings.portal_ad_id text`;
   - index unic parțial `agency_id, portal, portal_ad_id` după verificarea duplicatelor;
   - pe lead: `portal_listing_id`, `portal_ad_id`, `webhook_transaction_id`, `source_normalized`;
   - indecși pentru reconciliere.

3. `20260720_030_contact_channels.sql`
   - telefon/e-mail normalizate;
   - `last_contacted_at`, `last_contact_channel`, `next_action_at`;
   - activități distincte pentru „WhatsApp deschis” și „confirmat trimis”.

4. `20260720_040_viewings.sql`
   - tabelă dedicată `viewings` cu chei către lead, contact, cerere, proprietate, agent, agenție și calendar event;
   - status, anulare, rezultat, feedback, reminder, sync status;
   - backfill din `calendar_events(type='vizionare')`.

5. `20260720_050_authorization.sql`
   - catalog roluri/permisiuni și scope per rând;
   - RLS pentru toate tabelele private;
   - politici separate pentru owner/admin/manager/agent;
   - conturile se dezactivează, nu se șterg fizic.

6. `20260720_060_secure_property_feeds.sql` — implementată și testată local
   - token separat pe agenție/portal, stocat numai ca SHA-256, cu rotire și revocare;
   - selecție explicită din `properties.attributes.publicare` (`site` pentru feedul standard, `storia` pentru feedul Storia), adaptată structurii reale a bazei;
   - feed standard cu URL public Kira și feed Storia conform structurii oficiale OLX Group;
   - jurnal de export cu proprietăți incluse/excluse, motive și rezultat de validare;
   - rollback nedistructiv în `migrations/rollback/20260720_060_secure_property_feeds.down.sql`.

7. `20260720_070_status_source_catalogs.sql`
   - cataloage pentru statusuri, surse și tranziții;
   - aliasuri pentru valorile istorice;
   - backfill fără pierderea textului original.

8. `20260720_080_client_unification.sql`
   - `contacts` rămâne entitatea canonică;
   - `leads.contact_id` explicit, fără a elimina `converted_contact_id`;
   - chei normalizate și tabelă pentru propuneri/decizii de merge;
   - audit și posibilitate de anulare a merge-ului.

9. `20260720_090_demands_matching.sql`
   - completarea structurii criteriilor;
   - localități canonice și indecși de matching;
   - scor și explicații persistabile.

10. `20260720_100_prospects_lifecycle.sql`
    - status tehnic `active/stale/removed` separat de statusul comercial;
    - canonical location, dedup groups, source health și indecși de paginare;
    - migrare graduală din `prospects` către structura `pi_*` deja existentă.

11. `20260720_110_notifications.sql`
    - notificări persistente per utilizator/agenție;
    - `read_at`, `dismissed_at`, entitate, prioritate și deduplicare.

12. `20260720_120_transactions_outbox.sql`
    - stări tranzacție;
    - legături obligatorii pentru datele noi;
    - outbox pentru retragere site/Storia/Facebook;
    - retry și rezultat confirmat.

13. `20260720_130_property_media.sql`
    - ordine fotografie, principală, ALT, stare fișier și cleanup pentru orfani;
    - nu se șterge fișierul înaintea confirmării DB.

14. `20260720_140_oauth_sessions.sql`
    - sesiuni OAuth one-time, state hash, user, agency, expirare și audit;
    - eliminarea alegerii globale a agenției.

15. `20260720_150_audit_observability.sql`
    - audit append-only pentru operațiuni sensibile;
    - job runs, integration health, retry și erori sanitizate.

Fiecare fișier va avea un rollback separat sau instrucțiuni precise. Rollbackul va elimina numai obiectele noi și va restaura valorile din tabele de mapping/backup; nu va șterge date istorice create între timp.

## 14. Backfilluri planificate

### Storia

1. extragere `raw_response.data.id` în mod dry-run;
2. detectare duplicate/ambiguități;
3. completare `portal_ad_id` numai pentru potriviri unice;
4. reluare leaduri istorice după `portal_ad_id` și agenție;
5. salvare raport: asociat, deja valid, ambiguu, imposibil.

### Contacte și leaduri

1. normalizare telefon și e-mail;
2. potriviri exacte sigure;
3. propuneri de merge pentru potriviri ambigue;
4. nicio unire automată după nume simplu.

### Statusuri și surse

1. inventar complet;
2. mapare alias -> cod canonic;
3. păstrarea valorii originale într-un câmp/audit;
4. validare că niciun lead nu devine invizibil.

### Vizionări

Evenimentele calendar de tip `vizionare` sunt copiate în noua tabelă și legate unde există referințe valide. Evenimentele incomplete rămân vizibile și sunt marcate pentru reconciliere.

## 15. Ordinea de implementare

Ordinea solicitată este păstrată:

1. webhook Storia;
2. asociere leaduri Storia;
3. WhatsApp;
4. vizionări;
5. permisiuni;
6. feed XML;
7. normalizare statusuri/surse;
8. profil unic client;
9. cereri și matching;
10. paginare;
11. Particulari;
12. notificări;
13. tranzacții și retrageri;
14. editor proprietăți și media;
15. OAuth multi-agency;
16. sincronizare Storia;
17. mobil;
18. pipeline și automatizări;
19. dashboard/KPI;
20. calitate, teste, securitate și documentație;
21. backup/restaurare și observabilitate;
22. staging și deploy controlat.

Excepție justificată: eliminarea secretului din `netlify.toml` a fost făcută imediat, înaintea fazelor funcționale, deoarece lăsarea unei chei administrative în repository este un incident activ de securitate.

## 16. Strategie de testare

### Unit

- semnătură webhook și comparație constant-time;
- telefon/surse/statusuri;
- URL public proprietate și WhatsApp;
- tranziții pipeline;
- permisiuni și row scope;
- matching și comisioane.

### Integrare

- webhook valid/invalid/lipsă/duplicat/modificat;
- webhook -> listing -> property -> agent -> lead;
- lead -> contact -> demand;
- vizionare -> calendar -> follow-up;
- feed tokenizat și fără adresă ascunsă;
- finalizare tranzacție -> outbox;
- paginare și izolare între agenții.

### E2E

- autentificare și roluri;
- proprietate/publicare;
- lead Storia;
- WhatsApp cu confirmare;
- cerere/matching/vizionare;
- tranzacție și retragere.

Datele de test vor fi sintetice într-un proiect Supabase de staging separat.

## 17. Riscuri și blocaje înainte de producție

| Risc | Severitate | Control |
|---|---|---|
| Cheie service-role prezentă în istoricul Git | critică | rotire/revocare și configurare secret store |
| Webhook fail-open | critică | verificare oficială + ledger idempotent |
| Backup fără `pg_dump`/restore test | critică | backup nativ sau acces DB + staging |
| RLS incomplet/necunoscut pe tabele noi | critică | audit SQL și teste cross-tenant |
| 56 fișiere aveau modificări necomise înaintea fazei | ridicată | snapshot, branch separat, staging selectiv |
| Migrații fără timestamp și fără tabel local de evidență | ridicată | baseline și migrații versionate |
| `2026-storia-test-property.sql` șterge listări | critică | interzis în producție, mutat la fixtures de test |
| Endpoint AI public | ridicată | autentificare, permisiune, limită și rate limit |
| Node local diferit de hosting | medie | CI pe Node 20 |
| Lipsă teste | ridicată | test harness înaintea primei reparații critice |

## 18. Criterii pentru începerea Fazelor 1–2

- documentul de față este versionat;
- backupul logic este verificat;
- branchul separat există;
- secretul nu mai este în configurația curentă;
- se instalează infrastructura minimă de teste;
- migrațiile pentru webhook și identitatea anunțului sunt create cu rollback;
- nu se aplică nimic în producție;
- documentația oficială OLX/Storia este folosită ca sursă pentru payload și semnătură.

## 19. Criterii obligatorii înainte de deploy

- backup fizic/restaurabil și restore testat;
- chei compromise rotite;
- staging separat cu date sintetice;
- toate migrațiile aplicate în ordine și verificate;
- build, type-check, lint și teste verzi pe Node 20;
- teste cross-agent și cross-agency verzi;
- webhook validat cu fixtures oficiale;
- feed verificat să nu expună adrese/date interne;
- plan de rollback testat;
- raport complet prezentat și aprobat înainte de deploy.
