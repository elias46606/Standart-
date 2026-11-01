# TikTok-Erklärvideo-Tool

Halbautomatischer Generator für deutschsprachige TikTok-Erklärvideos (61–90 Sekunden, 9:16, 1080×1920).
Du gibst das Thema vor und prüfst das Skript. Den Rest erledigt das Tool: Szenen, Stimme, Bilder, Untertitel und Export.

```
Thema ─▶ Skript (Claude) ─▶ ⏸ du prüfst/bearbeitest ─▶ Szenen + Bildideen ─▶ Stimme (ElevenLabs/Piper)
      ─▶ Bilder (Pexels/OpenAI) ─▶ Wort-Untertitel ─▶ final.mp4 + upload.txt
```

## Installation (Mac)

1. **Homebrew** installieren (falls noch nicht vorhanden): siehe https://brew.sh
2. **Python und ffmpeg** installieren:
   ```bash
   brew install python@3.12 ffmpeg
   ```
3. **Projekt einrichten:**
   ```bash
   cd tiktok-video-tool
   python3.12 -m venv .venv
   source .venv/bin/activate          # bei jedem neuen Terminal wiederholen
   pip install -r requirements.txt
   ```
4. **API-Keys eintragen:**
   ```bash
   cp .env.example .env
   open -e .env                       # öffnet die Datei in TextEdit
   ```
   | Key | Wofür | Pflicht? |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | Skript, Bildideen, Caption | ja (außer `--demo`) |
   | `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` | Stimme in hoher Qualität | nein, sonst Piper |
   | `PEXELS_API_KEY` | Stockfotos (kostenlos: pexels.com/api) | für `--bilder stock` |
   | `OPENAI_API_KEY` | KI-Bilder | für `--bilder ki` |

5. **Piper-Stimme herunterladen.** Das ist die kostenlose Offline-Stimme. Sie wird genutzt, wenn kein ElevenLabs-Key gesetzt ist.
   ```bash
   python -m piper.download_voices de_DE-thorsten-high --download-dir models
   ```
   Danach liegt `models/de_DE-thorsten-high.onnx` bereit. Eine andere Stimme stellst du in `.env` über `PIPER_MODEL` ein.

Testen ohne API-Keys:
```bash
python make_video.py "Warum scheiterte die Weimarer Republik?" --demo
```
Dabei kommt ein festes Beispielskript statt Claude zum Einsatz, und ohne Pexels-Key gibt es Platzhalterbilder.

## Benutzung

```bash
python make_video.py "Warum scheiterte die Weimarer Republik?" --stimme de --bilder stock
```

| Option | Bedeutung |
|---|---|
| `--stichpunkte "…"` | Eigene Punkte, die ins Skript sollen |
| `--stimme auto\|de\|elevenlabs\|piper` | `auto`/`de`: ElevenLabs, wenn ein Key da ist, sonst Piper |
| `--bilder stock\|ki\|platzhalter` | Pexels-Stockfotos, OpenAI-KI-Bilder oder Platzhalter |
| `--ordner videos/…` | An einem bestehenden Video weiterarbeiten |
| `--neu bilder,stimme,…` | Schritte neu ausführen: `skript, szenen, stimme, bilder, untertitel, video, upload, alles` |
| `--szene 3,7` | Zusammen mit `--neu bilder`: nur diese Szenen neu |
| `--ja` | Keine Pause zur Skriptprüfung |
| `--demo` | Testmodus ohne Claude-API |

**Die Pause:** Nachdem das Skript geschrieben ist, hält das Tool an. Öffne dann `videos/…/script.txt`, ändere den Text, speichere und drücke Enter. Das Tool zeigt dir die Wortanzahl und die geschätzte Länge an.

### Typische Abläufe

```bash
# Bilder gefallen nicht → nur neue Bilder (und automatisch neues Video)
python make_video.py --ordner videos/2026-11-01_warum-scheiterte-die-weimarer-republik --neu bilder

# Nur Bild 4 austauschen, diesmal als KI-Bild
python make_video.py --ordner videos/… --neu bilder --szene 4 --bilder ki

# Suchbegriff/Bildidee einer Szene selbst ändern:
#   scenes.json bearbeiten → beim nächsten Lauf werden die Bilder neu geholt
python make_video.py --ordner videos/…

# Skript nachträglich geändert (script.txt bearbeitet):
#   Szenen, Stimme, Untertitel und Video werden automatisch neu erzeugt
python make_video.py --ordner videos/…
```

### Caching-Regel

Jeder Schritt wird übersprungen, wenn sein Ergebnis schon existiert. Neu ausgeführt wird er nur in zwei Fällen:
- Du gibst ihn mit `--neu` an.
- Eine seiner Eingabedateien ist neuer als das Ergebnis. Beispiel: Du hast `script.txt` geändert, dann werden Szenen, Stimme und die folgenden Schritte neu gemacht.

## Ordnerstruktur

```
tiktok-video-tool/
├── make_video.py            # Kommandozeile, steuert die Schritte
├── config.py                # Einstellungen (Längen, Größen, Modelle) + .env laden
├── steps/
│   ├── script.py            # 2. Skript (Claude) + Pause zur Prüfung
│   ├── scenes.py            # 3. Szenen + Bildideen
│   ├── voice.py             # 4. ElevenLabs / Piper mit Wort-Zeitstempeln
│   ├── images.py            # 5. Pexels / OpenAI / Platzhalter
│   ├── subtitles.py         # 6. Wort-für-Wort-Untertitel (.ass)
│   ├── render.py            # 7. Ken Burns, Untertitel einbrennen, Längencheck
│   ├── upload.py            # 7. upload.txt (Caption, Hashtags, KI-Label)
│   ├── llm.py               # Claude-API-Aufrufe
│   ├── demo.py              # Beispieltexte für --demo
│   └── common.py            # Hilfsfunktionen
├── models/                  # Piper-Stimmen (nicht im Git)
├── fonts/                   # optional: eigene Schriften für Untertitel
└── videos/                  # ein Ordner pro Video (nicht im Git)
    └── 2026-11-01_warum-scheiterte-die-weimarer-republik/
        ├── meta.json        # Thema, Stichpunkte, Bildquelle
        ├── script.txt       # ← hier bearbeitest du
        ├── scenes.json      # Szenentext, Bildidee, Pexels-Suchbegriff
        ├── audio.wav/.mp3
        ├── words.json       # Zeitstempel pro Wort
        ├── images/          # scene_01.jpg … + credits.txt
        ├── subtitles.ass
        ├── final.mp4        # ← fertiges Video
        └── upload.txt       # ← Caption, Hashtags, Upload-Checkliste
```

## Details und Tipps

- **Länge:**
  - Das Tool warnt dreimal: beim Skript (Schätzung), nach der Stimme (echte Audiolänge) und nach dem Export.
  - Ist das Video zu kurz, verlängere das Skript und starte erneut mit `--neu stimme` (die Folgeschritte laufen automatisch mit).
  - Bei Piper kannst du alternativ `PIPER_LENGTH_SCALE=1.1` setzen, dann spricht die Stimme langsamer.
- **Untertitel:**
  - Sie stehen bei etwa 60 % der Bildhöhe und leicht links von der Mitte. So bleiben sie frei von Suchleiste, Like-Buttons und Caption.
  - Die Schrift stellst du über `SUBTITLE_FONT` ein. Standard ist „Arial Black“, die auf dem Mac vorinstalliert ist.
  - Eigene Schriften legst du als `.ttf` in `fonts/` ab.
- **Wort-Zeitstempel mit Piper:**
  - Piper liefert selbst keine Zeitstempel. Das Tool erzeugt die Stimme deshalb Satz für Satz, dadurch sind die Satzgrenzen exakt.
  - Innerhalb eines Satzes werden die Wortzeiten nach der Anzahl der Laute verteilt.
  - ElevenLabs liefert echte Zeitstempel und ist entsprechend etwas genauer.
- **Bildrechte:**
  - Pexels-Fotos sind frei nutzbar. Die Fotografen stehen trotzdem in `images/credits.txt` und in `upload.txt`.
  - KI-Bilder zeigen bewusst keine echten, erkennbaren Personen.
- **Renderzeit:** etwa 2–3 Minuten für 90 Sekunden Video.
- **KI-Label:** Stimme (und eventuell Bilder) sind KI-generiert. Setz beim Upload das Label „KI-generierte Inhalte“; die Checkliste in `upload.txt` erinnert dich daran.
- **Fakten:** Claude soll keine Zahlen erfinden, aber prüf das Skript in der Pause trotzdem immer selbst.
