# Jurnalul de audit CRM

Jurnalul din `crm_audit_log` este separat de activitățile comerciale și de
`security_events`. El este destinat acțiunilor sensibile și probelor
operaționale, nu comentariilor uzuale ale agenților.

## Ce se înregistrează

- autentificări reușite, eșuate și deconectări;
- creare/dezactivare cont, schimbare rol, permisiuni sau date de acces;
- consultarea datelor sensibile ale clienților;
- unire și restaurare de profiluri;
- arhivări și realocări de agent;
- creare, modificare, comision, finalizare și arhivare tranzacție;
- exporturi și administrarea tokenurilor de feed;
- procesarea și reîncercarea retragerilor din portal;
- accesul la jurnal și refuzurile de autorizare.

Evenimentele conțin agenția, actorul, rolul, acțiunea, entitatea, rezultatul,
motivul, ruta, user-agentul și numai valorile de business aprobate.

## Protecția datelor

Parolele, tokenurile, cookie-urile, antetele de autorizare, cheile API și
secretele sunt eliminate atât în aplicație, cât și în funcția PostgreSQL.
Adresele IP nu sunt păstrate în clar. Dacă `AUDIT_IP_HASH_SALT` are minimum
16 caractere aleatoare, se salvează numai un hash SHA-256 ireversibil.

Nu adăuga în evenimente CNP-uri, adrese, mesaje private sau documente. Pentru
accesul la date sensibile se păstrează tipul operației și lista câmpurilor, nu
o copie a valorilor.

## Imuabilitate și verificare

Aplicația nu primește drept de `INSERT`, `UPDATE` sau `DELETE` direct pe tabel.
Scrierea se face numai prin `crm_append_audit_event`, disponibilă rolului
server-side. Un trigger respinge orice modificare sau ștergere.

Evenimentele fiecărei agenții formează un lanț SHA-256 ordonat printr-o secvență
monotonă. `crm_verify_audit_chain(agency_id)` confirmă lanțul și indică primul
eveniment invalid. Pagina `/audit` rulează verificarea la fiecare încărcare.

Un administrator al bazei poate în continuare elimina protecții sau rescrie
date. De aceea, jurnalul trebuie inclus în backupuri externe protejate și în
verificările din Faza 24.

## Deploy și rollback

1. configurează `AUDIT_IP_HASH_SALT` în staging și producție;
2. aplică `migrations/20260720_190_immutable_audit_log.sql` după backup;
3. rulează `npm run test:db` și `npm run test:e2e`;
4. verifică autentificarea și pagina `/audit` cu un cont owner/admin;
5. aplică în producție numai după raportul final și aprobarea explicită.

Rollbackul `20260720_190_immutable_audit_log.rollback.sql` revocă accesul
aplicației, dar păstrează tabelul, evenimentele și protecția împotriva
modificării. Reaplicarea migrației reactivează accesul fără a schimba istoricul.
