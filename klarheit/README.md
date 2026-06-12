# ◎ Klarheit

**Eine Social-Media-Demo, die die Schwächen heutiger Plattformen behebt.**

Klarheit ist eine reine Frontend-Demo (React + Vite) für eine Schulpräsentation:
Sie läuft komplett ohne Backend – alle Daten (6 fiktive Nutzer, 15 Posts) sind als
Demo-Daten fest im Code hinterlegt.

## 🚀 Schnellstart

```bash
cd klarheit
npm install
npm run dev
```

Danach öffnet sich die App unter **http://localhost:5173** (Link erscheint im Terminal).

## ✨ Die Features – und welche Probleme sie lösen

Jedes Feature hat in der App ein kleines **ⓘ-Info-Icon**. Ein Klick darauf öffnet die
Erklärung, welches Problem heutiger Plattformen es behebt – das ist der Kern der
Präsentation.

| Feature | Behebt |
| --- | --- |
| **Chronologischer Feed mit klarem Ende** („✓ Du bist auf dem neuesten Stand") | Infinite Scroll & algorithmische Feeds, die zum Endlos-Scrollen verleiten |
| **Verborgene Like-Zahlen** (liken ja, Zahlen bei anderen nein) | Sozialen Vergleichsdruck durch öffentliche Punktestände |
| **Live-Nutzungszeit im Header + Pause-Erinnerung** | Unbemerkt „verschwindende" Zeit (für die Demo nach 2 Minuten) |
| **Kommentar-Bedenkzeit** (10-Sekunden-Countdown, „Kurz nachdenken") | Impulsive, hitzige Kommentare |
| **Community-Note** an einem Beispiel-Post | Unkontrollierte Verbreitung von Falschinformationen |
| **Daten-Export als JSON + Account-Löschung mit einem Klick** | Datensilos und Dark Patterns beim Kündigen |
| **Heller + dunkler Modus** | – einfach Komfort 🙂 |

## 🎬 Tipps für die Vorführung

1. **Feed zeigen:** ganz nach unten scrollen → das ehrliche Feed-Ende erscheint.
2. **Like klicken:** es gibt keine Zahlen bei anderen; bei eigenen Posts steht „🔒 Nur für dich".
3. **Kommentieren:** lostippen → der 10-Sekunden-Countdown („Kurz nachdenken …") läuft.
4. **Community-Note:** der Spinat-Post von Tom hat ein Beispiel.
5. **2 Minuten warten** (oder die Demo nebenbei laufen lassen) → die Pause-Erinnerung erscheint.
6. **Einstellungen:** Daten als JSON exportieren und den Account löschen (sofort wirksam).
7. **ⓘ-Icons klicken** – sie erklären jeweils das Problem und unsere Lösung.

## 🛠 Technik

- React 18 + Vite, keine weiteren Abhängigkeiten
- Kein Backend, keine Datenbank – alle Demo-Daten in `src/data.js`
- Erklärtexte der Info-Icons in `src/infoTexts.js`
- Helles/dunkles Theme über CSS-Variablen, Auswahl wird im Browser gespeichert
