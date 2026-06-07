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
- Internationale Testspiele rund um das Turnier
- Filter (Alle / Gruppen / WM-Endrunde / Testspiele / Live / Kommend) und Suche
- Nationalflaggen für jedes Team
- Automatische Aktualisierung alle 60 Sekunden

## Datenquellen

- WM-Daten: [openfootball/worldcup.json](https://github.com/openfootball/worldcup.json)
  (gemeinfrei, ohne API-Key), mit jsDelivr- und TheSportsDB-Fallback
- Testspiele & Live: [TheSportsDB](https://www.thesportsdb.com)
- Flaggen: [flagcdn](https://flagcdn.com)

Alle Daten werden direkt im Browser geladen – kein eigener Server nötig,
lauffähig z. B. über GitHub Pages.
