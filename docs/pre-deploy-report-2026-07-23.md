# Raport final înainte de deploy — Kira CRM

Data raportului: 23 iulie 2026

Branch: `repair/crm-stabilizare-20260720`

Commit verificat: `5d5ff8b98e8203d998f2948cc0818cbec5313a96`

Stack verificat: Next.js 16.2.11, React 19.2.4, Supabase JS 2.108.1,
PostgreSQL/Supabase

## Verdict

Codul de reparare este pregătit pentru un deploy controlat în **staging**, nu direct
în producție.

Nu există încă un URL de staging furnizat și nu a fost executat un backup al bazei
de producție. Din acest motiv, producția rămâne blocată intenționat. Testul automat
de backup și restaurare a trecut într-un mediu PostgreSQL izolat, dar nu înlocuiește
backupul real care trebuie făcut imediat înainte de migrare.

## 1. Lista completă a modificărilor

### Faza 0 — audit și plan

- a fost inventariat stack-ul, schema cunoscută, rutele API, integrările și riscurile;
- a fost creat `CRM_REPAIR_PLAN.md`;
- a fost pregătit auditul read-only pentru schema Supabase;
- branchul de lucru a fost separat de ramura principală;
- commit: `2816369`.

### Faza 1 — webhook Storia

- verificare strictă a semnăturii oficiale;
- respingere când semnătura sau secretul lipsesc;
- comparație constant-time;
- registru persistent și idempotent pentru evenimente;
- protecție la retransmitere și dublarea leadurilor;
- loguri sanitizate, fără secret sau payload personal brut;
- commit: `9da5a10`.

### Faza 2 — asociere lead, proprietate și agent Storia

- identificator public `portal_ad_id` separat de UUID-ul intern;
- asociere deterministă pe agenție, portal și ID-ul anunțului;
- salvarea proprietății, listării, agentului și tranzacției webhook pe lead;
- secțiune pentru mesajele neasociate și asociere manuală controlată;
- backfill reluabil, cu mod implicit dry-run și confirmare explicită la scriere;
- commit: `842a0e7`.

### Faza 3 — WhatsApp

- normalizarea numerelor românești și internaționale;
- deschiderea linkului WhatsApp cu mesaj și link public al proprietății;
- deschiderea WhatsApp nu mai modifică fals statusul leadului;
- activitatea „trimis” se salvează numai după confirmarea utilizatorului;
- separare între încercare, trimitere confirmată și imposibilitatea contactării;
- commit: `e11e526`.

### Faza 4 — vizionări

- formular real de programare, legat de client, lead, proprietate, agent și agenție;
- salvare atomică în calendarul intern;
- reprogramare, anulare, confirmare, rezultat și feedback;
- statusul leadului se schimbă numai după crearea vizionării;
- commit: `7d51fee`.

### Faza 5 — permisiuni și izolare

- o singură matrice de roluri și permisiuni pentru interfață, API și RLS;
- verificare pe agenție, rol, modul și rând;
- blocarea accesului direct prin URL sau request modificat;
- protecție aplicată modulelor clienți, leaduri, cereri, proprietăți, calendar,
  vizionări, taskuri, particulari, echipă, financiar și portaluri;
- cheia `service_role` rămâne exclusiv pe server;
- commit: `b300160`.

### Faza 6 — feeduri XML

- tokenuri hash-uite, revocabile și rotative;
- selecție explicită a proprietăților publicabile;
- respectarea adreselor ascunse și a statusurilor;
- URL-uri publice Kira, fără linkuri CRM și fără UUID-uri interne inutile;
- validare și jurnal pentru includeri, excluderi și erori;
- snapshoturi pentru feed generic și Storia;
- commit: `6fb95d5`.

### Faza 10 — cataloage controlate

- normalizarea surselor și statusurilor;
- tranziții permise validate și în backend;
- păstrarea etichetelor istorice în câmpuri legacy;
- filtrele și scrierile noi folosesc coduri controlate;
- commit: `e3bd5b2`.

### Faza 7 — profil unic de client

- `contacts` rămâne persoana canonică;
- leadurile, cererile, vizionările și tranzacțiile sunt legate de profil;
- reconciliere deterministă după telefon și e-mail normalizate;
- zonă pentru duplicate și merge manual reversibil;
- audit dry-run pentru datele istorice;
- commit: `822cc53`.

### Faza 8 — cereri și matching

- formular și structură unitară pentru criteriile cererii;
- scor explicabil și motive de potrivire;
- recalculare controlată, coadă și prevenirea dublurilor;
- acces la cereri și rezultate din profilul clientului;
- commit: `2ba7a95`.

### Faza 9 — anunțuri de la particulari

- surse separate și normalizare comună;
- paginare și filtrare pe server;
- localitate, județ, statut, sursă și tip normalizate;
- deduplicare fără ștergerea automată a anunțurilor;
- clasificarea „agenție suspectată” este probabilistică, nu certitudine;
- sunt acceptate numai mecanisme de colectare aprobate, fără ocolirea anti-bot;
- sănătatea fiecărei surse este păstrată;
- commit: `9d28172`.

### Paginare și căutare

- infrastructură comună de paginare și răspunsuri cu total/pagină/limită;
- rutele principale filtrează pe server, în loc să încarce liste locale limitate;
- căutările și filtrele trebuie validate în staging cu volumul real înainte de
  acceptarea finală;
- consolidare în commiturile modulelor și în `8ce8763`.

### Notificări persistente

- inbox unic pentru dashboard, meniu și pagina Notificări;
- citit, necitit și închis se păstrează în cont, nu doar în browser;
- protecție pe utilizator și agenție;
- notificări generate din evenimentele CRM relevante;
- commit: `928b6e3`.

### Tranzacții și retrageri de pe portaluri

- legături obligatorii cu proprietatea, clientul, agentul și agenția;
- flux controlat ofertă–negociere–rezervare–finalizare;
- finalizare atomică și snapshoturi financiare;
- retragerile portalurilor folosesc outbox, retry și status verificabil;
- o retragere externă eșuată nu corupe tranzacția deja finalizată;
- commit: `a130150`.

### Proprietăți și fotografii

- schemă și mapare comună pentru formularele de editare;
- adăugare, ștergere, reordonare și imagine principală;
- metadate ALT, tip, hash și dimensiune;
- fișierul fizic este curățat prin job după confirmarea bazei de date;
- coadă și retry pentru fișiere orfane;
- commit: `3e6c420`.

### Storia OAuth și multi-agency

- `state` semnat, cu expirare, consum unic și legare de utilizator/agenție;
- eliminarea alegerii implicite a „primei agenții”;
- tokenuri criptate numai pe server;
- refresh, revocare, reconectare și audit;
- commit: `4eb8385`.

### Sincronizare listări Storia

- stare locală separată de starea verificată pe portal;
- salvarea URL-ului public, identificatorului, erorii și momentelor de verificare;
- job periodic autentificat;
- prag pentru listări vechi sau neverificate;
- commit: `7f3c4ae`.

### Experiență mobilă

- navigație completă „Mai mult” pe mobil;
- pagini, formulare, tabele și modale adaptate pentru lățimi mici;
- funcțiile importante nu sunt eliminate din varianta mobilă;
- commit: `6067c91`.

### Pipeline operațional

- etape și tranziții controlate;
- dovezi obligatorii pentru vizionare, rezervare și finalizare;
- motiv obligatoriu pentru pierdere;
- istoricul statusurilor vechi rămâne neschimbat;
- commit: `c2838f0`.

### Automatizări

- registru central de reguli, evenimente și execuții;
- prevenirea duplicatelor, retry, log și dezactivare;
- notificări și taskuri pentru lead, vizionare, cerere, proprietate și listări;
- job cron autentificat;
- commit: `535992a`.

### Dashboard și KPI

- interogare SQL unică, fără aproximări din primele 200 de rânduri;
- perioadă și definiții verificabile;
- scope diferit pentru owner/admin și agent;
- venituri și comisioane protejate prin permisiuni;
- commit: `5206477`.

### Calitate, dependențe și CSP

- erorile de lint și datoria TypeScript identificate au fost reparate;
- Next.js și dependențele vulnerabile au fost actualizate controlat;
- CSP cu nonce în locul excepțiilor globale nesigure;
- documentarea variabilelor de mediu și a excepțiilor;
- commituri: `1aa5662`, `7c3f525`.

### Teste automate

- teste unitare pentru normalizări, permisiuni, matching, feed, comision,
  webhook, securitate și observabilitate;
- teste SQL izolate pentru fluxul operațional și migrări;
- teste de idempotency și rollback;
- teste end-to-end în browser cu date fictive;
- commit: `8ce8763`.

### Audit log

- jurnal append-only, tenant-scoped și cu lanț criptografic;
- protecție la update/delete;
- audit pentru autentificare, permisiuni, export, ștergere, merge, agent,
  tranzacție și retragere portal;
- valori sensibile redactate;
- commit: `0a5cf67`.

### Backup și recuperare

- dump PostgreSQL, obiecte Storage și inventar Auth;
- manifest SHA-256 și arhivă AES-256-GCM;
- blocarea restaurării peste aceeași bază;
- retenție 14 zile / 90 zile săptămânal / 365 zile lunar;
- RPO țintă 6 ore și RTO țintă 4 ore;
- scripturi PowerShell pentru rulare și programare;
- test automat de restaurare într-o bază izolată;
- commit: `76add1e`.

### Securitatea conturilor

- login mutat pe server;
- MFA TOTP obligatoriu pentru owner/admin;
- limitare persistentă și blocare temporară;
- registru de sesiuni, expirare și revocare pe dispozitive;
- cont dezactivat și schimbarea username-ului invalidează sesiunile;
- schimbare obligatorie a parolei temporare și a contului de test;
- parolele, IP-urile brute și codurile TOTP nu sunt jurnalizate;
- commit: `987ad3f`.

### Observabilitate

- registru comun pentru execuții și sănătatea serviciilor;
- detectarea joburilor blocate;
- capturarea controlată a erorilor Next.js;
- monitorizare pentru webhook, Storia, cron, particulari, feeduri,
  automatizări, retrageri, fotografii, matching, autentificare și API;
- panou „Sănătate sistem” numai pentru owner/admin;
- fără corpuri de request, antete, tokenuri sau secrete în registrul central;
- commit: `5d5ff8b`.

## 2. Migrările SQL și ordinea obligatorie

Se aplică numai fișierele de reparare de mai jos, în această ordine:

| Ordine | Fișier | Rol |
| ---: | --- | --- |
| 1 | `20260720_010_webhook_events.sql` | registru webhook idempotent |
| 2 | `20260720_020_storia_ad_identity.sql` | identitatea publică a anunțului și asocierea leadului |
| 3 | `20260720_030_whatsapp_contact_tracking.sql` | rezultat factual al contactării |
| 4 | `20260720_040_viewing_workflow.sql` | flux atomic de vizionare |
| 5 | `20260720_050_permissions_and_rls.sql` | permisiuni și RLS |
| 6 | `20260720_060_secure_property_feeds.sql` | tokenuri și jurnale pentru feed |
| 7 | `20260720_070_status_source_catalogs.sql` | statusuri și surse controlate |
| 8 | `20260720_080_client_unification.sql` | client canonic și reconciliere |
| 9 | `20260720_090_demands_and_matching.sql` | cereri și matching |
| 10 | `20260720_100_prospects_rebuild.sql` | particulari și sănătatea surselor |
| 11 | `20260720_110_persistent_notifications.sql` | notificări persistente |
| 12 | `20260720_120_atomic_transactions_outbox.sql` | tranzacții și retrageri |
| 13 | `20260720_130_property_media.sql` | fotografii și curățare |
| 14 | `20260720_140_storia_oauth_security.sql` | OAuth și tokenuri criptate |
| 15 | `20260720_150_storia_listing_sync.sql` | sincronizare listări |
| 16 | `20260720_160_operational_pipeline.sql` | pipeline verificabil |
| 17 | `20260720_170_automation_engine.sql` | automatizări |
| 18 | `20260720_180_exact_dashboard_kpis.sql` | KPI exacți |
| 19 | `20260720_190_immutable_audit_log.sql` | audit imuabil |
| 20 | `20260723_200_account_security.sql` | sesiuni, MFA și limitare |
| 21 | `20260723_210_system_observability.sql` | monitorizare centrală |

Fișierele legacy `migrations/2026-*.sql` nu fac parte automat din acest pachet.
În special, `2026-storia-test-property.sql` nu se rulează în producție.

Fișierul local neversionat `migrations/2026-security-foundation.sql` nu a fost inclus,
nu a fost aplicat și trebuie reconciliat separat înainte de orice deploy.

## 3. Procedura de aplicare în staging

1. Se creează un proiect sau un slot de staging separat.
2. Se configurează variabilele server-side fără a le salva în repository.
3. Se opresc temporar cronurile de automatizare și Storia.
4. Se execută backupul complet al stagingului.
5. Se verifică backupul și restaurarea într-o bază separată.
6. Se aplică migrările 010–210, exact în ordinea de mai sus, cu oprire la prima
   eroare SQL.
7. Se publică imediat aplicația de la commitul exact din antetul raportului.
8. Pentru migrarea 200, SQL-ul și aplicația trebuie lansate în aceeași fereastră;
   sesiunile vechi vor cere reautentificare.
9. Se rulează backfillul Storia mai întâi fără scriere:

   ```powershell
   npm run backfill:storia-ad-ids
   ```

10. Numai după verificarea cazurilor sigure se permite scrierea:

    ```powershell
    npm run backfill:storia-ad-ids -- --apply --confirm BACKFILL-STORIA-AD-IDS
    ```

11. Se rulează auditările read-only pentru clienți, cereri, particulari,
    notificări, proprietăți și tranzacții.
12. Se execută checklistul manual din acest raport.
13. Abia după acceptarea stagingului se repetă procedura pentru producție.

## 4. Backupul realizat

### Realizat

- testul automat a creat o arhivă criptată temporară;
- manifestul și hashurile au fost verificate;
- arhiva a fost restaurată într-o bază PostgreSQL separată;
- protecția împotriva restaurării peste aceeași sursă a fost verificată;
- rezultatul `npm run test:backup`: trecut.

### Nerealizat încă

- backupul bazei reale de producție;
- exportul real al obiectelor Storage;
- înregistrarea taskului Windows care rulează la fiecare 6 ore;
- copierea într-o locație externă/off-site;
- un test real de restaurare a proiectului Supabase de producție.

Aceste puncte sunt porți obligatorii pentru producție.

## 5. Plan de rollback

1. Se opresc cronurile și traficul de scriere.
2. Se revine aplicația la versiunea anterioară.
3. Se aplică rollbackurile în ordine inversă: 210, 200, 190 ... 010.
4. Rollbackurile sunt intenționat nedistructive: dezactivează funcții, triggere și
   acces, dar păstrează istoricul, jurnalele, sesiunile, legăturile și datele noi.
5. Pentru Faza 200, aplicația și rollbackul SQL se fac în aceeași fereastră.
6. Pentru o eroare catastrofală nu se restaurează peste producție. Se creează un
   proiect Supabase nou, se restaurează copia verificată, se validează și apoi se
   mută traficul.
7. Ștergerea tabelelor istorice se poate face numai ulterior, printr-o schimbare
   separată și aprobată; nu face parte din rollback.

Rollbackurile pentru 010–060 sunt în `migrations/rollback/`. Rollbackurile pentru
070–210 sunt alături de migrările lor și se termină în `.rollback.sql`.

## 6. Rezultatele verificărilor automate

| Verificare | Rezultat |
| --- | --- |
| Unit și contract tests | 148 din 148 trecute |
| Integrare PostgreSQL | trecut |
| Aplicare repetată / idempotency | trecut pentru migrările acoperite |
| Rollback SQL critic | trecut |
| Backup și restore izolat | trecut |
| Build producție | trecut |
| Pagini generate de build | 40 |
| End-to-end în browser | 7 din 7 trecute |
| ESLint | trecut, fără erori |
| TypeScript | trecut prin build/verificarea strictă |
| Audit dependențe runtime | 0 vulnerabilități |

Comanda completă verificată a fost `npm run test:all`, urmată de `npm run lint` și
`npm audit --omit=dev`.

## 7. Date migrate

- producție: **0 rânduri modificate**;
- staging real: **0 rânduri modificate**, deoarece mediul nu este configurat;
- testele SQL au folosit numai date sintetice și baze izolate;
- nicio valoare istorică reală nu a fost ștearsă sau rescrisă;
- numărul real de leaduri Storia, clienți, cereri și duplicate asociabile se va
  raporta după rularea auditului și a backfillului dry-run în staging.

## 8. Secrete și date sensibile

- nu au fost găsite chei, tokenuri sau parole reale în fișierele urmărite;
- potrivirile găsite de scanare sunt exclusiv valori fictive din teste;
- valorile `.env` sunt documentate numai prin numele variabilelor;
- `service_role`, cheia de criptare, secretul cron, secretul webhook și cheia
  backupului sunt numai server-side;
- parolele și codurile TOTP nu intră în audit sau observabilitate;
- tokenurile portalului sunt criptate, iar tokenurile feedului sunt hash-uite;
- URL-urile de baze de date nu trebuie copiate în comandă, log sau capturi.

## 9. Confirmarea izolării între agenții

Izolarea este implementată în două niveluri:

1. API-ul determină agenția din profilul autentificat și aplică permisiunea pe
   modul, rol și rând.
2. RLS și funcțiile SQL verifică `agency_id`; operațiile privilegiate sunt
   disponibile numai rolului server `service_role`.

Rutele pentru sănătatea sistemului filtrează fiecare sursă pe agenția curentă.
Statisticile globale fără `agency_id` sunt numai contoare sanitizate pentru owner/admin
și nu întorc payload, utilizator, e-mail, token sau entitate din altă agenție.

Testele automate de autorizare au trecut. Acceptarea finală cere și testul manual
cu două agenții reale în staging.

## 10. Confirmarea păstrării datelor istorice

- migrările sunt aditive și idempotente unde permite PostgreSQL;
- câmpurile și etichetele vechi sunt păstrate;
- merge-ul de clienți păstrează snapshot și poate fi anulat;
- mesajele neasociate nu sunt șterse;
- anulările și retragerile rămân în istoric;
- jurnalele de audit, securitate, sincronizare și observabilitate sunt păstrate de
  rollback;
- curățarea fișierelor se face numai după confirmarea modificării în bază;
- backfillul nu suprascrie legături valide și nu scrie fără confirmare explicită.

## 11. Probleme nerezolvate și riscuri cunoscute

### Blocaje înainte de producție

- URL de staging: **neconfigurat / nefurnizat**;
- `crm.kiraimobiliare.ro` nu a returnat un A/CNAME utilizabil la verificarea din
  23 iulie 2026, iar conexiunea HTTPS nu a putut fi deschisă;
- folderul este legat local atât la un proiect Vercel numit `crm-fortis`, cât și la
  un site Netlify; platforma activă trebuie aleasă înainte de deploy;
- autentificarea locală pentru Vercel/Netlify nu este configurată;
- backup real de producție: **neexecutat**;
- task automat de backup și locație off-site: **neconfigurate**;
- TOTP trebuie activat și verificat în Supabase Dashboard;
- integrările Storia trebuie verificate cu contul și secretele reale în staging;
- mediul extern de monitorizare a disponibilității trebuie configurat;
- fișierul local neversionat `2026-security-foundation.sql` trebuie reconciliat.

### Riscuri operaționale

- migrarea de sesiuni obligă utilizatorii existenți să se autentifice din nou;
- activarea RLS poate expune diferențe în date legacy fără `agency_id`; auditul
  staging trebuie să raporteze aceste rânduri înainte de producție;
- ID-urile Storia istorice ambigue nu pot fi asociate automat fără risc;
- sursele pentru particulari se pot modifica extern și trebuie monitorizate;
- WhatsApp este link cu confirmare umană, nu WhatsApp Business; livrarea și citirea
  nu sunt confirmate automat;
- calendarul intern este funcțional; nu se declară sincronizare Google Calendar
  fără o integrare externă reală configurată;
- Facebook și retragerile altor portaluri se confirmă numai dacă există integrarea
  reală și un răspuns extern;
- panoul intern nu poate raporta o cădere totală a aplicației sau bazei; este
  necesar un monitor extern;
- volumele reale pot evidenția indexuri sau timeouturi care nu apar în fixture;
- modificările locale neversionate pentru logo și linkul public al proprietății
  nu fac parte din commiturile de reparare și trebuie verificate separat.

## 12. Checklist manual în staging

### Autentificare și permisiuni

- [ ] Owner fără TOTP este trimis la configurarea 2FA.
- [ ] Owner cu TOTP valid intră cu AAL2.
- [ ] Agentul fără MFA intră conform politicii AAL1.
- [ ] Cinci parole greșite blochează temporar contul sintetic.
- [ ] Contul de test este obligat să folosească o parolă nouă și puternică.
- [ ] Revocarea celorlalte sesiuni păstrează sesiunea curentă.
- [ ] Dezactivarea contului blochează imediat API-ul.
- [ ] Agentul A nu poate citi/modifica datele agentului B prin URL sau request.
- [ ] Agenția A nu poate accesa nicio entitate din agenția B.
- [ ] Viewer nu poate scrie; rolul financiar vede numai ceea ce permite matricea.

### Storia

- [ ] Semnătura validă este acceptată.
- [ ] Semnătura lipsă, greșită sau secretul lipsă sunt respinse.
- [ ] Retrimiterea aceleiași tranzacții nu creează al doilea lead.
- [ ] Mesajul este asociat proprietății și agentului corect.
- [ ] Clickul pe proprietate deschide pagina corectă.
- [ ] Mesajele neasociate afișează motivul și permit asocierea manuală.
- [ ] Dry-runul raportează cazurile sigure și ambigue.
- [ ] OAuth nu permite schimbarea agenției din parametri.
- [ ] Refreshul, revocarea și reconectarea tokenului funcționează.
- [ ] Sincronizarea salvează statusul și URL-ul confirmate de portal.

### Flux CRM

- [ ] WhatsApp se deschide cu numărul, mesajul și linkul public corect.
- [ ] Simplul click nu schimbă statusul și nu pretinde că mesajul a fost trimis.
- [ ] Confirmarea trimiterii creează activitatea factuală.
- [ ] Vizionarea apare la client, proprietate și în calendar.
- [ ] Reprogramarea și anularea păstrează istoricul.
- [ ] O cerere nouă generează potriviri explicabile.
- [ ] Listele și filtrele depășesc 200 de rânduri pe setul real.
- [ ] Localitățile sunt selectabile din valorile normalizate.
- [ ] Particularii se filtrează pe întregul rezultat, nu doar pe pagina curentă.
- [ ] Duplicatele sunt grupate, nu șterse.
- [ ] Notificările citite rămân citite după relogare.
- [ ] Etapele pipeline invalide sunt respinse și în API.
- [ ] Finalizarea tranzacției actualizează financiarul și pornește retragerile.
- [ ] O retragere eșuată rămâne la retry și nu anulează tranzacția.
- [ ] O fotografie existentă poate fi ștearsă fără adăugarea alteia.
- [ ] Feedul nu conține adrese ascunse, UUID sau linkuri CRM.
- [ ] Linkul public al proprietății folosește `kiraimobiliare.ro`.

### Monitorizare și recuperare

- [ ] Panoul „Sănătate sistem” este vizibil numai owner/admin.
- [ ] Un job sintetic blocat este marcat „Blocat”.
- [ ] Erorile afișate nu conțin payload, token sau date din altă agenție.
- [ ] Backupul real poate fi decriptat și restaurat într-un proiect separat.
- [ ] Arhiva există și la un furnizor/volum separat.
- [ ] Cronurile folosesc secretul corect și nu pot fi apelate anonim.

### Interfață

- [ ] Fluxurile principale sunt verificate la 320, 375, 390 și 768 px.
- [ ] Meniul mobil oferă Particulari, Portaluri, Echipă, Notificări și Setări.
- [ ] Logo-ul, meniul și contrastul sunt corecte pe paginile publice și CRM.
- [ ] CSP nu blochează imaginile, hărțile, Supabase sau funcțiile necesare.

## 13. Checklist imediat după deploy

- [ ] Confirmă commitul publicat și versiunea buildului.
- [ ] Confirmă că toate cele 21 de migrări s-au încheiat fără eroare.
- [ ] Verifică numărul de rânduri înainte/după pentru tabelele principale.
- [ ] Verifică login owner/admin cu TOTP și login agent.
- [ ] Verifică RLS cu două agenții și doi agenți.
- [ ] Trimite un webhook Storia sintetic semnat și unul invalid.
- [ ] Verifică un lead real Storia până la proprietate și agent.
- [ ] Verifică feedul XML și un link public de proprietate.
- [ ] Rulează o sincronizare Storia și o automatizare manuală.
- [ ] Verifică outboxurile fără joburi blocate.
- [ ] Verifică panoul de sănătate și alertele externe.
- [ ] Verifică logul de audit și absența secretelor.
- [ ] Confirmă că backupul post-deploy a reușit.
- [ ] Urmărește erorile, latența și cozile la 15 minute, o oră și 24 de ore.
- [ ] Dacă apare o eroare critică, oprește scrierile și aplică planul de rollback.

## 14. URL staging

**NECONFIGURAT / NEFURNIZAT.**

Legăturile locale către Vercel și Netlify nu reprezintă un mediu valid de staging.
Nu există token local de deploy, iar `NEXT_PUBLIC_APP_URL` nu este configurat în
mediul de lucru. Domeniul CRM public nu a putut fi rezolvat/deschis la verificarea
din data raportului.

Nu se aprobă producția până când URL-ul de staging nu există și checklistul manual
nu este semnat.

## 15. Fișiere locale excluse din raportul de release

Următoarele modificări locale nu sunt incluse în commitul verificat și nu trebuie
amestecate accidental în deploy:

- iconurile și logo-urile locale;
- paginile unde logo-ul a fost schimbat;
- modificarea locală a linkului de distribuire a proprietății;
- `migrations/2026-security-foundation.sql`;
- `scripts/verify-security-migration.mjs`.

Ele trebuie revizuite și salvate într-un commit separat sau eliminate din pachetul
de release, fără a rescrie commiturile de reparare.

## 16. Concluzie de acceptare

Pachetul tehnic trece verificările automate și păstrează datele istorice. Poate
intra în staging după configurarea mediului și efectuarea backupului de staging.

Producția va putea fi aprobată numai după:

1. backup real și restaurare verificată;
2. staging funcțional;
3. TOTP și secrete externe configurate;
4. testele manuale cu două agenții și date reprezentative;
5. reconcilierea fișierelor locale excluse;
6. raportarea numărului real de rânduri din dry-runurile istorice.
