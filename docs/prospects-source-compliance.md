# Surse pentru „Anunțuri particulari” — verificare de conformitate

Verificare efectuată la 22 iulie 2026. Acest document este o verificare tehnică și nu înlocuiește consultanța juridică.

## Concluzie operațională

- CRM-ul nu ocolește CAPTCHA, autentificarea, rate-limitarea sau alte măsuri anti-bot.
- Au fost eliminate suportul de proxy și antetul care imita un browser.
- Colectarea automată rămâne blocată până când fiecare sursă are `compliance_status = 'approved'` sau operatorul setează explicit `PROSPECTS_COLLECTION_APPROVED=true` după obținerea aprobării.
- O eroare sau o execuție parțială nu marchează anunțurile lipsă drept dispărute.
- Sunt păstrate doar câmpurile necesare activității CRM; nu se încearcă extragerea numerelor ascunse.

## OLX

- Condiții oficiale: https://ajutor.olx.ro/olxhelpro/s/article/condi%C8%9Bii-de-utilizare-V31
- Acces API oficial: https://ajutor.olx.ro/olxhelpro/s/article/Cum-accesez-API
- Documentația oficială spune că accesul API necesită cont de developer, aplicație verificată și cheie API. Endpointul public intern folosit de implementarea veche nu reprezintă în sine o permisiune contractuală pentru reutilizare comercială.
- Acțiune necesară: confirmare scrisă de la OLX sau migrare la integrarea oficială aprobată înainte de activarea în producție.

## Publi24

- Reguli oficiale: https://ajutor.publi24.ro/reguli-adaugare-anunt/
- Contact oficial: https://www.publi24.ro/contact
- Regulile publice protejează conținutul și datele terților, dar pagina verificată nu oferă o autorizare explicită pentru colectare automată și reutilizare comercială.
- Acțiune necesară: confirmare scrisă de la Publi24 înainte de activarea în producție.

## Revizuire periodică

Condițiile portalurilor se pot schimba. Revalidarea trebuie făcută cel puțin trimestrial și ori de câte ori apar erori 401, 403, 429, CAPTCHA sau modificări ale paginilor. În aceste cazuri sursa se pune pe `paused`; nu se implementează ocoliri.
