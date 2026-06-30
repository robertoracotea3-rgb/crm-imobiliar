# CRM KIRA IMOBILIARE — Progres implementare

**Ultima actualizare:** 2026-06-23  
**Deploy live:** https://crm.fortisfagaras.ro  
**Stack:** Next.js 16 (App Router) + Supabase PostgreSQL + Tailwind v4 + Vercel

---

## ✅ Funcționalități complet implementate

### Core CRM
- [x] **Autentificare** — login, register, logout, sesiune persistentă
- [x] **Multi-tenant** — izolare completă prin `agency_id` în toate interogările
- [x] **RBAC** — roluri: `owner`, `admin`, `agent`; protecție rute Finance/Portals/Team/Settings
- [x] **Dashboard** — KPI-uri, activitate recentă, widget taskuri scadente
- [x] **Proprietăți** — CRUD complet, upload poze, hartă (MapPicker + vizualizare), AI assistant
- [x] **Contacte** — CRUD, căutare
- [x] **Cereri & potriviri** — cereri clienți, matching automat cu proprietăți
- [x] **Lead-uri** — pipeline Kanban drag & drop, wait time formatat (59m / 2h 30m / 1z 5h)
- [x] **Vizionări** — programare, status, outcome, integrare calendar
- [x] **Calendar** — evenimente, vizionări, remindere
- [x] **Taskuri** — creare, prioritate (mică/medie/mare), dată limită, atribuire agent, widget dashboard
- [x] **Documente proprietăți** — upload per categorie (PDF/JPG/PNG max 15MB), download signed URL, ștergere
- [x] **Istoric modificări** — activity_logs pe proprietăți (cine, când, ce câmp, valoare veche→nouă)
- [x] **Notificări** — sistem în-app, badge count, marcare citit
- [x] **Portaluri** — integrare Storia (OAuth, publish, unpublish, webhook, status sync)
- [x] **Echipă** — membri, stats, activitate
- [x] **Finanțe** — dashboard comisioane calculate din proprietăți vândute/închiriate
- [x] **Setări** — profil agenție, watermark fotografii
- [x] **Căutare AI** — natural language → filtre structurate (Claude Haiku)
- [x] **SEO site public** — titlu_seo/meta_desc din CRM → site fortisfagaras.ro

---

## ✅ Property Intelligence — Implementat complet

### Backend
- [x] **12 tabele DB** — migration SQL gata (`migrations/pi-property-intelligence.sql`)
- [x] **2 adaptoare** — OlxAdapter (JSON API), Publi24Adapter (HTML scraping)
- [x] **Plugin registry** — `lib/pi-adapters/index.ts` cu factory `createAdapter()`
- [x] **Dedup engine** — telefon > email > adresă > GPS > similaritate text (Levenshtein)
- [x] **Classifier proprietar** — scoring 0-100, 5 niveluri (PARTICULAR → AGENȚIE)
- [x] **Import worker** — `runImportJob()` async non-blocking, loguri detaliate
- [x] **9 endpoint-uri API** — toate operațiunile PI (detalii mai jos)

### Frontend
- [x] **Pagina principală** — `/property-intelligence`
- [x] **Admin panel** — `/property-intelligence/admin`
- [x] **Card listing** — `PIListingCard` cu badge owner type, favorite, sursă
- [x] **Modal detaliu** — `PIListingDetail` cu galerie, 3 tab-uri, import 1-click
- [x] **Filtre salvate** — sidebar cu stele, notificări în timp real
- [x] **Link sidebar** — "Prop. Intelligence" vizibil tuturor rolurilor

---

## ⚠️ Pași manuali necesari

### OBLIGATORIU — Migrare DB Supabase
```
Supabase Dashboard → SQL Editor → paste migrations/pi-property-intelligence.sql → Run
```
Fără această migrare, toate API-urile PI returnează eroare 500 "relation does not exist".

### Migrare anterioare (dacă nu au fost rulate)
```
migrations/2026-features.sql → taskuri, documente, vizionări, activity_logs
```
