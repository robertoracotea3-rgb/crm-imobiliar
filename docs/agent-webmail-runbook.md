# E-mail personal pentru agenții Kira

## Arhitectură simplificată

Resend este singurul furnizor extern:

- trimite e-mailurile agenților prin API;
- primește orice adresă `*@kiraimobiliare.ro`;
- notifică CRM-ul printr-un webhook semnat;
- furnizează conținutul și atașamentele primite prin API;
- transmite stările reale: trimis, livrat, întârziat, respins sau eșuat.

DNS-ul rămâne administrat în Vercel. Nu sunt necesare Cloudflare, un Worker
separat sau SMTP2GO.

## Comportamentul în CRM

- fiecare agent își alege o singură dată adresa personală;
- alegerea rămâne legată permanent de cont;
- agentul vede numai căsuța sa;
- rolurile cu `mail.manage_all` pot selecta și căsuțele agenției;
- sunt disponibile Inbox, Trimise, Arhivă, Coș, răspunsuri și atașamente;
- mesajele sunt asociate automat cu un contact, lead și proprietate cunoscute;
- adresele cu tag de forma
  `agent+p-UUID_PROPRIETATE@kiraimobiliare.ro` asociază proprietatea direct;
- webhookurile duplicate nu creează mesaje duplicate.

## Configurare o singură dată

1. Creează un cont Resend și o cheie API cu permisiune de trimitere.
2. Adaugă domeniul `kiraimobiliare.ro` cu ambele capabilități:
   `sending=enabled` și `receiving=enabled`.
3. Publică în Vercel DNS exact înregistrările returnate de Resend.
4. După verificarea sending, înlocuiește MX-urile vechi Zoho pentru domeniul
   principal numai cu MX-ul Resend pentru receiving.
5. Creează un webhook:
   `https://crm.kiraimobiliare.ro/api/mail/provider-events`.
6. Selectează evenimentele:
   `email.received`, `email.sent`, `email.delivered`, `email.bounced`,
   `email.failed` și `email.delivery_delayed`.
7. Salvează în Vercel Production și Preview, separat:
   - `RESEND_API_KEY`;
   - `RESEND_WEBHOOK_SECRET`;
   - `MAIL_ONBOARDING_ENABLED=false`.
8. Redeploy și testează trimiterea și primirea cu o căsuță controlată.
9. Abia după testul cap-coadă setează `MAIL_ONBOARDING_ENABLED=true` și redeploy.

## Reguli de securitate

- cheia API și secretul webhookului nu folosesc niciodată prefixul
  `NEXT_PUBLIC_`;
- semnătura Svix se verifică pe corpul brut al cererii;
- evenimentele nesemnate primesc `401`;
- conținutul complet este obținut numai din API-ul Resend autentificat;
- URL-urile atașamentelor trebuie să fie HTTPS și găzduite de Resend;
- sunt acceptate numai PDF, JPG, PNG, WebP și text, maximum 4 MB/fișier;
- atașamentele sunt mutate în bucketul privat Supabase și servite prin URL
  semnat cu expirare;
- cheile nu intră în Git, capturi de ecran sau documentație.

## Test minim înainte de activare

- un agent poate revendica o adresă o singură dată;
- alt agent nu poate vedea mesajele lui;
- o adresă existentă nu poate fi revendicată de alt cont;
- un mesaj extern apare în mai puțin de două minute;
- răspunsul din CRM trece din `Acceptat` în `Livrat`;
- un destinatar invalid produce `Respins` sau `Trimitere eșuată`;
- webhookul repetat nu dublează mesajul;
- proprietatea asociată se deschide direct din mesaj;
- atașamentele nepermise sau prea mari sunt puse în carantină;
- dezactivarea cheii Resend nu blochează loginul cât timp onboarding-ul este
  `false`.

## Rollback

Se setează `MAIL_ONBOARDING_ENABLED=false`, se revine la deploymentul anterior
și se dezactivează webhookul/MX-ul Resend. Tabelele și mesajele rămân păstrate
pentru recuperare.

Surse:

- https://resend.com/pricing/
- https://resend.com/docs/api-reference/domains/create-domain
- https://resend.com/docs/dashboard/receiving/introduction
- https://resend.com/docs/api-reference/emails/retrieve-received-email
- https://resend.com/docs/api-reference/emails/list-received-email-attachments
- https://resend.com/docs/webhooks/verify-webhooks-requests
