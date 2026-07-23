# CRM KIRA IMOBILIARE — Progres implementare

**Ultima actualizare:** 2026-07-23
**Deploy live:** https://crm.kiraimobiliare.ro  
**Stack:** Next.js 16 (App Router) + Supabase PostgreSQL + Tailwind v4 + Vercel

---

## ✅ Funcționalități complet implementate

### Core CRM
- [x] **Autentificare** — login, register, logout, sesiune persistentă
- [x] **Multi-tenant** — izolare completă prin `agency_id` în toate interogările
- [x] **RBAC** — roluri: `owner`, `admin`, `agent`; protecție rute Finance/Portals/Team/Settings
- [x] **Dashboard** — KPI-uri, activitate recentă, widget taskuri scadente
- [x] **Proprietăți** — editor canonic, validare unitară, hartă, AI și galerie atomică cu ordine, copertă, ALT, variante comprimate și cleanup sigur
- [x] **Contacte** — CRUD, căutare
- [x] **Cereri & potriviri** — cereri clienți, matching automat cu proprietăți
- [x] **Lead-uri** — pipeline Kanban drag & drop, wait time formatat (59m / 2h 30m / 1z 5h)
- [x] **Vizionări** — programare, status, outcome, integrare calendar
- [x] **Calendar** — evenimente, vizionări, remindere
- [x] **Taskuri** — creare, prioritate (mică/medie/mare), dată limită, atribuire agent, widget dashboard
- [x] **Documente proprietăți** — upload per categorie (PDF/JPG/PNG max 15MB), download signed URL, ștergere
- [x] **Istoric modificări** — activity_logs pe proprietăți (cine, când, ce câmp, valoare veche→nouă)
- [x] **Notificări persistente** — inbox unic cu dashboardul, badge din cont, priorități, arhivare, paginare și alerte operaționale deduplicate
- [x] **Portaluri** — integrare Storia cu OAuth legat de agenție/sesiune, state anti-CSRF de unică folosință, tokenuri criptate, refresh serializat, revocare auditată, publish/unpublish, webhook și verificare completă periodică a listărilor, cu URL/ID public, agent, istoric și alerte stale
- [x] **Echipă** — membri, stats, activitate
- [x] **Finanțe și tranzacții** — flux cu client și proprietate obligatorii, finalizare atomică, registru de comisioane și retrageri portal cu retry
- [x] **Setări** — profil agenție, watermark fotografii
- [x] **Experiență mobilă** — navigație „Mai mult” după permisiuni, safe-area, ținte tactile, carduri pentru tabele, formulare și modale responsive
- [x] **Pipeline operațional** — 16 etape verificabile, tranziții controlate, istoric separat și dovezi pentru proprietăți trimise
- [x] **Automatizări configurabile** — 10 reguli centrale, activare/dezactivare, intervale, deduplicare, retry și jurnal de execuție
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
  - migrations/20260720_140_storia_oauth_security.sql → OAuth multi-agency și tokenuri criptate
  - migrations/20260720_150_storia_listing_sync.sql → verificare durabilă și alerte listări Storia
  - migrations/20260720_160_operational_pipeline.sql → pipeline operațional și dovezi de etapă
  - migrations/20260720_170_automation_engine.sql → motorul central și cele 10 reguli configurabile
```

---

## 📝 Note

- **Property Intelligence** (modul de agregare anunțuri externe OLX/Publi24) a fost **eliminat** —
  nu se mai implementează. Documentația veche care îl menționa a fost curățată.
- Rebrand **fortis → KIRA** finalizat: domenii `crm.kiraimobiliare.ro` (CRM) și `kiraimobiliare.ro` (site).
  Au rămas intenționat: redirectul 301 de pe domeniul vechi (în site `next.config.ts`) și emailul
  sintetic de login `*@fortis.crm` (schimbarea lui ar rupe login-urile existente).
