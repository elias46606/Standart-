# Standart-

Dieses Repository veröffentlicht über GitHub Pages **zwei getrennte Seiten**:

| Seite | Adresse |
| --- | --- |
| ⚽ **WM 2026 & Testspiele** (Fußball-Seite, `wm-spiele.html`) | https://elias46606.github.io/Standart-/ |
| ◎ **Klarheit** (Social-Media-Demo) | https://elias46606.github.io/Standart-/klarheit/ |

Die Fußball-Seite liegt unter der Haupt-Adresse, Klarheit im Unterordner `/klarheit/`.

## Ordnerstruktur

- `index.html` – die Fußball-Seite unter der Haupt-Adresse (Kopie von `wm-spiele.html`)
- `wm-spiele.html` – die Fußball-Seite (Original)
- `klarheit/` – die **fertig gebaute** Klarheit-App, die ausgeliefert wird
- `klarheit-src/` – der **Quellcode** der Klarheit-App (React + Vite)

> Hinweis: `klarheit/` enthält den Build-Stand. Wer den Quellcode in `klarheit-src/`
> ändert, baut neu und kopiert das Ergebnis nach `klarheit/` (siehe unten) – oder
> stellt GitHub Pages auf „GitHub Actions", dann übernimmt der Workflow das automatisch.

## ◎ Klarheit lokal starten

```bash
cd klarheit-src
npm install
npm run dev
```

Neu bauen und ausgelieferten Ordner aktualisieren:

```bash
cd klarheit-src
npm run build
cp -r dist/. ../klarheit/
```

Mehr Details und Vorführ-Tipps: [klarheit-src/README.md](klarheit-src/README.md)
