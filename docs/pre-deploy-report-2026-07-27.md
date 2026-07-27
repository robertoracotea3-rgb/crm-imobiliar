# Raport de pre-deploy — Kira CRM

Data: 27 iulie 2026  
Branch: `repair/crm-stabilizare-20260720`  
Stack: Next.js 16.2.11, React 19.2.4, Supabase JS 2.108.1,
PostgreSQL/Supabase 17.6.1.127, Playwright 1.61.1

## Verdict

**CRM-ul stabilizat este publicat în Production** la
`https://crm.kiraimobiliare.ro`. Deploymentul Vercel
`dpl_7vMKir4N4r6BLFUYx8ggrvjawPnE` a ajuns în starea `READY`, iar verificarea
live de autentificare, context CRM, antete de securitate și izolarea
endpointurilor cron a trecut.

La cererea proprietarului, modulul **„Anunțuri particulari” a fost eliminat
complet** din interfață, API, servicii, permisiuni și baza de date. Cele 2.642 de
înregistrări au fost eliminate numai după crearea și verificarea criptografică
a unui backup Production nou. Datele CRM principale au fost păstrate.

Livrarea automată prin e-mail rămâne dezactivată în siguranță până la
configurarea furnizorului. Configurația Storia există în Production, dar un
mesaj real semnat nu a fost încă urmărit integral de la portal până la lead.

Un proiect Supabase staging separat a fost creat pe planul Free, fără cost:
`kira-crm-staging-20260727`, ref `npvkcuehviujbdegpneq`, regiunea
`eu-central-1`. Proiectul vechi inactiv nu a fost repornit sau modificat.

## Staging găzduit și Preview Vercel

La 27 iulie 2026 a fost finalizată verificarea găzduită:

- cheile reale `anon` și `service_role` ale stagingului au fost transferate
  numai în mediul Vercel Preview, ca valori sensibile;
- parola PostgreSQL staging a fost resetată automat și nu a fost afișată sau
  persistată;
- din backup a fost restaurată numai structura schemei `public`; utilizatorii,
  datele clienților și fișierele Storage din producție nu au fost copiate;
- cele 30 de migrări inițiale au fost aplicate de două ori:
  **30/30 + 30/30 reușite**;
- cele trei corecții găsite în testul găzduit (`310`–`330`) au fost aplicate
  separat și verificate în staging;
- eliminarea modulului „Anunțuri particulari” (`340`) a fost aplicată de două
  ori și verificată ca idempotentă;
- schema finală are **94 de tabele publice, toate 94 cu RLS activ**;
- redirecturile Supabase Auth indică numai către URL-ul staging;
- înscrierea publică directă prin Supabase Auth este dezactivată; utilizatorii
  pot fi creați numai prin fluxul CRM protejat sau administrativ;
- a fost creată o agenție sintetică și un cont `TEST` exclusiv pentru staging;
- loginul real trece, creează sesiunea CRM și redirecționează la `/dashboard`;
- contextul autentificat confirmă utilizatorul, agenția și rolul `agent`;
- API-urile găzduite pentru dashboard, proprietăți, contacte, leaduri și
  cataloage au răspuns corect;
- buildul local și buildul Vercel au trecut.

Deploymentul Preview verificat este:
`https://crm-fortis-staging-20260727.vercel.app`. Deploymentul rămâne protejat
de autentificarea Vercel; după validarea sa a fost publicat separat deploymentul
Production consemnat în verdict și în secțiunea finală.

Aliasul indică deploymentul Preview `dpl_FC89bqy6JbacyjceEVFi88jhEKFw`,
care a ajuns în starea `READY`.

Planul Vercel Hobby nu permite cronuri orare. Programările Production au fost
adaptate la frecvență zilnică: sincronizarea Storia, automatizările și
rapoartele sunt declanșate o dată pe zi, iar logica internă decide dacă există
lucrări scadente. Această variantă nu are cost suplimentar, dar poate întârzia
o automatizare cu până la aproximativ 24 de ore.

Testul găzduit a găsit o incompatibilitate reală: pe proiectele Supabase noi,
`pgcrypto` este instalat în schema `extensions`, în timp ce funcția de audit
căuta `digest()` numai în `public`. Migrarea auditului folosește acum explicit
și schema `extensions`, a fost reaplicată în staging, iar loginul și scrierea
jurnalului au trecut după corecție.

Testul funcțional proprietate–lead–client–vizionare a găsit și a corectat trei
defecte suplimentare:

1. triggerul care introduce proprietățile active în coada internă de matching
   rula cu privilegiile agentului și bloca salvarea proprietății;
2. triggerul ciclului de viață al clientului presupunea că orice schemă legacy
   are `leads.created_at`, deși schema găzduită folosește `received_at`;
3. programarea imediată a unei vizionări pentru un lead nou nu era permisă de
   matricea de tranziții, deși fluxul de vizionare o execută intenționat.

După corecții au fost verificate prin API-urile Preview: proprietatea activă,
contactul canonic, leadul cu sursa `storia`, asocierea la proprietate, moștenirea
agentului responsabil, linkul public `kiraimobiliare.ro`, vizionarea, eticheta
proprietății în lista de vizionări și KPI-urile agentului. Datele sintetice au
fost apoi arhivate/ascunse; în liste au rămas **0 proprietăți, 0 leaduri,
0 contacte și 0 vizionări sintetice active**.

## Backup de producție și restaurare

- parola PostgreSQL Supabase a fost resetată prin API-ul oficial, cu aprobarea
  explicită a proprietarului;
- noua parolă nu a fost afișată și a fost salvată numai în configurația locală;
- arhivă: `kira-backup-2026-07-27T11-19-16-359Z.kira`;
- locație: `C:\Users\oligi\Documents\Codex\2026-07-05\vreau\backups\crm`;
- dimensiune: 66.025.775 bytes;
- SHA-256:
  `0f15fb4fc2f36a0aa3d7c8b58a7d9a1801375027c14b6e286c02994abe41f5bf`;
- format: arhivă autentificată și criptată AES-256-GCM;
- manifest și hashuri interne: verificate;
- restaurare reală: reușită într-un container izolat
  `supabase/postgres:17.6.1.127`;
- 570 de fișiere din arhivă au trecut verificarea de integritate;
- containerele temporare au fost șterse după verificare.

Conținut agregat verificat după restaurare, fără expunerea datelor personale:

| Indicator | Valoare înainte de migrare |
|---|---:|
| Tabele publice | 35 |
| Tabele publice cu RLS | 35 |
| Politici publice | 65 |
| Agenții | 1 |
| Profiluri | 5 |
| Proprietăți | 42 |
| Contacte | 263 |
| Leaduri | 241 |
| Tranzacții | 5 |
| Utilizatori Auth | 6 |
| Obiecte Storage | 568 |

## Testul migrațiilor pe copia producției

Toate migrațiile au fost aplicate de la zero, în ordine, pe copia restaurată.
Întregul lanț a fost aplicat apoi încă o dată pentru idempotency:

- prima aplicare: **30/30 reușite**;
- a doua aplicare: **30/30 reușite**;
- tabele publice după migrare: 97;
- tabele publice cu RLS după migrare: 97;
- politici publice după migrare: 234;
- funcții publice după migrare: 157;
- proprietăți păstrate: 42;
- leaduri păstrate: 241;
- tranzacții păstrate: 5;
- obiecte Storage păstrate în catalog: 568;
- contacte după reconcilierea controlată: 292.

Creșterea de la 263 la 292 de contacte este rezultatul reconcilierii leadurilor
istorice fără profil canonic. Leadurile sursă nu au fost șterse.

### Probleme reale găsite și corectate

1. `properties.status` era enum în producție, dar migrația îl trata ca text.
   Conversia păstrează și recreează trigger-ele dependente.
2. Cererile istorice conțineau relații client–agent repetate. Backfillul este
   acum deduplicat înainte de `ON CONFLICT`, fără ștergerea cererilor.
3. `properties.category` este enum în schema istorică. Generarea URL-ului public
   face acum conversia explicită la text.
4. Trei tabele tehnice globale aveau drepturile revocate, dar RLS nu era activ.
   Acum toate cele 97 de tabele publice au RLS.
5. Fixture-ul E2E al dashboardului nu conținea noul bloc `contact_sla`.
   Contractul simulat și testul de browser au fost actualizate.
6. Triggerul server-only al cozii de matching nu avea `SECURITY DEFINER`.
7. Triggerul de reactivare a clientului accesa direct o coloană legacy absentă.
8. Tranzițiile leadului nu acopereau o vizionare convenită direct pentru un
   lead nou sau fără răspuns.

Commituri dedicate:

- `afda422` — restaurare reală compatibilă cu PostgreSQL Supabase;
- `56c53f8` — migrații sigure pe schema și datele producției;
- `d48251e` — contract E2E complet pentru dashboardul SLA.

## Lista migrațiilor pentru staging și producție

```text
20260720_010_webhook_events.sql
20260720_020_storia_ad_identity.sql
20260720_030_whatsapp_contact_tracking.sql
20260720_040_viewing_workflow.sql
20260720_050_permissions_and_rls.sql
20260720_060_secure_property_feeds.sql
20260720_070_status_source_catalogs.sql
20260720_080_client_unification.sql
20260720_090_demands_and_matching.sql
20260720_100_prospects_rebuild.sql
20260720_110_persistent_notifications.sql
20260720_120_atomic_transactions_outbox.sql
20260720_130_property_media.sql
20260720_140_storia_oauth_security.sql
20260720_150_storia_listing_sync.sql
20260720_160_operational_pipeline.sql
20260720_170_automation_engine.sql
20260720_180_exact_dashboard_kpis.sql
20260720_190_immutable_audit_log.sql
20260723_200_account_security.sql
20260723_210_system_observability.sql
20260724_220_property_assignments.sql
20260724_230_storia_lead_property_assignment.sql
20260724_240_lead_contact_sla.sql
20260724_250_factual_contact_interactions.sql
20260724_260_contact_lifecycle.sql
20260724_270_demand_review_workflow.sql
20260724_280_property_types_and_dynamic_fields.sql
20260724_290_agency_email_delivery.sql
20260724_300_weekly_agent_reports.sql
20260727_310_demand_match_queue_trigger_security.sql
20260727_320_lead_insert_trigger_compatibility.sql
20260727_330_direct_viewing_lead_transitions.sql
20260727_340_remove_prospects_module.sql
```

Fazele funcționale au rollback în fișierul asociat sau în directorul
`migrations/rollback`. Eliminarea permanentă `340` se poate restaura numai
dintr-un backup verificat; rollbackul ei refuză intenționat recrearea unor
tabele goale care ar da impresia falsă că datele istorice au fost recuperate.
Jurnalele și dovezile istorice de audit sunt păstrate.

## Rezultatele testelor

| Verificare | Rezultat |
|---|---|
| Teste unitare și contracte | 176/176 trecute |
| Integrare PostgreSQL + rollbackuri | trecut |
| Backup sintetic + arhivă coruptă | trecut |
| Restaurare backup real | trecut |
| Migrații pe clonă reală | lanțul complet, de două ori |
| Build Next.js de producție | trecut |
| TypeScript din build | trecut |
| ESLint | trecut |
| Playwright E2E | 7/7 trecute |
| Supabase staging găzduit | corecțiile 310–340 aplicate; eliminarea 340 repetată; 94/94 tabele cu RLS |
| Login și context CRM în Preview | trecut |
| API-uri principale în Preview | dashboard, cataloage și fluxul proprietate–lead Storia–contact–vizionare–KPI trecute |
| Supabase Production | 34 migrări aplicate; 94/94 tabele cu RLS |
| Smoke test Production | login, context CRM, securitate, cron 401 și `/api/prospects` 404 — trecute |

Scenariile E2E includ login invalid, login valid, dashboard și KPI exacți,
MFA, schimbarea parolei temporare, jurnalul de audit, sănătatea sistemului și
fluxul proprietate–lead–vizionare–tranzacție–retragere portal.

## Configurația Vercel

Au fost introduse în mediul Production, ca valori sensibile și fără afișarea
conținutului:

- `NEXT_PUBLIC_SUPABASE_URL`;
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
- `SUPABASE_SERVICE_ROLE_KEY`;
- `REGISTRATION_ACCESS_CODE`;
- `NEXT_PUBLIC_APP_URL`;
- `CRON_SECRET`;
- `AUTH_SECURITY_HASH_SALT`;
- `AUDIT_IP_HASH_SALT`;
- `PORTAL_TOKEN_ENCRYPTION_KEY`.

Sunt prezente și numele de configurare pentru Anthropic și integrarea Storia.
Valorile nu au fost afișate sau copiate în raport. Validitatea Storia trebuie
confirmată printr-un mesaj real semnat.

Nu este configurată deoarece valoarea nu există încă:

- `EMAIL_PROVIDER_API_KEY`;

Secretele de backup și conexiunea PostgreSQL rămân local, nu în frontend.

În mediul Preview au fost configurate separat:

- URL-ul, cheia `anon` și cheia `service_role` ale proiectului staging;
- `NEXT_PUBLIC_APP_URL` pentru aliasul stabil de staging;
- secrete staging noi și independente pentru cron, audit, autentificare,
  înregistrare și criptarea tokenurilor portalurilor.

Nicio valoare Preview generată pentru staging nu a fost copiată în Production.

## E-mail

DNS verificat la 27 iulie 2026:

- MX: Zoho EU;
- SPF: `v=spf1 include:zoho.eu ~all`;
- DMARC: politică de monitorizare `p=none`;
- existența căsuțelor `documente@kiraimobiliare.ro` și
  `rapoarte@kiraimobiliare.ro` nu este confirmată;
- domeniul Resend, DKIM-ul furnizorului și cheia API nu sunt configurate.

Prin urmare, nu există încă dovadă de trimitere și primire reală. CRM-ul
blochează corect marcarea mesajelor și rapoartelor drept trimise până la
confirmarea furnizorului și a inboxului.

## Rollback și ordinea sigură pentru producție

1. se creează încă un backup criptat imediat înainte de fereastra de migrare;
2. se verifică hashul și se păstrează copia în afara calculatorului curent;
3. se aplică migrațiile în staging și se rulează testele funcționale reale;
4. se opresc temporar scrierile în producție;
5. se aplică migrațiile 010–340 în aceeași ordine;
6. se verifică totalurile, RLS, loginul, leadurile Storia, proprietățile,
   vizionările, raportul și e-mailul;
7. se publică deploymentul Vercel salvat și verificat;
8. dacă apare o eroare critică, se rulează rollbackul fazei afectate; dacă
   integritatea datelor este afectată, se restaurează arhiva verificată într-un
   proiect Supabase nou și se schimbă controlat conexiunea aplicației.

## Probleme și acțiuni rămase

1. Trebuie creat și verificat contul Resend sau adaptat furnizorul de livrare
   la Zoho, apoi publicate înregistrările DNS exacte date de furnizor.
2. Trebuie confirmate manual cele două căsuțe și primirea mesajelor de test.
3. Trebuie validat integral un webhook Storia real semnat și asocierea sa la
   proprietatea și agentul corect.
4. Tokenul personal Supabase introdus anterior în conversație trebuie revocat
   și înlocuit după încheierea configurării.
5. Fișierele locale deja modificate de proprietar (logo, pagini de autentificare,
   pagina proprietății și Sidebar) au fost păstrate și nu au fost incluse în
   commiturile tehnice de mai sus.
6. Contul Auth `TEST` din Production nu are profil CRM și este refuzat corect
   ca inactiv. Poate fi recreat controlat numai dacă proprietarul dorește un
   cont de test permanent.

## Lansare Production — 27 iulie 2026

- backup imediat anterior migrării:
  `kira-backup-2026-07-27T14-35-55-868Z.kira`;
- dimensiune: 66.024.239 bytes;
- SHA-256:
  `71eda84e51f269f3bd6b2a4f48306ad4763756327b0e0614e38523456fefd633`;
- migrații Production aplicate: **34/34**;
- tabele publice finale: **94/94 cu RLS activ**;
- proprietăți păstrate: **42**;
- contacte canonice după reconciliere: **292**;
- leaduri păstrate: **241**;
- cereri păstrate: **222**;
- tranzacții păstrate: **6**;
- înregistrări „Anunțuri particulari” eliminate: **2.642**;
- endpointurile eliminate răspund cu `404`;
- contul activ `roberto` a trecut autentificarea și contextul CRM live, iar
  sesiunea temporară de verificare a fost revocată la final.
