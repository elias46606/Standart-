# WM 2026 – Live Spielplan, Gruppen & Tabellen

Eine sich automatisch aktualisierende Website zur Fußball-Weltmeisterschaft 2026
(USA · Kanada · Mexiko) mit allen Spielen der A-Nationalmannschaften, Gruppen,
Tabellen und Testspielen.

## Seiten

- **`index.html`** – die WM-Seite (Startseite)
- **`himmel.html`** – die frühere „Himmel"-Demo

## Funktionen

- Vollständiger WM-Spielplan inkl. K.-o.-Phase, gekennzeichnet nach Gruppe bzw.
  Turnierphase (Achtelfinale, Finale …)
- Gruppentabellen (A–L), live aus den Ergebnissen berechnet (Punkte, Tore,
  Differenz, Form)
- Klickbare Spiele mit Detailansicht: Torschützen (Minute, Elfmeter, Eigentor),
  Halbzeitstand und Fakten
- Torschützenliste des Turniers (aktualisiert sich automatisch)
- Internationale Testspiele rund um das Turnier (via ESPN)
- **Startelf, Bank, Statistiken und Vorlagen** in der Spiel-Detailansicht –
  kostenlos und ohne Key über die offene ESPN-API (erscheinen, sobald ESPN für
  das Spiel Daten bereitstellt, i. d. R. ab ~1 Std. vor Anstoß bzw. live)
- Filter (Alle / Gruppen / WM-Endrunde / Testspiele / Live / Kommend) und Suche
- Nationalflaggen für jedes Team
- Deutschland-Spiele hervorgehoben (DFB-Touch)
- Automatische Aktualisierung alle 60 Sekunden
- Installierbar als App (PWA) mit Offline-Spielplan
- Schöne Link-Vorschau (Open Graph) und Favicon

## Datenquellen

- WM-Daten: [openfootball/worldcup.json](https://github.com/openfootball/worldcup.json)
  (gemeinfrei, ohne API-Key), mit jsDelivr-Fallback
- Testspiele, Aufstellungen & Statistik: offene [ESPN](https://www.espn.com)-API
  (kostenlos, ohne Key)
- Flaggen: [flagcdn](https://flagcdn.com)

Alle Daten werden direkt im Browser geladen – kein eigener Server nötig,
lauffähig z. B. über GitHub Pages.
