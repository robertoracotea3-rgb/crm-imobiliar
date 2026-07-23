# Backup, restaurare și recuperare Kira CRM

## Statut și obiective

Backupul este considerat valid numai dacă arhiva criptată poate fi decriptată, toate
hashurile din manifest corespund și restaurarea trece într-o bază separată.

Obiectivele operaționale sunt:

- **RPO: maximum 6 ore** — în cel mai rău caz se pot pierde schimbările făcute după
  ultimul backup reușit;
- **RTO: maximum 4 ore** — ținta pentru readucerea CRM-ului într-un proiect nou,
  verificarea datelor și schimbarea controlată a traficului;
- **frecvență:** backup complet la fiecare 6 ore;
- **test de restaurare:** lunar și după orice schimbare a procedurii sau infrastructurii.

Supabase recomandă proiectelor Free să exporte regulat datele și să păstreze copii în
afara platformei. Backupurile bazei nu includ conținutul obiectelor din Storage, ci doar
metadatele. Din acest motiv, soluția Kira descarcă și criptează separat toate obiectele
Storage în aceeași arhivă logică.

## Ce conține

Fiecare fișier `kira-backup-*.kira` conține:

1. dump complet PostgreSQL în format custom;
2. toate bucketurile și obiectele Supabase Storage;
3. inventarul conturilor Auth pentru verificare;
4. manifest cu dimensiunea și SHA-256 pentru fiecare fișier;
5. identificatorul sursei, folosit pentru a bloca restaurarea peste aceeași bază.

Arhiva folosește AES-256-GCM. Antetul este autentificat, iar cheia nu este inclusă în
backup sau în fișierul `.meta.json`. Fișierele intermediare necriptate sunt șterse chiar
dacă operația eșuează. Ele sunt create numai în directorul temporar al sistemului, nu pe
volumul sincronizat; fișierul final `.kira` apare numai după verificarea criptografică.

## Retenție și amplasare

Politica automată păstrează:

- toate copiile din ultimele 14 zile;
- cea mai nouă copie din fiecare săptămână până la 90 de zile;
- cea mai nouă copie din fiecare lună până la 365 de zile.

Directorul trebuie să fie în afara proiectului și a repository-ului. Amplasarea recomandată
este un volum criptat sincronizat către un furnizor separat. Păstrează încă o copie
offline sau la al doilea furnizor. Cheia de criptare se păstrează în managerul de parole,
separat de arhive. Pierderea cheii face backupurile imposibil de restaurat.

## Responsabilitate

| Acțiune | Responsabil principal | Înlocuitor | Dovadă |
| --- | --- | --- | --- |
| Verificarea zilnică a ultimului backup | Administratorul Kira | Administrator tehnic desemnat | data arhivei și `backup-run.log` |
| Remedierea unui backup eșuat | Administrator tehnic desemnat | proprietarul agenției | arhivă nouă verificată |
| Testul lunar de restaurare | Administrator tehnic desemnat | al doilea operator autorizat | proces-verbal cu durată și rezultat |
| Aprobarea recuperării după incident | proprietarul agenției | persoana delegată în scris | aprobare și momentul de recuperare |

Numele persoanelor desemnate și datele lor de contact trebuie păstrate în registrul intern
al agenției, nu în repository.

## Configurare inițială pe Windows

Cerințe: Node.js, Docker Desktop pornit, acces PostgreSQL la proiectul Supabase și un
director extern/sincronizat.

1. Generează o cheie o singură dată:

   ```powershell
   $bytes = New-Object byte[] 32
   [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
   [Convert]::ToBase64String($bytes)
   ```

2. Salvează rezultatul în managerul de parole și în `.env.local`:

   ```text
   BACKUP_ENCRYPTION_KEY=<cheia-base64>
   BACKUP_DIRECTORY=D:\Kira-Backups
   SUPABASE_DB_URL=<connection-string-din-Supabase-Connect>
   KIRA_PG_TOOLS_IMAGE=postgres:17-alpine
   ```

3. `.env.local` trebuie să conțină și `NEXT_PUBLIC_SUPABASE_URL` și
   `SUPABASE_SERVICE_ROLE_KEY`, necesare pentru Auth și Storage. Nu copia valorile în
   conversații, capturi, taskuri Windows sau loguri.

4. Pregătește o singură dată instrumentele PostgreSQL:

   ```powershell
   docker pull postgres:17-alpine
   ```

5. Rulează primul backup manual:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\ops\run-backup.ps1 `
     -ProjectPath "$PWD" `
     -BackupDirectory "D:\Kira-Backups"
   ```

6. Verifică existența fișierelor `.kira` și `.meta.json`, apoi execută testul izolat:

   ```powershell
   npm run test:backup
   ```

7. Abia după reușita pașilor anteriori, programează backupul:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\ops\register-backup-task.ps1 `
     -ProjectPath "$PWD" `
     -BackupDirectory "D:\Kira-Backups" `
     -IntervalHours 6
   ```

Taskul rulează cu utilizatorul Windows curent și nu include secrete în definiția sa.
Executările suprapuse sunt blocate.
În forma aceasta utilizatorul trebuie să fie autentificat. Pentru un server permanent,
folosește un cont tehnic dedicat, cu drept minim, și configurează parola prin mecanismul
securizat al Task Scheduler.

## Restaurare obligatoriu izolată

Nu restaura direct peste producție. Creează un proiect Supabase nou sau o bază PostgreSQL
separată. Într-un proiect Supabase nou activează mai întâi extensiile folosite de proiectul
sursă. Documentația Supabase recomandă restaurarea într-un proiect nou și reactivarea
publicațiilor Realtime după restaurare.

Pentru proba locală automată:

```powershell
npm run test:backup
```

Testul creează două baze Docker temporare, face backup, restaurează în a doua bază,
verifică tabelul și view-ul, respinge o arhivă coruptă și șterge bazele temporare.

Pentru un proiect Supabase izolat, setează variabilele numai în sesiunea curentă:

```powershell
$env:BACKUP_ENCRYPTION_KEY = '<cheia-din-managerul-de-parole>'
$env:RESTORE_TARGET_DATABASE_URL = '<connection-string-proiect-nou>'
$env:RESTORE_TARGET_SUPABASE_URL = 'https://<proiect-nou>.supabase.co'
$env:RESTORE_TARGET_SUPABASE_SERVICE_ROLE_KEY = '<service-role-proiect-nou>'

npm run backup:restore -- `
  --archive="D:\Kira-Backups\kira-backup-AAAA-LL-ZZThh-mm-ss-sssZ.kira" `
  --confirm-isolated `
  --restore-storage
```

Scriptul:

1. autentifică și decriptează arhiva;
2. blochează căile nesigure și verifică fiecare hash;
3. refuză o destinație cu aceeași amprentă ca sursa;
4. restaurează dumpul cu `--exit-on-error`;
5. creează bucketurile lipsă și încarcă obiectele fără suprascriere;
6. afișează `RESTORE_OK=1` numai după finalizare.

După restaurare verifică manual autentificarea, numărul agenților, proprietăților,
clienților și tranzacțiilor, deschiderea fotografiilor/documentelor, politicile RLS,
publicațiile Realtime și integrările. Parolele rolurilor PostgreSQL personalizate nu sunt
incluse de backupurile standard Supabase și trebuie resetate.

## Monitorizare și incident

În fiecare zi:

1. confirmă că cea mai nouă arhivă are mai puțin de 6 ore;
2. caută erori în `backup-run.log`;
3. confirmă sincronizarea copiei externe;
4. dacă lipsește o copie, rulează manual backupul și investighează taskul.

În fiecare lună:

1. alege o arhivă reală;
2. restaureaz-o într-un proiect/bază complet separată;
3. execută verificările funcționale;
4. notează timpul total și confirmă dacă RTO de 4 ore a fost respectat;
5. șterge sigur mediul temporar după aprobarea rezultatului.

Într-un incident, oprește mai întâi scrierile, păstrează dovezile, stabilește momentul
de recuperare conform RPO, restaurează într-un proiect nou, validează și schimbă traficul
numai după aprobarea proprietarului agenției.

## Documentație oficială de referință

- [Supabase — Database Backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase — Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
