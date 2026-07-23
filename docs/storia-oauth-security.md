# Storia OAuth: configurare și operare sigură

Implementarea urmează fluxul OAuth2 OLX RE Partner documentat la
`https://developer.olxgroup.com/docs/authorization-flow`.

## Garanții

- starea OAuth este aleatoare, expiră după 10 minute și poate fi consumată o singură dată;
- starea este legată server-side de utilizatorul autentificat, agenția și sesiunea care au inițiat conectarea;
- callback-ul nu acceptă `agency_id` sau `user_id` din URL și nu alege niciodată o agenție implicită;
- tokenurile sunt criptate AES-256-GCM, cu agenția, portalul și tipul tokenului ca date autentificate;
- tokenurile vechi în clar sunt criptate și șterse din coloanele vechi la prima utilizare;
- refresh-ul folosește un lock scurt, astfel încât două cereri simultane nu rotesc același refresh token;
- conectarea, reconectarea, criptarea datelor vechi, refresh-ul, erorile și revocarea au audit;
- deconectarea șterge local toate copiile tokenurilor. Documentația OLX nu publică un endpoint separat de revocare remote.

## Variabile obligatorii

- `STORIA_CLIENT_ID`
- `STORIA_CLIENT_SECRET`
- `STORIA_API_KEY`
- `STORIA_WEBHOOK_SECRET`
- `PORTAL_TOKEN_ENCRYPTION_KEY`
- `NEXT_PUBLIC_APP_URL`

`PORTAL_TOKEN_ENCRYPTION_KEY` trebuie să conțină exact 32 bytes, codificați Base64
sau 64 de caractere hexazecimale. Cheia nu se salvează în Git, SQL, capturi sau
loguri și trebuie păstrată în același secret store ca `SUPABASE_SERVICE_ROLE_KEY`.

Generare compatibilă PowerShell:

```powershell
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$key = [Convert]::ToBase64String($bytes)
$rng.Dispose()
```

Valoarea din `$key` se adaugă direct ca secret de hosting. Nu se afișează și nu
se trimite prin chat.

## Ordine de deploy

1. backup restaurabil și test de restore;
2. configurarea `PORTAL_TOKEN_ENCRYPTION_KEY` în staging;
3. aplicarea `migrations/20260720_140_storia_oauth_security.sql` în staging;
4. deploy-ul aceleiași versiuni de aplicație în staging;
5. test conectare/deconectare/reconectare cu două agenții sintetice;
6. verificarea evenimentelor `portal_token_events` și a faptului că vechile
   coloane `access_token` și `refresh_token` sunt `NULL`;
7. repetarea controlată în producție numai după aprobarea raportului final.

Migrarea bazei și deploy-ul aplicației trebuie tratate ca o singură schimbare.
Aplicația nouă refuză conectarea dacă cheia lipsește. Versiunea veche nu poate
folosi tokenurile după ce acestea au fost criptate; un rollback de aplicație
necesită reconectarea Storia sau revenirea imediată la versiunea nouă.
