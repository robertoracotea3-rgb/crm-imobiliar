# Experiența mobilă CRM

CRM-ul folosește patru acțiuni principale în bara de jos:

- Dashboard;
- Proprietăți;
- Clienți;
- Vizionări.

Butonul **Mai mult** deschide toate celelalte module permise rolului curent,
inclusiv Particulari, Portaluri, Echipă, Notificări, Setări și Finanțe. Logoutul
este în același panou. Niciun modul nu este eliminat doar din cauza lățimii
ecranului.

## Reguli de interfață

- țintele esențiale au minimum 44 × 44 px;
- bara de jos și editorul proprietății respectă safe-area pe iPhone;
- formularele folosesc minimum 16 px pe mobil pentru a evita zoomul Safari;
- modalele devin panouri mobile cu înălțime maximă `100dvh`;
- grilele formularelor se restrâng la una sau două coloane;
- listările Storia devin carduri, cu detalii secundare expandabile;
- matricile late de permisiuni rămân tabele cu scroll controlat și prima
  coloană fixată;
- mișcările sunt reduse când sistemul utilizatorului cere acest lucru.

## Matrice de verificare

Dimensiunile obligatorii sunt 320, 375, 390 și 768 px. Pentru fiecare trebuie
verificate:

1. lipsa overflowului orizontal al paginii;
2. accesul la toate modulele permise;
3. deschiderea și închiderea meniului Mai mult;
4. formularele, selecturile, datele și orele;
5. modalele lungi și butoanele lor finale;
6. cardurile/listările și zonele cu scroll controlat;
7. editorul proprietății deasupra barei de navigație.

În auditul local automat din 2026-07-23, paginile Login, Înregistrare și
Recuperare parolă au trecut toate cele patru lățimi fără overflow și fără
controale vizibile sub 40 px. Paginile autentificate trebuie reverificate în
staging cu rolurile owner, agent și viewer înainte de deploy.
