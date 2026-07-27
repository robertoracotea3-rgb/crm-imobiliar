# Configurarea e-mailului Kira Imobiliare

## Stare cunoscută — verificată la 27 iulie 2026

- Site-ul public afișează `contact@kiraimobiliare.ro`.
- Domeniul folosește în prezent serverele MX Zoho EU.
- SPF-ul public este `v=spf1 include:zoho.eu ~all`.
- DMARC există în mod de monitorizare, cu politica `p=none`.
- Existența căsuțelor `documente@kiraimobiliare.ro` și
  `rapoarte@kiraimobiliare.ro` nu este confirmată.
- CRM-ul trimite prin Resend, separat de găzduirea căsuțelor Zoho. Domeniul
  Resend, cheia API și înregistrările DKIM cerute de Resend nu sunt confirmate.
- CRM-ul nu consideră o adresă funcțională numai pentru că un furnizor a
  acceptat trimiterea. Este necesară confirmarea manuală a mesajului în inbox.

## Pași la furnizorul domeniului/e-mailului

1. Identifică platforma care administrează zona DNS pentru
   `kiraimobiliare.ro` și contul care administrează căsuțele poștale.
2. Creează căsuțele `documente@kiraimobiliare.ro` și
   `rapoarte@kiraimobiliare.ro`, sau aliasuri către o căsuță administrativă
   existentă și verificată.
3. Activează autentificarea în doi pași pentru toate conturile administrative.
4. Adaugă domeniul `kiraimobiliare.ro` în Resend.
5. Publică în DNS exact înregistrările SPF și DKIM furnizate de Resend. Nu
   inventa și nu copia valori din alt domeniu.
6. Verifică să existe o singură politică SPF coerentă. Dacă există deja SPF,
   combină furnizorii în aceeași înregistrare în loc să creezi două înregistrări
   SPF concurente.
7. Publică DMARC după ce adresa care primește rapoartele DMARC există. Începe cu
   o politică de monitorizare, analizează rapoartele, apoi crește gradual
   protecția la `quarantine` și `reject`.
8. Așteaptă propagarea DNS și verifică domeniul în Resend.

## Pași în mediul CRM

1. Adaugă secretul `RESEND_API_KEY` în mediul serverului. Nu îl adăuga
   cu prefixul `NEXT_PUBLIC_`.
2. Rulează migrarea `20260724_290_agency_email_delivery.sql`.
3. Deschide **Setări → E-mail**.
4. Salvează adresele oficiale și numele expeditorului.
5. Apasă **Verifică domeniul**. Starea trebuie să devină `Verificat`.
6. Trimite separat un test la adresa de documente și la adresa de rapoarte.
7. Verifică manual inboxul, inclusiv folderul Spam, și confirmă primirea din
   CRM numai după ce mesajul este vizibil.
8. Verifică jurnalul: trebuie să existe ID-ul furnizorului și statusul
   `accepted`. Confirmarea manuală a inboxului trebuie să apară separat.

## Criteriu pentru trimiterea automată

Rapoartele automate pot fi trimise numai dacă:

- domeniul are status `verified`;
- adresele de documente și rapoarte au fiecare un test acceptat în ultimele
  24 de ore și primirea a fost confirmată manual;
- configurația agenției are statusul căsuțelor `verified`;
- cheia furnizorului este prezentă numai pe server.

Până atunci, rapoartele rămân disponibile în CRM și trimiterea prin e-mail este
blocată explicit.

## Rollback

Rulează `20260724_290_agency_email_delivery.rollback.sql`. Rollback-ul revocă
accesul utilizatorilor și păstrează tabelele și dovezile de livrare, marcate ca
retrase, pentru a evita pierderea jurnalului operațional.
