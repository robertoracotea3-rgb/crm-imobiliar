# Pipeline operațional

Pipeline-ul fazei 18 este un strat operațional separat de `leads.status`.
Statusurile istorice nu sunt șterse și nu sunt suprascrise. La migrare, valoarea
existentă este copiată în `pipeline_legacy_status`, iar etapa operațională este
inițializată printr-o mapare conservatoare.

## Reguli

- Etapele și tranzițiile sunt definite central în `lib/crm-pipeline.ts` și în
  cataloagele SQL.
- Orice schimbare manuală trece prin `crm_transition_lead_pipeline`.
- Actualizarea directă a `leads.pipeline_stage` este refuzată de trigger.
- Etapele active cer tipul și data viitoare a următoarei acțiuni.
- `Contactat` cere contact factual confirmat.
- `Calificat` cere client unic, categorie, tranzacție, zonă și buget cunoscut
  sau declarat necunoscut.
- `Cerere completată`, `Proprietăți trimise`, etapele de vizionare și etapele
  tranzacției cer rânduri reale în tabelele-sursă.
- `Rezervare` cere proprietate, client, sumă și dată.
- `Finalizat` cere o tranzacție finalizată atomic.
- `Pierdut` cere motiv și observație.

## Istoric și audit

Fiecare tranziție este adăugată în `lead_pipeline_events`. Evenimentele de
migrare păstrează statusul anterior în câmpul `evidence`. Proprietățile
confirmate ca trimise sunt înregistrate idempotent în
`lead_property_shares`; simpla deschidere WhatsApp nu este dovadă de trimitere.

## Verificare manuală în staging

1. Aplică migrarea `20260720_160_operational_pipeline.sql`.
2. Deschide `/pipeline` cu un rol de agent și cu un rol de administrator.
3. Încearcă să sari la o etapă fără dovada cerută și verifică lista de blocaje.
4. Confirmă contactul, completează cererea, trimite proprietatea, programează și
   finalizează o vizionare, apoi creează tranzacția.
5. Verifică istoricul clientului și faptul că statusul istoric este încă afișat.
6. Pentru rezervare, verifică refuzul fără dată și acceptarea după completare.

Migrarea și rollback-ul se verifică întâi pe o copie a bazei. Rollback-ul
păstrează evenimentele și dovezile dacă au fost deja folosite.
