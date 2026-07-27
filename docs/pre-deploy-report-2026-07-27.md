# Raport de pre-deploy — Kira CRM

Data: 27 iulie 2026  
Branch: `repair/crm-stabilizare-20260720`  
Commit verificat: `d48251eda20b0b0b107ff70a1b0cc71d737ed5cc`  
Stack: Next.js 16.2.11, React 19.2.4, Supabase JS 2.108.1,
PostgreSQL/Supabase 17.6.1.127, Playwright 1.61.1

## Verdict

Codul, backupul și lanțul de migrații sunt validate local pe o clonă reală a
producției. **Deployul în producție rămâne blocat intenționat** până când:

1. există un proiect Supabase de staging separat;
2. cele 30 de migrații sunt aplicate și verificate și în acel staging;
3. domeniul și căsuțele de e-mail sunt verificate la furnizor, iar două mesaje
   reale sunt primite;
4. raportul săptămânal este generat și trimis real din staging;
5. credențialele Storia necesare testului de integrare sunt configurate.

Deploymentul care deservește acum `crm.kiraimobiliare.ro` este încă cel Vercel
creat la 7 iulie 2026. Nu a fost înlocuit în cadrul acestei verificări.

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
```

Fiecare fază are rollback nedistructiv în fișierul asociat sau în directorul
`migrations/rollback`. Jurnalele și dovezile istorice sunt păstrate.

## Rezultatele testelor

| Verificare | Rezultat |
|---|---|
| Teste unitare și contracte | 177/177 trecute |
| Integrare PostgreSQL + rollbackuri | trecut |
| Backup sintetic + arhivă coruptă | trecut |
| Restaurare backup real | trecut |
| Migrații pe clonă reală | 30/30, de două ori |
| Build Next.js de producție | trecut |
| TypeScript din build | trecut |
| ESLint | trecut |
| Playwright E2E | 7/7 trecute |

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

Nu au fost configurate deoarece valorile nu există încă:

- `EMAIL_PROVIDER_API_KEY`;
- `ANTHROPIC_API_KEY`;
- `STORIA_CLIENT_ID`;
- `STORIA_CLIENT_SECRET`;
- `STORIA_API_KEY`;
- `STORIA_WEBHOOK_SECRET`.

Secretele de backup și conexiunea PostgreSQL rămân local, nu în frontend.

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
5. se aplică migrațiile 010–300 în aceeași ordine;
6. se verifică totalurile, RLS, loginul, leadurile Storia, proprietățile,
   vizionările, raportul și e-mailul;
7. se publică deploymentul Vercel salvat și verificat;
8. dacă apare o eroare critică, se rulează rollbackul fazei afectate; dacă
   integritatea datelor este afectată, se restaurează arhiva verificată într-un
   proiect Supabase nou și se schimbă controlat conexiunea aplicației.

## Probleme și acțiuni rămase

1. Alegerea sau crearea proiectului Supabase de staging necesită aprobarea
   proprietarului; proiectul inactiv existent nu a fost repornit sau suprascris.
2. Trebuie creat și verificat contul Resend sau adaptat furnizorul de livrare
   la Zoho, apoi publicate înregistrările DNS exacte date de furnizor.
3. Trebuie confirmate manual cele două căsuțe și primirea mesajelor de test.
4. Trebuie configurate credențialele oficiale Storia/OLX și validat un webhook
   real semnat.
5. Tokenul personal Supabase introdus anterior în conversație trebuie revocat
   și înlocuit după încheierea configurării.
6. Fișierele locale deja modificate de proprietar (logo, pagini de autentificare,
   pagina proprietății și Sidebar) au fost păstrate și nu au fost incluse în
   commiturile tehnice de mai sus.
