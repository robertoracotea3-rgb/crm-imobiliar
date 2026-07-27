# E-mail personal pentru agenții Kira

## Rezultat

Fiecare utilizator cu permisiunea `mail.create` își alege o singură dată adresa
personală `nume@kiraimobiliare.ro`. Alegerea este legată permanent de cont.
Agentul vede în CRM numai căsuța sa. Rolurile cu `mail.manage_all` pot selecta
și căsuțele agenției.

CRM-ul include:

- Inbox, Trimise, Arhivă și Coș;
- compunere și răspuns;
- necitit/citit și contor în meniul principal;
- atașamente primite, private și descărcate prin URL semnat cu expirare;
- asocierea automată cu un contact, lead și proprietate cunoscute;
- linkuri directe din mesaj către contact, lead și proprietate;
- starea reală `acceptat`, `livrat`, `eșuat` sau `respins`;
- audit pentru alegerea adresei, trimitere și schimbarea stării de livrare.

## Componente

- Vercel găzduiește CRM-ul și API-urile.
- Supabase păstrează căsuțele, mesajele, atașamentele și politicile RLS.
- Cloudflare Email Routing primește gratuit mesajele și Worker-ul din
  `ops/cloudflare-email-worker` le transferă autentificat către CRM.
- SMTP2GO trimite mesajele. Planul Free are limită de 1.000 de e-mailuri/lună
  și 200/zi.

Cloudflare Email Routing cere ca DNS-ul domeniului să fie administrat în
Cloudflare. Mutarea nameserverelor se face numai într-o fereastră controlată,
după importul și verificarea tuturor înregistrărilor existente pentru site.

## Ordinea sigură de activare

1. Creează un backup Production verificat înainte de migrare.
2. Aplică `migrations/20260727_350_agent_webmail.sql` în staging.
3. Publică aplicația în Preview cu `MAIL_ONBOARDING_ENABLED=false`.
4. Testează alegerea adresei, trimiterea, primirea, atașamentele, izolarea între
   doi agenți și stările de livrare.
5. Creează un cont Cloudflare și adaugă `kiraimobiliare.ro`, fără a schimba încă
   nameserverele.
6. Verifică importul DNS: site, `www`, `crm`, TXT-urile de verificare, SPF,
   DKIM și DMARC. Nu publica două înregistrări SPF separate; combină
   autorizările într-un singur SPF.
7. Schimbă nameserverele la registrar și confirmă că site-ul și CRM-ul răspund
   înainte de activarea e-mailului.
8. În Cloudflare Email Routing activează domeniul, apoi o regulă catch-all cu
   acțiunea `Send to a Worker`, către Worker-ul Kira.
9. În SMTP2GO verifică domeniul de expeditor și publică exact DKIM/SPF cerute de
   furnizor. Creează o cheie API limitată la `/email/send`.
10. Configurează webhook-ul SMTP2GO ca JSON pentru evenimentele `processed`,
    `delivered`, `bounce` și `reject`, cu:
    - URL: `https://crm.kiraimobiliare.ro/api/mail/provider-events`
    - Authorization: Bearer cu valoarea `MAIL_DELIVERY_WEBHOOK_SECRET`
11. Testează din exterior către o adresă de staging și răspunde din CRM.
12. Aplică migrarea în Production și publică aceeași versiune verificată.
13. Abia după testul cap-coadă setează `MAIL_ONBOARDING_ENABLED=true` în
    Production. Următorul login va cere agenților alegerea adresei.

## Secrete

În Vercel Preview și Production, separat:

- `SMTP2GO_API_KEY`
- `MAIL_INBOUND_SECRET` — minimum 32 de caractere aleatoare
- `MAIL_DELIVERY_WEBHOOK_SECRET` — minimum 32 de caractere aleatoare, diferit
  de secretul inbound
- `MAIL_ONBOARDING_ENABLED`

În Worker-ul Cloudflare:

- variabilă `CRM_INBOUND_URL=https://crm.kiraimobiliare.ro`
- secret `MAIL_INBOUND_SECRET`, identic cu valoarea din mediul Vercel țintă

Niciun secret nu intră într-o variabilă `NEXT_PUBLIC_*`, în Git, în capturi de
ecran sau în documentație.

## Comenzi Worker

Din `ops/cloudflare-email-worker`:

```powershell
npm install
npm run check
npx wrangler login
npx wrangler secret put MAIL_INBOUND_SECRET
npx wrangler deploy
```

`CRM_INBOUND_URL` se configurează ca variabilă ne-secretă în Worker. Asocierea
regulii Email Routing cu Worker-ul se face numai după verificarea DNS.

## Test minim înainte de activare

- adresa `roberto@kiraimobiliare.ro` poate fi revendicată o singură dată;
- alt cont nu poate vedea mesajele lui Roberto;
- o adresă deja revendicată nu poate fi aleasă de alt agent;
- un e-mail extern apare în mai puțin de două minute;
- un răspuns apare ca `Acceptat pentru livrare`, apoi `Livrat`;
- un destinatar invalid produce `Respins` sau `Trimitere eșuată`;
- o proprietate asociată poate fi deschisă direct din mesaj;
- atașamentele nepermise sau prea mari sunt marcate indisponibile;
- dezactivarea Worker-ului sau a SMTP2GO nu marchează fals mesajele drept
  livrate și nu blochează autentificarea cât timp onboarding-ul este `false`.

## Rollback

Înainte ca agenții să revendice adrese, se poate rula
`migrations/20260727_350_agent_webmail.rollback.sql`.

După ce există mesaje reale, nu se rulează rollback distructiv. Se setează
`MAIL_ONBOARDING_ENABLED=false`, se dezactivează regula Email Routing și se
revine la deploymentul Vercel anterior, păstrând tabelele pentru recuperare.

Surse tehnice:

- https://developers.cloudflare.com/email-service/get-started/route-emails/
- https://developers.cloudflare.com/email-service/api/route-emails/email-handler/
- https://developers.smtp2go.com/docs/send-an-email
- https://developers.smtp2go.com/docs/webhooks-overview
- https://support.smtp2go.com/hc/en-gb/articles/223087947-Free-Plan
