# Kira Imobiliare CRM

CRM privat multi-agenție pentru proprietăți, clienți, cereri, vizionări, pipeline, tranzacții, portaluri și automatizări. Aplicația folosește Next.js 16, React 19, TypeScript strict și Supabase/PostgreSQL.

## Pornire locală

Cerințe: Node.js 20.9 sau mai nou, npm și un proiect Supabase separat de producție.

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Aplicația locală este disponibilă la `http://localhost:3000`. Nu copia cheile de producție într-un mediu de test și nu comite fișierul `.env.local`.

## Verificări obligatorii

Înainte de orice commit sau deploy:

```powershell
npm run lint
npm test
npx tsc --noEmit
npm run build
npm audit
```

Rezultatul acceptat este: zero erori și avertismente lint, toate testele trecute, build reușit și zero vulnerabilități cunoscute.

## Variabile de mediu

Modelul complet, fără valori secrete, este în `.env.example`. Cheile `SUPABASE_SERVICE_ROLE_KEY`, `PORTAL_TOKEN_ENCRYPTION_KEY`, `STORIA_CLIENT_SECRET`, `STORIA_WEBHOOK_SECRET`, `FB_PAGE_TOKEN`, `ANTHROPIC_API_KEY` și `CRON_SECRET` sunt exclusiv server-side.

Nicio variabilă secretă nu trebuie prefixată cu `NEXT_PUBLIC_`, afișată în interfață sau scrisă în loguri.

## Bază de date și migrații

Migrațiile se află în `migrations/`, sunt numerotate și au rollback separat. Ordinea sigură este:

1. backup și audit al datelor;
2. aplicare într-o bază de test goală;
3. reaplicare pentru verificarea idempotentei;
4. rularea aserțiunilor SQL;
5. testarea rollback-ului;
6. deploy controlat;
7. aplicare în producție numai cu aprobare explicită.

Nu rula automat fișiere SQL în producție și nu folosi endpointuri HTTP pentru execuție SQL.

## Arhitectură pe scurt

- `app/` — pagini și endpointuri Next.js;
- `components/` — componente comune ale CRM-ului;
- `lib/server/` — autorizare, criptare și logică server-side;
- `migrations/` — schimbări PostgreSQL și rollback-uri;
- `tests/` — teste unitare, de integrare structurală și de securitate;
- `docs/` — definiții operaționale, runbook-uri și decizii de securitate.

Autorizarea este verificată pe server și din nou prin politicile bazei de date. Interfața ascunde acțiunile nepermise, dar nu este considerată o barieră de securitate.

## Securitate

CRM-ul este `noindex`, folosește headere de securitate, CSP cu nonce unic pentru scripturi, secrete criptate pentru portaluri și verificări tenant/rol pe endpointurile private. Detaliile, excepțiile CSP și politica dependențelor sunt în [docs/security.md](docs/security.md), iar jurnalul imuabil este descris în [docs/audit-log.md](docs/audit-log.md).

## Deploy

Deploy-ul trebuie făcut dintr-un commit verificat, cu variabilele de mediu configurate în platformă și cu o bază de staging separată. După deploy se verifică manual autentificarea, proprietățile, clienții, Storia, WhatsApp, vizionările, tranzacțiile, cronurile și panoul de sănătate.

Producția nu se modifică din această copie locală fără aprobare explicită și plan de revenire.

## Testarea fluxurilor CRM

Testele folosesc numai date sintetice și nu se conectează la baza de producție.

```powershell
# Reguli de business și integrarea modulelor
npm test

# Funcții și politici PostgreSQL într-o bază Docker temporară
npm run test:db

# Autentificare și flux operațional complet într-un browser real
npm run test:e2e

# Toate verificările de mai sus
npm run test:all
```

Testul PostgreSQL creează baza izolată `crmtest_automated`, aplică schema minimă și
migrațiile necesare, rulează scenariile, apoi șterge baza chiar dacă o verificare eșuează.
Scenariul din browser simulează serviciile externe și nu publică anunțuri, nu trimite mesaje
WhatsApp și nu creează clienți reali.

## Backup și recuperare

Backupul operațional include baza PostgreSQL, inventarul utilizatorilor și toate obiectele
Supabase Storage. Arhiva este criptată și autentificată înainte să fie acceptată, iar
fișierele temporare necriptate sunt șterse.

```powershell
# Backup manual (BACKUP_DIRECTORY poate fi omis dacă este în .env.local)
npm run backup:create -- --directory="D:\Kira-Backups"

# Test automat într-o bază Docker izolată
npm run test:backup
```

Procedura completă de configurare, programare, retenție și restaurare este în
[docs/backup-disaster-recovery.md](docs/backup-disaster-recovery.md). Nu restaura direct
peste producție.
