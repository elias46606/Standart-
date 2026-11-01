"""Kleine Hilfsfunktionen, die alle Schritte gemeinsam nutzen."""

import json
import re
import subprocess
import unicodedata
from pathlib import Path


def info(msg: str) -> None:
    print(f"  {msg}")


def warn(msg: str) -> None:
    # Gelb im Terminal, damit Warnungen auffallen
    print(f"\033[33m  ⚠ {msg}\033[0m")


def step_title(nr: int, name: str) -> None:
    print(f"\n\033[1m[{nr}] {name}\033[0m")


def slugify(text: str, max_len: int = 50) -> str:
    """'Warum scheiterte die Weimarer Republik?' -> 'warum-scheiterte-die-weimarer-republik'"""
    text = text.lower().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text[:max_len].rstrip("-") or "video"


def needs_run(outputs: list[Path], inputs: list[Path], force: bool) -> bool:
    """Caching-Regel für alle Schritte:
    Ein Schritt läuft neu, wenn (a) erzwungen, (b) eine Ausgabe fehlt oder
    (c) eine Eingabe neuer ist als die älteste Ausgabe (z. B. Skript bearbeitet)."""
    if force:
        return True
    if not all(p.exists() for p in outputs):
        return True
    oldest_output = min(p.stat().st_mtime for p in outputs)
    return any(p.exists() and p.stat().st_mtime > oldest_output for p in inputs)


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def media_duration(path: Path) -> float:
    """Länge einer Audio-/Videodatei in Sekunden (über ffprobe)."""
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip())


def split_sentences(text: str) -> list[str]:
    """Teilt Text an . ! ? (und …) in Sätze."""
    parts = re.split(r"(?<=[.!?…])\s+", text.strip())
    return [p.strip() for p in parts if p.strip()]
