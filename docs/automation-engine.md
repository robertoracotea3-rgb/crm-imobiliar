# Motorul de automatizări CRM

## Ce rezolvă

Automatizările nu mai depind de condiții ascunse în pagini. O schimbare de
domeniu creează un eveniment persistent, regula activă creează o singură
execuție, iar workerul salvează rezultatul fiecărei tentative.

Flux:

`eveniment → regulă activă → job unic → acțiune → jurnal`

Tabele:

- `automation_rules`: configurația celor 10 reguli pentru fiecare agenție;
- `automation_events`: evenimente de business deduplicate;
- `automation_jobs`: coada durabilă, cu blocare concurentă și retry;
- `automation_run_logs`: istoricul fiecărei tentative.

## Reguli inițiale

1. Lead nou → notificare agent.
2. Lead fără răspuns → reminder configurabil.
3. Vizionare programată → reminder configurabil.
4. Vizionare efectuată → task follow-up.
5. Cerere nouă → matching.
6. Proprietate nouă/activată → matching cu cererile.
7. Proprietate tranzacționată/închiriată → retragere portaluri.
8. Listare cu eroare → notificare administratori.
9. Task expirat → notificare.
10. Lead activ fără următoarea acțiune → alertă.

Regulile se administrează din `Setări → Automatizări`. O regulă poate fi
oprită fără ștergerea istoricului. Intervalele relevante se pot modifica din
interfață.

## Execuție și recuperare

- Interfața verifică automat coada când actualizează badge-ul de notificări.
- `/api/cron/automations` este verificarea zilnică de siguranță și acceptă doar
  secretul `CRON_SECRET`.
- Butonul „Verifică acum” rulează doar automatizările agenției autentificate.
- Joburile blocate mai mult de 15 minute pot fi revendicate din nou.
- Retry-ul are întârziere crescătoare și este limitat de `max_attempts`.
- Un job e unic pentru perechea regulă/eveniment; notificările reutilizează
  cheile istorice, astfel încât sistemul vechi și cel nou nu dublează inboxul.

## Instalare

1. Rulează `migrations/20260720_170_automation_engine.sql` după migrarea 160.
2. Verifică existența variabilei `CRON_SECRET` în mediul de producție.
3. Publică aplicația numai după migrare.
4. Deschide `Setări → Automatizări`, verifică intervalele și apasă „Verifică acum”.

Rollbackul dezactivează toate joburile executabile și elimină funcțiile și
triggerele, dar păstrează configurația și istoricul pentru audit.
