#!/usr/bin/env python3
"""TikTok-Erklärvideo-Generator (halbautomatisch).

Beispiele:
  python make_video.py "Warum scheiterte die Weimarer Republik?" --stimme de --bilder stock
  python make_video.py "Thema" --stichpunkte "Inflation 1923; Artikel 48"
  python make_video.py --ordner videos/2026-11-01_warum-... --neu bilder        # nur neue Bilder
  python make_video.py --ordner videos/... --neu bilder --szene 3,7            # nur Szene 3 und 7
  python make_video.py "Thema" --demo                                         # Testlauf ohne API-Keys

Jeder Schritt speichert sein Ergebnis im Videoordner. Bei einem erneuten Lauf
werden fertige Schritte übersprungen, außer sie sind mit --neu angegeben oder
ihre Eingaben haben sich geändert (z. B. script.txt bearbeitet).
"""

import argparse
import datetime
import sys
from pathlib import Path

import config
from steps import images, render, scenes, script, subtitles, upload, voice
from steps.common import info, read_json, slugify, step_title, write_json

STEPS = ["skript", "szenen", "stimme", "bilder", "untertitel", "video", "upload"]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Erstellt ein TikTok-Erklärvideo (9:16, 61–90 s).")
    p.add_argument("thema", nargs="?", help="Thema des Videos, z. B. \"Warum scheiterte die Weimarer Republik?\"")
    p.add_argument("--stichpunkte", default="", help="Eigene Stichpunkte, die ins Skript sollen")
    p.add_argument("--stimme", default="auto", choices=["auto", "de", "elevenlabs", "piper"],
                   help="auto/de = ElevenLabs wenn Key vorhanden, sonst Piper")
    p.add_argument("--bilder", default=None, choices=["stock", "ki", "platzhalter"],
                   help="stock = Pexels, ki = OpenAI-Bilder (Standard: stock)")
    p.add_argument("--ordner", type=Path, help="Bestehenden Videoordner weiterbearbeiten")
    p.add_argument("--neu", default="", help=f"Schritte neu ausführen, kommagetrennt: {','.join(STEPS)} oder alles")
    p.add_argument("--szene", default="", help="Mit --neu bilder: nur diese Szenen, z. B. 3,7")
    p.add_argument("--ja", action="store_true", help="Keine Pause zur Skriptprüfung")
    p.add_argument("--demo", action="store_true", help="Testmodus: Beispieltext statt Claude-API")
    return p.parse_args()


def setup_folder(args) -> tuple[Path, dict]:
    """Legt den Videoordner an bzw. lädt dessen Einstellungen (meta.json)."""
    if args.ordner:
        folder = args.ordner.resolve()
        if not (folder / "meta.json").exists():
            sys.exit(f"Kein Videoordner (meta.json fehlt): {folder}")
        meta = read_json(folder / "meta.json")
    else:
        if not args.thema:
            sys.exit("Bitte ein Thema angeben oder --ordner nutzen.")
        today = datetime.date.today().isoformat()
        folder = config.VIDEOS_DIR / f"{today}_{slugify(args.thema)}"
        meta = read_json(folder / "meta.json") if (folder / "meta.json").exists() else {}
        meta.setdefault("thema", args.thema)

    # Kommandozeile überschreibt gespeicherte Einstellungen
    if args.stichpunkte:
        meta["stichpunkte"] = args.stichpunkte
    meta.setdefault("stichpunkte", "")
    meta["bilder"] = args.bilder or meta.get("bilder", "stock")
    meta["demo"] = args.demo or meta.get("demo", False)

    folder.mkdir(parents=True, exist_ok=True)
    write_json(folder / "meta.json", meta)
    return folder, meta


def main() -> None:
    args = parse_args()
    folder, meta = setup_folder(args)

    redo = {s.strip() for s in args.neu.lower().split(",") if s.strip()}
    if "alles" in redo:
        redo = set(STEPS)
    unknown = redo - set(STEPS)
    if unknown:
        sys.exit(f"Unbekannte Schritte bei --neu: {', '.join(unknown)}")
    only_scenes = {int(x) for x in args.szene.split(",") if x.strip()} or None

    topic, demo_mode = meta["thema"], meta["demo"]
    print(f"\n🎬 Thema: {topic}\n📁 Ordner: {folder}")
    if demo_mode:
        print("🧪 Demo-Modus aktiv (kein Claude-API-Aufruf)")

    step_title(2, "Skript")
    if script.write_script(folder, topic, meta["stichpunkte"], demo_mode, "skript" in redo):
        script.review_script(folder, args.ja)          # ← Pause für den Menschen
    else:
        info(f"{script.word_count((folder / 'script.txt').read_text(encoding='utf-8'))} Wörter")

    step_title(3, "Szenen & Bildideen")
    scenes.make_scenes(folder, topic, demo_mode, "szenen" in redo)
    scene_list = scenes.load_scenes(folder)

    step_title(4, "Stimme")
    voice.make_voice(folder, args.stimme, "stimme" in redo)
    words = voice.load_words(folder)

    step_title(5, f"Bilder ({meta['bilder']})")
    images.make_images(folder, scene_list, meta["bilder"], "bilder" in redo, only_scenes)

    step_title(6, "Untertitel")
    subtitles.make_subtitles(folder, words, "untertitel" in redo)

    step_title(7, "Video-Export")
    final = render.render(folder, scene_list, words, voice.audio_path(folder), "video" in redo)
    duration = render.check_length(final)
    upload.make_upload_text(folder, topic, duration, meta["bilder"], demo_mode, "upload" in redo)

    print(f"\n✅ Fertig: {final}\n   Upload-Infos: {folder / 'upload.txt'}\n")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit("\nAbgebrochen.")
