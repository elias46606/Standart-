"""Schritt 6: Wort-für-Wort-Untertitel als ASS-Datei (wird von ffmpeg eingebrannt).

- 1–3 Wörter gleichzeitig sichtbar, das gerade gesprochene Wort ist gelb.
- Große, fette Schrift mit dicker schwarzer Kontur.
- Position im "sicheren Bereich" von TikTok:
    oben ~150 px: Suchleiste/Tabs, rechts ~140 px: Like/Kommentar-Buttons,
    unten ~450 px: Name, Caption, Musik. Wir zentrieren bei y≈1180 und halten
    die Textbreite unter ~800 px, leicht nach links versetzt.
"""

from pathlib import Path

import config
from steps.common import info, needs_run

MAX_WORDS = 3
MAX_LINE_CHARS = 14
CENTER_X, CENTER_Y = 510, 1180
MAX_TEXT_WIDTH = 800
BASE_SIZE = 96
WHITE, YELLOW = "&H00FFFFFF&", "&H0000E1FF&"   # ASS-Farben sind BGR


def _escape(word: str) -> str:
    return word.replace("\\", "").replace("{", "(").replace("}", ")")


def group_words(words: list[dict]) -> list[list[dict]]:
    """Teilt die Wörter in kurze Häppchen (max. 3 Wörter, Bruch nach Satzzeichen)."""
    groups, cur = [], []
    for w in words:
        cur.append(w)
        text_len = len(" ".join(x["word"] for x in cur))
        if len(cur) >= MAX_WORDS or text_len > MAX_LINE_CHARS * 1.6 or w["word"][-1] in ".!?:;,…":
            groups.append(cur)
            cur = []
    if cur:
        groups.append(cur)
    return groups


def _lines(group: list[dict]) -> list[list[int]]:
    """Wortindizes je Zeile: eine Zeile, oder zwei, wenn es zu breit wird."""
    idx = list(range(len(group)))
    if len(group) == 1 or len(" ".join(w["word"] for w in group)) <= MAX_LINE_CHARS:
        return [idx]
    # Beste Trennstelle = möglichst gleich lange Zeilen
    best = min(range(1, len(group)), key=lambda k: abs(
        len(" ".join(w["word"] for w in group[:k])) - len(" ".join(w["word"] for w in group[k:]))))
    return [idx[:best], idx[best:]]


def _font_size(group: list[dict], lines: list[list[int]]) -> int:
    """Schrift verkleinern, wenn die längste Zeile (z. B. lange Komposita) zu breit wäre."""
    longest = max(len(" ".join(group[i]["word"] for i in line)) for line in lines)
    return int(min(BASE_SIZE, MAX_TEXT_WIDTH / (longest * 0.62)))


def _ts(sec: float) -> str:
    cs = round(max(sec, 0) * 100)          # ASS rechnet in Hundertstelsekunden
    h, cs = divmod(cs, 360000)
    m, cs = divmod(cs, 6000)
    s, cs = divmod(cs, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def build_ass(words: list[dict]) -> str:
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {config.WIDTH}
PlayResY: {config.HEIGHT}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Wort,{config.SUBTITLE_FONT},{BASE_SIZE},&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,7,4,5,60,160,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = []
    groups = group_words(words)
    for g_i, group in enumerate(groups):
        next_start = groups[g_i + 1][0]["start"] if g_i + 1 < len(groups) else None
        lines = _lines(group)
        size = _font_size(group, lines)
        for w_i, word in enumerate(group):
            start = word["start"]
            if w_i + 1 < len(group):
                end = group[w_i + 1]["start"]
            elif next_start is not None and next_start - word["end"] < 0.6:
                end = next_start              # lückenlos zur nächsten Gruppe
            else:
                end = word["end"] + 0.3       # kurz stehen lassen (Satzende/Videoende)
            # Ganze Gruppe zeigen, aktuelles Wort gelb
            text_lines = []
            for line in lines:
                parts = []
                for i in line:
                    color = YELLOW if i == w_i else WHITE
                    parts.append(f"{{\\c{color}}}{_escape(group[i]['word'])}")
                text_lines.append(" ".join(parts))
            text = f"{{\\an5\\pos({CENTER_X},{CENTER_Y})\\fs{size}}}" + "\\N".join(text_lines)
            events.append(f"Dialogue: 0,{_ts(start)},{_ts(end)},Wort,,0,0,0,,{text}")
    return header + "\n".join(events) + "\n"


def make_subtitles(folder: Path, words: list[dict], force: bool) -> None:
    out = folder / "subtitles.ass"
    if not needs_run([out], [folder / "words.json"], force):
        info(f"Vorhanden, übersprungen: {out.name}")
        return
    out.write_text(build_ass(words), encoding="utf-8")
    info(f"Gespeichert: {out} ({len(group_words(words))} Untertitel-Häppchen)")
