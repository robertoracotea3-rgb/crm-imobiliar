# Validarea în staging a raportului săptămânal

Raportul nu trebuie activat în producție până când pașii de mai jos nu sunt
finalizați pe o copie de staging a datelor.

## Condiții înainte de migrare

1. Creează și verifică un backup restaurabil al bazei de date.
2. Rulează toate migrațiile în ordine, inclusiv:
   - `20260724_290_agency_email_delivery.sql`;
   - `20260724_300_weekly_agent_reports.sql`.
3. Rulează `npm run test:db` într-un mediu cu Docker/PostgreSQL disponibil.
4. Confirmă că toate marcajele `phase34` și `phase35` sunt afișate ca reușite.

## Test funcțional

1. Deschide **Setări → E-mail** și verifică separat:
   - domeniul expeditor;
   - adresa de documente;
   - adresa de rapoarte.
2. Confirmă mesajele numai după ce sunt vizibile în inbox.
3. Deschide **Setări → Rapoarte → Deschide rapoartele**.
4. Păstrează programarea implicită vineri la 18:00 sau setează o oră apropiată
   pentru test.
5. Generează manual un raport și verifică:
   - fiecare indicator general;
   - fiecare agent;
   - deschiderea listei exacte pentru fiecare cifră;
   - paginarea unei liste cu peste 100 de rezultate;
   - exportul PDF;
   - exportul CSV.
6. Compară minimum cinci indicatori cu interogări SQL independente, fără limită
   de rânduri.

## Test de trimitere și retry

1. Retrimite raportul către adresa administrativă verificată.
2. Confirmă că raportul trece în `accepted` numai după ce furnizorul returnează
   un ID de mesaj.
3. Confirmă în `email_delivery_logs`:
   - destinatarul;
   - subiectul;
   - cheia de idempotență;
   - ID-ul furnizorului;
   - numărul încercării;
   - statusul.
4. Simulează temporar o eroare controlată a furnizorului în staging.
5. Confirmă că raportul trece în `retrying`, are `email_next_retry_at` și nu
   depășește cinci încercări.
6. Confirmă notificarea ownerului după epuizarea încercărilor.
7. Pornește două execuții cron concurente și confirmă că funcția de claim cu
   `FOR UPDATE SKIP LOCKED` permite o singură trimitere.

## Activarea jobului

Jobul este definit în `vercel.json` la minutul 13 al fiecărei ore. Ruta este
`/api/cron/weekly-reports` și acceptă numai autorizarea cu `CRON_SECRET`.

După verificarea completă în staging:

1. confirmă backupul de producție;
2. aplică migrarea;
3. setează `EMAIL_PROVIDER_API_KEY` și `CRON_SECRET` numai pe server;
4. rulează o generare manuală fără trimitere;
5. verifică rezultatele;
6. activează trimiterea programată.

## Rollback

Rulează `20260724_300_weekly_agent_reports.rollback.sql`. Rollback-ul:

- oprește funcțiile programate;
- elimină accesul utilizatorilor la raport;
- păstrează arhiva și înregistrările care justifică fiecare indicator;
- nu șterge rapoartele și dovezile de trimitere.
