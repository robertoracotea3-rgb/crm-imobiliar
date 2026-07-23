# Securitate și excepții controlate

Ultima verificare: 23 iulie 2026.

## Dependențe

- Next.js și `eslint-config-next` sunt fixate la aceeași versiune patch.
- `postcss` și `sharp` au override-uri explicite către primele versiuni fără vulnerabilitățile raportate de registrul npm.
- Orice actualizare a override-urilor trebuie urmată de `npm audit`, lint, TypeScript, teste și build.
- Nu se folosește `npm audit fix --force`: poate propune downgrade-uri sau schimbări incompatibile.
- La fiecare actualizare Next.js se verifică dacă override-urile mai sunt necesare; se elimină imediat ce Next.js include direct versiunile sigure.

## Content Security Policy

Pentru fiecare răspuns HTML, `proxy.ts` generează un nonce criptografic unic și îl transmite atât către rendererul Next.js, cât și către browser. În producție:

- `script-src` permite scripturile proprii numai cu nonce și `strict-dynamic`;
- `unsafe-inline` nu este permis pentru scripturi;
- `unsafe-eval` nu este permis;
- atributele JavaScript inline sunt blocate;
- obiectele, cadrele externe și schimbarea bazei URL sunt blocate;
- formularele pot trimite numai către aceeași origine.

`unsafe-eval` este permis exclusiv în dezvoltare, deoarece instrumentele React/Next.js îl folosesc pentru depanare.

### Excepție temporară: stiluri inline

`style-src 'unsafe-inline'` rămâne temporar necesar deoarece interfața conține încă stiluri React calculate dinamic și Leaflet este încărcat din stylesheet extern. Excepția nu se aplică scripturilor.

Plan de eliminare:

1. mutarea culorilor și dimensiunilor statice în clase CSS/Tailwind;
2. înlocuirea stilurilor dinamice cu variabile CSS controlate;
3. servirea locală a CSS și imaginilor Leaflet;
4. activarea unui `style-src` bazat numai pe nonce/hash;
5. verificare în mod report-only înainte de blocare.

Folosirea nonce-urilor face shell-ul CRM dinamic. Este o alegere intenționată pentru o aplicație privată care procesează date sensibile; impactul de performanță trebuie urmărit în staging.

## Secrete

Secretele sunt exclusiv server-side. Nu se loghează tokenuri, parole, chei Supabase service-role sau conținutul integral al credentialelor OAuth. Fișierele `.env.local`, backupurile și exporturile cu date personale nu se comit.

## Verificare înainte de deploy

```powershell
npm audit
npm run lint
npm test
npx tsc --noEmit
npm run build
```

În staging, se verifică în DevTools că răspunsul HTML are un nonce nou la fiecare cerere, că scripturile Next au același nonce și că nu apar încălcări CSP pentru funcțiile principale.
