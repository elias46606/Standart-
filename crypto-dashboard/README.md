# Krypto-Dashboard

Ein reines Vanilla-JS/HTML/CSS-Dashboard für Krypto-Assets, ETFs, Portfolio-Tracking und Markt-News — ohne Build-Tools, ohne Framework. Alle Daten außer dem Portfolio selbst werden live von öffentlichen APIs geladen; das Portfolio bleibt ausschließlich im `localStorage` des Browsers.

## Funktionsumfang

- **Markt**: Top-50-Kryptowährungen (Preis, 24h-Änderung, Marktkapitalisierung, Sparkline), Suche, Sortierung, Watchlist, Fear-&-Greed-Index, Trending-Leiste (angesagteste Coins laut CoinGecko). Der letzte Marktstand wird lokal gesichert und beim nächsten Öffnen sofort angezeigt, während frische Daten parallel laden.
- **ETFs**: ~17 ETFs (World/Sektor/Anleihen/Rohstoffe/Region) mit Kurs, Änderung und Sparkline aus eigenem Datenmodul (`etfs-data.js`).
- **Portfolio**: Bestände (Krypto + ETF) verwalten, Gesamtwert/Tagesänderung/Gewinn-Verlust, Allokations-Donut, Verlaufschart (tägliche Snapshots, 7T/30T/Alle), Korrelationsmatrix (30-Tage-Tagesrenditen, Pearson), Was-wäre-wenn-Simulator, Export/Import (JSON/CSV), anonymisierte Performance-Grafik zum Teilen (PNG).
- **News**: Aktuelle Krypto-News mit Kategorie-Filter, mehrstufige Fallback-Kette bei Ausfall einer Quelle.
- **Bedienung**: Command-K-Suche (⌘K/Strg+K) über alle Assets/Portfolio-Einträge, Tastatur-Shortcuts (1–4 für Tabs, `?` für Übersicht), Preis-Alarme (Browser-Benachrichtigungen), USD/EUR-Umschalter.
- **PWA**: Installierbar (Manifest + Icons), Service Worker mit Cache-Fallback für Marktdaten, funktioniert eingeschränkt offline (zuletzt geladene Daten bleiben sichtbar).

## Verwendete APIs

| Quelle | Zweck | Hinweis |
|---|---|---|
| [CoinGecko](https://www.coingecko.com/en/api) | Kryptopreise, Sparklines, Chart-Historie | öffentliches Rate-Limit, kein API-Key |
| [CryptoCompare News API](https://min-api.cryptocompare.com/) | News (primäre Quelle) | direkter Zugriff scheitert oft an CORS im Browser |
| CoinDesk-/Cointelegraph-RSS via [rss2json.com](https://rss2json.com/) | News (Fallback) | falls CryptoCompare nicht erreichbar ist |
| [Stooq](https://stooq.com/) CSV-Endpunkt | ETF-Kurshistorie (primär) | Ticker-Mapping in `etfs-data.js` ist best-effort; sendet keine CORS-Header, läuft daher wie Yahoo über den CORS-Proxy |
| [Yahoo Finance Chart API](https://query1.finance.yahoo.com/) | ETF-Kurshistorie (Fallback) | nur über CORS-Proxy erreichbar |
| [Frankfurter](https://www.frankfurter.app/) | USD/EUR/GBP-Wechselkurse | stündlich aktualisiert |
| [alternative.me Fear & Greed Index](https://alternative.me/crypto/fear-and-greed-index/) | Marktstimmung | — |
| [api.allorigins.win](https://allorigins.win/) | CORS-Proxy für News- und Yahoo-Anfragen | einzelner Proxy-Anbieter, siehe Limitierungen |

Alle Netzwerkanfragen laufen über eine zentrale Daten-Layer (`dataSources`/`ensureFresh` in `app.js`): pro Quelle gibt es einen TTL-Cache, In-Flight-Deduplizierung (parallele Aufrufe teilen sich ein Promise), Pausierung bei inaktivem Browser-Tab sowie Backoff bei HTTP 429 (5s/15s/30s). Chart-Serien (Modal, Korrelationsmatrix) laufen über denselben Cache-Mechanismus mit eigener, längerer TTL (`CHART_CACHE_TTL_MS`).

## Bekannte Einschränkungen

- **Rate-Limits**: CoinGecko und Stooq/Yahoo sind öffentliche, unauthentifizierte Endpunkte mit strikten Rate-Limits. Bei Überlastung greift der Backoff-Mechanismus, die Anzeige zeigt dann einen "verzögert"/"Fehler"-Status pro Datenquelle (farbige Punkte im Header).
- **CORS-Proxy-Abhängigkeit**: Die News-Funktion und der Yahoo-Finance-ETF-Fallback hängen von `api.allorigins.win` als drittem Dienst ab. Fällt dieser aus, greift für News die RSS-Fallback-Kette; für ETFs bleibt in diesem Fall nur die (dann ebenfalls fehlgeschlagene) Stooq-Quelle, die ETF-Zeile wird dann ausgelassen.
- **Stooq-Ticker-Mapping**: Die Zuordnung von Symbol zu Stooq-Ticker in `etfs-data.js` ist manuell gepflegt und best-effort; nicht jeder ETF ist über Stooq verlässlich verfügbar.
- **Kein Server, kein Backend**: Alle Berechnungen laufen im Browser. Portfolio-Daten verlassen den Browser nie (kein Sync zwischen Geräten).
- **Korrelationsmatrix/Was-wäre-wenn** benötigen mindestens 2 Portfolio-Positionen bzw. mind. 5 gemeinsame Handelstage an Kursdaten, sonst wird ein Leerzustand angezeigt.
- **Portfolio-Verlaufschart** braucht mindestens 2 tägliche Snapshots (einer pro Tag/Browsersitzung), daher in den ersten Tagen der Nutzung leer.

## Technische Struktur

- `index.html` — Seitenstruktur (Tabs, Modals, Overlays)
- `style.css` — komplettes flaches/minimalistisches Design-System (CSS Custom Properties, ein Satz Tabellen-/Pill-/Status-Stile für alle Bereiche)
- `etfs-data.js` — statisches ETF-Datenmodul (Symbol, Name, Kategorie, Stooq-/Yahoo-Ticker)
- `app.js` — gesamte Anwendungslogik (Datenlayer, Rendering, State), in Abschnitte gegliedert (siehe Kommentar-Überschriften in der Datei)
- `manifest.json` / `sw.js` / `icons/` — PWA-Support
