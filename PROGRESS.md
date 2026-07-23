# CRM KIRA IMOBILIARE — Progres implementare

**Ultima actualizare:** 2026-06-30  
**Deploy live:** https://crm.kiraimobiliare.ro  
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
- [x] **Notificări persistente** — inbox unic cu dashboardul, badge din cont, priorități, arhivare, paginare și alerte operaționale deduplicate
- [x] **Portaluri** — integrare Storia (OAuth, publish, unpublish, webhook, status sync) + publicare Facebook
- [x] **Echipă** — membri, stats, activitate
- [x] **Finanțe și tranzacții** — flux cu client și proprietate obligatorii, finalizare atomică, registru de comisioane și retrageri portal cu retry
- [x] **Setări** — profil agenție, watermark fotografii
- [x] **Căutare AI** — natural language → filtre structurate (Claude Haiku)
- [x] **Funcționalități AI** — analiză/îmbunătățire poze, generator descrieri SEO
- [x] **Operațiuni în masă** — mutare agent + publicare în masă, pin automat hartă
- [x] **SEO site public** — titlu_seo/meta_desc din CRM → site kiraimobiliare.ro

---

## ⚠️ Pași manuali necesari

### Migrări DB Supabase (dacă nu au fost rulate)
```
Supabase Dashboard → SQL Editor → rulează fișierele din migrations/:
  - migrations/2026-features.sql   → taskuri, documente, vizionări, activity_logs
  - migrations/2026-storia.sql     → tabele integrare Storia
```

---

## 📝 Note

- **Property Intelligence** (modul de agregare anunțuri externe OLX/Publi24) a fost **eliminat** —
  nu se mai implementează. Documentația veche care îl menționa a fost curățată.
- Rebrand **fortis → KIRA** finalizat: domenii `crm.kiraimobiliare.ro` (CRM) și `kiraimobiliare.ro` (site).
  Au rămas intenționat: redirectul 301 de pe domeniul vechi (în site `next.config.ts`) și emailul
  sintetic de login `*@fortis.crm` (schimbarea lui ar rupe login-urile existente).
