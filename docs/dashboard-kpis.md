# Dashboard și KPI exacți

Dashboardul folosește funcția `crm_dashboard_kpis` și nu mai descarcă liste
limitate pentru a număra în browser/server. Toate numărătorile și sumele sunt
agregate direct de PostgreSQL.

## Perioade

Utilizatorul poate selecta ultimele 7, 30 sau 90 de zile, luna curentă ori anul
curent. Leadurile, răspunsurile, vizionările, etapele de ofertă/rezervare,
tranzacțiile, venitul și conversia folosesc perioada. Indicatorii de stoc
(proprietăți active/expirate, listări cu erori, taskuri și leaduri fără acțiune)
reprezintă situația curentă.

## Scop după rol

- `owner`, `admin`, `manager`: întreaga agenție;
- toate celelalte roluri: numai rândurile atribuite utilizatorului.

Funcția din baza de date validează din nou rolul. Un agent nu poate obține
valorile agenției trimițând manual `p_scope_all=true`.

## Definiții importante

- Timp de răspuns: diferența dintre `received_at` și primul dintre
  `first_response_at` / `last_contacted_at`, doar pentru valori cronologic valide.
- Ofertă și rezervare: leaduri distincte intrate în etapa respectivă în perioadă.
- Venit: intrări financiare înregistrate, neanulate, separate pe monedă.
- Comision estimat: comisionul tranzacțiilor încă nefinalizate, separat pe monedă.
- Conversie: ponderea cohortei de leaduri primite în perioadă care este acum
  finalizată/câștigată.
- Performanță portal: rata listărilor active dintre listările operaționale;
  cele deja retrase/expirate nu intră în numitor.

Sumele EUR și RON nu sunt adunate și nu se aplică un curs inventat.

## Instalare

Rulează `migrations/20260720_180_exact_dashboard_kpis.sql` după migrarea 170,
apoi publică aplicația. Rollbackul elimină numai funcția agregată.
