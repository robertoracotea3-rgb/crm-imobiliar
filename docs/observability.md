# Observabilitate și sănătatea sistemului

## Ce monitorizează CRM-ul

Panoul **Sănătate sistem** este disponibil numai rolurilor `owner` și `admin`.
Datele sunt izolate pe agenție în API, iar tabelele interne nu pot fi citite sau
modificate direct de rolul `authenticated`.

Panoul unește fără să dubleze istoricul existent:

- erori API auditate și erori necontrolate capturate de Next.js;
- webhookuri Storia procesate, respinse, eșuate sau blocate;
- cronul și sincronizarea listărilor Storia;
- importurile aprobate din modulul Particulari;
- automatizările și reîncercările lor;
- feedurile XML și validarea lor;
- retragerile proprietăților de pe portaluri;
- curățarea fotografiilor;
- coada de recalculare a potrivirilor;
- autentificări, blocări temporare și accesări refuzate;
- indisponibilitatea unei surse de date din panoul de sănătate.

Pentru fiecare serviciu sunt afișate starea, ultimul succes, ultima eroare
controlată, durata, următoarea rulare, numărul de reîncercări și indicatorii
specifici. Operațiile centrale care rămân `running` mai mult de 10 minute sunt
marcate automat `stalled`.

## Stocare și confidențialitate

Migrarea:

```text
migrations/20260723_210_system_observability.sql
```

Rollback:

```text
migrations/20260723_210_system_observability.rollback.sql
```

`crm_system_operation_runs` păstrează execuțiile sanitizate, iar
`crm_system_service_health` păstrează ultima stare pe agenție și serviciu.
Rollbackul elimină funcțiile de scriere, dar păstrează tabelele și istoricul.

Nu se stochează:

- corpul requestului;
- antetele requestului;
- `Authorization`, cookies sau tokenuri;
- parole, secrete ori coduri TOTP;
- adrese de e-mail din mesaje de eroare;
- payloaduri brute de integrare în registrul central.

Mesajele sunt limitate și redactate înainte de a ajunge în baza de date.
Detaliile operaționale complete rămân în jurnalele specializate cu protecțiile
lor existente.

## Capturarea erorilor Next.js

Fișierul rădăcină `instrumentation.ts` folosește hookul stabil
`onRequestError`. Sunt trimise numai calea rutei fără query string, metoda,
tipul rutei și digestul tehnic. Înregistrarea erorii este așteptată, dar dacă
observabilitatea însăși nu este disponibilă nu este generată o a doua eroare.

Referință oficială:
[Next.js instrumentation și onRequestError](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation).

## Verificare înainte de deploy

1. Aplică migrarea după Faza 25.
2. Rulează `npm run test:db`; migrarea este aplicată de două ori și apoi este
   verificat rollbackul.
3. Deschide **Sănătate sistem** ca owner/admin.
4. Verifică faptul că un agent sau manager primește `403` prin API direct.
5. Pornește manual sincronizarea Storia și confirmă durata, contoarele și
   următoarea rulare.
6. Creează un job sintetic blocat în staging și confirmă starea `Blocat`.
7. Generează un feed valid și unul invalid în staging și confirmă indicatorii.
8. Verifică faptul că răspunsul API nu conține `error_message`, tokenuri sau
   identificatori din alte agenții.

## Limitări și operare

Panoul intern nu înlocuiește alertele infrastructurii de hosting, monitorizarea
disponibilității din exterior sau logurile Supabase. Acestea trebuie activate în
staging/producție pentru căderi complete în care aplicația sau baza de date nu
mai poate scrie deloc. Registrul intern rămâne sursa pentru starea fluxurilor CRM
și pentru joburile blocate.
