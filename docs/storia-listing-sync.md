# Sincronizarea listărilor Storia

Implementarea folosește webhookurile semnate ca sursă principală pentru
actualizări și API-ul oficial de metadata ca mecanism periodic de verificare și
recuperare:

- `GET /advert/v1/meta` pentru inventarul complet, cu paginare;
- `GET /advert/v1/{uuid}/meta` pentru verificarea punctuală;
- documentație: `https://developer.olxgroup.com/docs/advert-status-sync`;
- format metadata: `https://developer.olxgroup.com/docs/get-advert-metadata`.

O listare locală cu status `active` nu este prezentată ca activă dacă nu există
o confirmare remote reușită și suficient de recentă. După 36 de ore fără
confirmare, ea devine `stale` în interfață și este generată o alertă operațională
deduplicată.

## Date păstrate

Pentru fiecare listare se păstrează separat:

- UUID-ul API și ID-ul public al anunțului;
- URL-ul public Storia;
- statusul remote și existența remote;
- ultima verificare, ultimul sync reușit și ultima eroare;
- un payload restrâns la câmpurile operaționale;
- proprietatea și agentul responsabil;
- numărul erorilor consecutive și următoarea verificare.

Istoricul verificărilor, rulărilor și starea de sănătate se păstrează în
`portal_listing_checks`, `portal_sync_runs` și `portal_sync_health`.

## Job periodic

Vercel apelează zilnic `GET /api/cron/storia-sync`, la 02:17 UTC. Ruta acceptă
doar:

```text
Authorization: Bearer <CRON_SECRET>
```

`CRON_SECRET` trebuie să aibă minimum 16 caractere, să fie aleator și să existe
în mediul de hosting. Compararea este constant-time. Joburile folosesc atât o
cheie zilnică idempotentă, cât și un lock per agenție; rulările duplicate sau
suprapuse nu execută din nou sincronizarea.

Sincronizarea manuală din pagina Portaluri folosește permisiunea `portals/edit`.
O verificare punctuală din pagina unei proprietăți este limitată și nu este
repetată dacă ultima verificare are mai puțin de cinci minute.

## Ordine de instalare

1. backup restaurabil și test de restore;
2. configurarea `CRON_SECRET` în staging;
3. aplicarea `migrations/20260720_150_storia_listing_sync.sql`;
4. deploy-ul aplicației și al `vercel.json`;
5. conectare Storia și sincronizare manuală;
6. verificarea listărilor `active`, `stale`, `unverified`, `error` și `deleted`;
7. verificarea rulării automate și a alertelor înainte de producție.

Rollbackul de urgență este
`migrations/20260720_150_storia_listing_sync.rollback.sql`. El elimină funcțiile
de scriere și șterge tabelele operaționale numai dacă sunt goale; istoricul
existent este păstrat intenționat.
