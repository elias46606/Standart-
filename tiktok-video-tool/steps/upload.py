"""Schritt 7b: upload.txt mit Caption, 3–5 Hashtags und Hinweis zum KI-Label."""

from pathlib import Path

from pydantic import BaseModel

from steps import demo, llm
from steps.common import info, needs_run


class UploadText(BaseModel):
    caption: str
    hashtags: list[str]


SYSTEM = """Du schreibst die Beschreibung für ein deutschsprachiges TikTok-Erklärvideo.
- caption: 1–2 kurze Sätze, die neugierig machen (max. 150 Zeichen), ohne Hashtags, höchstens 1 Emoji.
- hashtags: 3 bis 5 passende Hashtags (mit #, kleingeschrieben), Mischung aus Thema und Nische (z. B. #geschichte, #lernenmittiktok). Keine generischen Spam-Tags wie #fyp."""


def make_upload_text(folder: Path, topic: str, duration: float, image_source: str,
                     demo_mode: bool, force: bool) -> None:
    out = folder / "upload.txt"
    if not needs_run([out], [folder / "script.txt", folder / "final.mp4"], force):
        info(f"Vorhanden, übersprungen: {out.name}")
        return

    if demo_mode:
        caption, tags = demo.CAPTION, demo.HASHTAGS
    else:
        script = (folder / "script.txt").read_text(encoding="utf-8")
        result = llm.ask_json(SYSTEM, f"Thema: {topic}\n\nSkript:\n{script}", UploadText)
        caption = result.caption
        tags = ["#" + t.lstrip("#").lower().replace(" ", "") for t in result.hashtags][:5]

    credits_file = folder / "images" / "credits.txt"
    credits = credits_file.read_text(encoding="utf-8").strip() if credits_file.exists() else ""

    text = f"""CAPTION (zum Kopieren)
{caption} {' '.join(tags)}

──────────────────────────────
CHECKLISTE BEIM UPLOAD
[ ] KI-Label setzen: "Mehr Optionen" → "KI-generierte Inhalte" einschalten
    ({'Stimme und Bilder sind' if image_source == 'ki' else 'Die Stimme ist'} KI-generiert – TikTok verlangt das Label).
[ ] Video einmal komplett ansehen: Fakten, Aussprache, Untertitel.
[ ] Videolänge: {duration:.1f} Sekunden {'✓' if duration > 60 else '⚠ UNTER 61 SEKUNDEN!'}

──────────────────────────────
Thema: {topic}
Bildquellen:
{credits}
"""
    out.write_text(text, encoding="utf-8")
    info(f"Gespeichert: {out}")
