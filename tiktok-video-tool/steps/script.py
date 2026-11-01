"""Schritt 2: Skript schreiben (Claude) und vom Menschen prüfen lassen."""

from pathlib import Path

import config
from steps import demo, llm
from steps.common import info, needs_run, warn

SYSTEM = """Du schreibst Skripte für deutschsprachige TikTok-Erklärvideos (Bildung, Geschichte, Wissen).
Der Text wird von einer KI-Stimme vorgelesen. Regeln:
- Länge: {wmin}–{wmax} Wörter (das Video muss sicher länger als 60 Sekunden sein).
- Erster Satz = starker Hook, der in 3 Sekunden neugierig macht (Frage, überraschender Fakt oder Widerspruch). Keine Begrüßung, kein "Hallo Leute".
- Klarer Aufbau: Hook → Kontext → 3–4 Hauptgründe/Punkte → kurzes Fazit.
- Letzter Satz: eine konkrete Frage an die Zuschauer, die zum Kommentieren einlädt.
- Kurze, gesprochene Sätze. Du-Ansprache. Keine Fremdwörter ohne Erklärung.
- Fakten müssen stimmen. Keine erfundenen Zitate oder Zahlen.
- Jahreszahlen und Zahlen als Ziffern (z. B. 1923).
- NUR der Sprechtext: keine Überschriften, keine Regieanweisungen, keine Emojis, kein Markdown, keine Hashtags.
- Absätze durch Leerzeilen trennen."""


def word_count(text: str) -> int:
    return len(text.split())


def write_script(folder: Path, topic: str, notes: str, demo_mode: bool, force: bool) -> bool:
    """Gibt True zurück, wenn ein neues Skript geschrieben wurde."""
    out = folder / "script.txt"
    if not needs_run([out], [], force):
        info(f"Vorhanden, übersprungen: {out.name}")
        return False

    if demo_mode:
        text = demo.SCRIPT
        info("Demo-Modus: Beispielskript statt Claude.")
    else:
        prompt = f"Thema: {topic}"
        if notes:
            prompt += f"\n\nMeine Stichpunkte (unbedingt einbauen):\n{notes}"
        prompt += "\n\nSchreibe jetzt das Skript."
        info(f"Claude ({config.CLAUDE_MODEL}) schreibt das Skript …")
        text = llm.ask_text(SYSTEM.format(wmin=config.WORDS_MIN, wmax=config.WORDS_MAX), prompt)

    out.write_text(text.strip() + "\n", encoding="utf-8")
    info(f"Gespeichert: {out}")
    return True


def review_script(folder: Path, auto_yes: bool) -> None:
    """Pause: Der Mensch prüft/bearbeitet script.txt, bevor es weitergeht."""
    path = folder / "script.txt"
    while True:
        text = path.read_text(encoding="utf-8")
        n = word_count(text)
        est = n / config.WORDS_PER_SECOND
        print("\n" + "─" * 60)
        print(text.strip())
        print("─" * 60)
        info(f"{n} Wörter ≈ {est:.0f} Sekunden (Schätzung)")
        if n < config.WORDS_MIN:
            warn(f"Weniger als {config.WORDS_MIN} Wörter – das Video könnte unter 61 Sekunden bleiben.")
        if n > config.WORDS_MAX + 20:
            warn("Recht lang – das Video könnte über 90 Sekunden gehen.")

        if auto_yes:
            return
        print(f"\n  Jetzt kannst du {path} in einem Editor bearbeiten und speichern.")
        answer = input("  [Enter] = weiter · [n] = Text neu anzeigen · [q] = abbrechen: ").strip().lower()
        if answer == "q":
            raise SystemExit("Abgebrochen. Später weitermachen mit --ordner " + str(folder))
        if answer != "n":
            return
