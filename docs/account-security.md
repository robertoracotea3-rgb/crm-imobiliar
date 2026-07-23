# Securitatea conturilor Kira CRM

## Politica aplicată

- Owner și admin trebuie să folosească TOTP 2FA și o sesiune `aal2`.
- Un utilizator care activează voluntar 2FA trebuie apoi să intre tot cu `aal2`.
- Orice parolă temporară setată de administrator se schimbă la următoarea autentificare.
- Contul intern `TEST` este marcat de migrare pentru schimbarea obligatorie a parolei.
- Cinci parole greșite blochează temporar contul; limita pe IP este 30.
- Fereastra și blocarea sunt de 15 minute și sunt persistente în PostgreSQL.
- Sesiunea CRM are maximum 12 ore și expiră după 30 minute fără activitate.
- Loginul normal închide numai sesiunea curentă; utilizatorul poate revoca celelalte
  sesiuni sau toate dispozitivele din Setări → Securitate.

Identificatorii de login și IP-urile nu sunt stocate în clar în limitator. Sunt normalizate
și transformate cu SHA-256 plus `AUTH_SECURITY_HASH_SALT`. Parolele și codurile TOTP nu
intră în audit, în tabelele CRM sau în loguri.

## Fluxuri

### Autentificare

Browserul trimite numele și parola la `/api/auth/login`. Serverul verifică limita
persistentă, cere autentificarea Supabase, verifică profilul activ, înregistrează sesiunea
după claimul oficial `session_id` și întoarce tokenurile doar cu `Cache-Control: no-store`.
Un owner/admin este redirecționat către configurarea sau verificarea 2FA înainte de acces.
Un token creat direct în afara acestui flux nu este înscris în registrul Kira și este
respins de API și politicile RLS.

### 2FA

Pagina `/auth/mfa` folosește API-urile oficiale Supabase `enroll`, `challenge`, `verify`
și `listFactors`. După verificare, JWT-ul trece de la AAL1 la AAL2. API-ul și politicile
RLS restrictive verifică nivelul, sesiunea activă și existența factorului verificat.

În Supabase Dashboard verifică înainte de deploy:

1. Authentication → Multi-Factor Authentication;
2. TOTP enrollment, challenge și verification trebuie să fie activate;
3. JWT expiry recomandat: 1 oră, nu peste 1 oră;
4. redirecturile de autentificare trebuie să conțină numai domeniile CRM aprobate.

### Parolă și cont dezactivat

Un utilizator autentificat își schimbă parola din `/auth/schimba-parola`. Serverul acceptă
12–128 caractere și minimum trei grupe de caractere, verifică din nou parola curentă,
revocă toate sesiunile și cere o autentificare nouă. Când un administrator resetează parola altui membru, contul primește
`force_password_change=true`.

Adresa Auth `utilizator@fortis.crm` este un identificator tehnic, nu un inbox. Ea nu se
schimbă din profil și nu primește linkuri de resetare. Username-ul și starea contului se
modifică numai din Echipă de către un rol cu `manage_permissions`; numai owner poate
modifica sau dezactiva alt owner. E-mailul real de contact rămâne metadată separată.

### Invitații și codul de acces

CRM-ul nu trimite invitații prin e-mail către adresele tehnice `@fortis.crm`. Un owner sau
admin creează membrul din Echipă cu o parolă temporară puternică, iar noul utilizator este
obligat să o schimbe la prima autentificare. Dezactivarea contului revocă sesiunile active.

Înregistrarea publică a unei agenții este un flux separat. Ea funcționează numai dacă
`REGISTRATION_ACCESS_CODE` este configurat pe server, compară codul în timp constant și
limitează persistent încercările pe IP. Codul nu este salvat în baza de date, audit sau
loguri. Dacă profilul nu poate fi creat, utilizatorul Auth și agenția parțial creată sunt
șterse, astfel încât fluxul poate fi reluat fără înregistrări orfane.

## Migrare și rollback

Aplicare în staging, după backup:

```text
migrations/20260723_200_account_security.sql
```

Rollback:

```text
migrations/20260723_200_account_security.rollback.sql
```

Rollbackul elimină funcțiile și politicile restrictive, dar păstrează registrul sesiunilor,
limitările și coloanele de audit. Astfel nu se șterge istoricul de securitate.

Deployul aplicației și migrarea trebuie făcute în aceeași fereastră. Migrarea va invalida
practic accesul sesiunilor care nu sunt încă în registrul CRM; utilizatorii se autentifică
din nou. Nu aplica migrarea singură cu mult înaintea aplicației.

## Verificare manuală obligatorie

1. Login greșit de cinci ori pe cont sintetic → răspuns 429 cu `Retry-After`.
2. Owner fără factor → redirecționare la QR, fără acces la dashboard/API/Storage.
3. Cod TOTP greșit → acces refuzat; cod valid → AAL2 și dashboard.
4. Agent fără factor → acces AAL1 normal.
5. Parolă temporară → numai pagina de schimbare; după schimbare, celelalte sesiuni dispar.
6. Cont inactiv → parola poate fi corectă, dar CRM refuză accesul generic.
7. „Deconectează celelalte dispozitive” păstrează sesiunea curentă.
8. „Deconectează toate dispozitivele” revocă și sesiunea curentă.
9. Verifică jurnalul pentru login reușit/eșuat, 2FA, parolă și revocări.

Referințe oficiale:

- [Supabase MFA TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp)
- [Supabase MFA și AAL/RLS](https://supabase.com/docs/guides/auth/auth-mfa)
- [Supabase User Sessions](https://supabase.com/docs/guides/auth/sessions)
- [Supabase Sign Out scopes](https://supabase.com/docs/reference/javascript/auth-signout)
