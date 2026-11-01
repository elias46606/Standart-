"""Schritt 3: Skript in Szenen (je ca. 5–8 Sek.) teilen + Bildbeschreibung pro Szene.

Die Aufteilung macht der Code selbst (an Satzgrenzen), damit der Szenentext
garantiert 1:1 zum Skript passt. Claude liefert nur die Bildideen.
"""

import re
from pathlib import Path

from pydantic import BaseModel

import config
from steps import demo, llm
from steps.common import info, needs_run, read_json, split_sentences, write_json


class SceneImage(BaseModel):
    bild_prompt: str      # ausführliche Bildbeschreibung (für KI-Bilder)
    suchbegriff: str      # 2–3 englische Wörter (für Pexels)


class SceneImages(BaseModel):
    szenen: list[SceneImage]


SYSTEM = """Du bist Bildredakteur für TikTok-Erklärvideos im Hochformat (9:16).
Du bekommst nummerierte Szenen eines Sprechtexts. Liefere für JEDE Szene genau einen Eintrag, in derselben Reihenfolge:
- bild_prompt: konkrete, visuelle Bildbeschreibung auf Deutsch (1–2 Sätze): Motiv, Stimmung, Licht. Hochformat. Keine Texte/Schrift im Bild. Keine echten, erkennbaren Personen des öffentlichen Lebens; historische Themen symbolisch oder als Szenerie darstellen.
- suchbegriff: 2–3 englische Wörter für eine Stockfoto-Suche (Pexels), allgemein genug, dass es Treffer gibt.
Abwechslungsreiche Motive, kein Motiv doppelt."""


def split_into_scenes(script: str) -> list[str]:
    """Fasst Sätze zu Szenen mit ca. 12–20 Wörtern zusammen."""
    # Zu lange Sätze vorher an Kommas/Doppelpunkten teilen
    pieces = []
    for sentence in split_sentences(script):
        if len(sentence.split()) <= config.SCENE_MAX_WORDS:
            pieces.append(sentence)
            continue
        for part in re.split(r"(?<=[,:;])\s+", sentence):
            words = part.split()
            # notfalls hart nach Wortanzahl teilen
            while len(words) > config.SCENE_MAX_WORDS:
                pieces.append(" ".join(words[: config.SCENE_MAX_WORDS]))
                words = words[config.SCENE_MAX_WORDS:]
            if words:
                pieces.append(" ".join(words))

    scenes, current = [], []
    for piece in pieces:
        n_cur, n_new = len(" ".join(current).split()), len(piece.split())
        if current and n_cur + n_new > config.SCENE_MAX_WORDS:
            scenes.append(" ".join(current))
            current = []
        current.append(piece)
        if len(" ".join(current).split()) >= config.SCENE_MIN_WORDS:
            scenes.append(" ".join(current))
            current = []
    if current:
        # Kurzen Rest an die letzte Szene hängen, wenn er sehr kurz ist
        if scenes and len(" ".join(current).split()) < 6:
            scenes[-1] += " " + " ".join(current)
        else:
            scenes.append(" ".join(current))
    return scenes


def make_scenes(folder: Path, topic: str, demo_mode: bool, force: bool) -> None:
    script_path, out = folder / "script.txt", folder / "scenes.json"
    if not needs_run([out], [script_path], force):
        info(f"Vorhanden, übersprungen: {out.name}")
        return

    texts = split_into_scenes(script_path.read_text(encoding="utf-8"))
    info(f"{len(texts)} Szenen gebildet.")

    if demo_mode:
        hints = [demo.IMAGE_HINTS[i % len(demo.IMAGE_HINTS)] for i in range(len(texts))]
    else:
        numbered = "\n".join(f"{i + 1}. {t}" for i, t in enumerate(texts))
        info("Claude erstellt Bildbeschreibungen …")
        result = llm.ask_json(SYSTEM, f"Thema des Videos: {topic}\n\nSzenen:\n{numbered}", SceneImages)
        if len(result.szenen) != len(texts):
            raise SystemExit(f"Claude lieferte {len(result.szenen)} statt {len(texts)} Bildideen – bitte erneut versuchen.")
        hints = [(s.bild_prompt, s.suchbegriff) for s in result.szenen]

    scenes = [
        {"nr": i + 1, "text": text, "bild_prompt": prompt, "suchbegriff": query}
        for i, (text, (prompt, query)) in enumerate(zip(texts, hints))
    ]
    write_json(out, scenes)
    for s in scenes:
        info(f"Szene {s['nr']:>2} ({len(s['text'].split())} Wörter): {s['suchbegriff']}")
    info(f"Gespeichert: {out} (Bildideen/Suchbegriffe kannst du dort von Hand ändern)")


def load_scenes(folder: Path) -> list[dict]:
    return read_json(folder / "scenes.json")
