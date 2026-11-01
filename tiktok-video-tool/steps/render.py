"""Schritt 7a: Video zusammensetzen.

1. moviepy: Bilder mit Ken-Burns-Effekt (Zoom/Schwenk) + Tonspur → _roh.mp4
2. ffmpeg:  Untertitel (subtitles.ass) einbrennen → final.mp4
3. Länge prüfen (muss über 60 Sekunden liegen)
"""

import os
import subprocess
from pathlib import Path

import numpy as np
from moviepy import AudioFileClip, VideoClip, concatenate_videoclips
from PIL import Image

import config
from steps.common import info, media_duration, needs_run, warn

KB_MOVES = ["zoom_in", "pan_right", "zoom_out", "pan_left"]


def scene_times(scenes: list[dict], words: list[dict], audio_len: float) -> list[tuple[float, float]]:
    """Start/Ende jeder Szene aus den Wort-Zeitstempeln.
    Eine Szene beginnt, wenn ihr erstes Wort gesprochen wird."""
    counts = [len(s["text"].split()) for s in scenes]
    total = sum(counts)
    starts, cum = [], 0
    for c in counts:
        # Falls die TTS-Wortzahl leicht abweicht (z. B. ElevenLabs), proportional zuordnen
        idx = min(round(cum * len(words) / total), len(words) - 1)
        starts.append(0.0 if cum == 0 else words[idx]["start"])
        cum += c
    ends = starts[1:] + [audio_len + 0.6]   # kurzer Nachlauf am Ende
    return list(zip(starts, ends))


def ken_burns_clip(image_path: Path, duration: float, move: str) -> VideoClip:
    """Langsamer Zoom oder Schwenk über ein (etwas zu großes) Standbild."""
    img = Image.open(image_path).convert("RGB")
    iw, ih = img.size
    W, H = config.WIDTH, config.HEIGHT

    def box_at(t: float) -> tuple[float, float, float, float]:
        p = t / duration                        # Fortschritt 0 → 1
        if move == "zoom_in":
            zoom, cx = 1.0 + 0.15 * p, 0.5
        elif move == "zoom_out":
            zoom, cx = 1.15 - 0.15 * p, 0.5
        elif move == "pan_right":
            zoom, cx = 1.12, 0.35 + 0.3 * p
        else:  # pan_left
            zoom, cx = 1.12, 0.65 - 0.3 * p
        bw, bh = iw / zoom, ih / zoom           # Ausschnittgröße
        x0 = (iw - bw) * cx                     # cx: 0 = ganz links, 1 = ganz rechts
        y0 = (ih - bh) * 0.45
        return x0, y0, x0 + bw, y0 + bh

    def frame(t: float) -> np.ndarray:
        # box= erlaubt Subpixel-Ausschnitte → ruckelfreie Bewegung
        return np.asarray(img.resize((W, H), Image.BILINEAR, box=box_at(t)))

    return VideoClip(frame_function=frame, duration=duration)


def render(folder: Path, scenes: list[dict], words: list[dict], audio: Path, force: bool) -> Path:
    final = folder / "final.mp4"
    inputs = [folder / "subtitles.ass", audio, folder / "scenes.json"] + sorted((folder / "images").glob("scene_*.jpg"))
    if not needs_run([final], inputs, force):
        info(f"Vorhanden, übersprungen: {final.name}")
        return final

    audio_len = media_duration(audio)
    times = scene_times(scenes, words, audio_len)
    clips = []
    for i, (scene, (start, end)) in enumerate(zip(scenes, times)):
        img = folder / "images" / f"scene_{scene['nr']:02d}.jpg"
        clips.append(ken_burns_clip(img, end - start, KB_MOVES[i % len(KB_MOVES)]))
        info(f"Szene {scene['nr']:>2}: {start:5.1f}–{end:5.1f} s ({end - start:.1f} s)")
        if end - start > 9:
            warn(f"Szene {scene['nr']} ist lang ({end - start:.1f} s) – evtl. Satz kürzen.")

    raw = folder / "_roh.mp4"
    video = concatenate_videoclips(clips).with_audio(AudioFileClip(str(audio)))
    info("Rendere Video (Ken Burns) … das dauert ein paar Minuten.")
    video.write_videofile(
        str(raw), fps=config.FPS, codec="libx264", audio_codec="aac", audio_bitrate="192k",
        preset="veryfast", ffmpeg_params=["-crf", "16", "-pix_fmt", "yuv420p"], logger="bar",
    )
    video.close()

    info("Brenne Untertitel ein …")
    vf = "ass=subtitles.ass"
    fonts_dir = config.BASE_DIR / "fonts"   # optional: eigene .ttf/.otf hier ablegen
    if fonts_dir.is_dir():
        vf += f":fontsdir={os.path.relpath(fonts_dir, folder)}"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", raw.name, "-vf", vf,
         "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-pix_fmt", "yuv420p",
         "-c:a", "copy", "-movflags", "+faststart", final.name],
        cwd=folder, check=True,
    )
    raw.unlink()
    return final


def check_length(video: Path) -> float:
    secs = media_duration(video)
    if secs <= 60:
        warn(f"ACHTUNG: Video ist nur {secs:.1f} s lang – muss über 60 s liegen! "
             "Skript verlängern und ab Stimme neu erzeugen (--neu stimme).")
    elif secs < config.MIN_SECONDS:
        warn(f"Video ist {secs:.1f} s lang – sehr knapp über 60 s.")
    elif secs > config.MAX_SECONDS + 1:
        warn(f"Video ist {secs:.1f} s lang (Ziel: bis {config.MAX_SECONDS} s).")
    else:
        info(f"Länge OK: {secs:.1f} s ✓")
    return secs
