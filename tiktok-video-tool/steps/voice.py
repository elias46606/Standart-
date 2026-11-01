"""Schritt 4: Text-to-Speech mit Wort-Zeitstempeln.

Ausgabe:
- audio.wav  (oder audio.mp3 bei ElevenLabs)
- words.json [{"word": "Eine", "start": 0.05, "end": 0.31}, …]

Engines:
- ElevenLabs: liefert Zeitstempel pro Buchstabe → daraus Wörter.
- Piper (kostenlos, offline): wird Satz für Satz erzeugt → Satzgrenzen exakt.
  Innerhalb eines Satzes werden die Wortzeiten anhand der Lautanzahl
  (Phoneme) verteilt. Das ist für Untertitel in der Praxis genau genug.
"""

import base64
import wave
from pathlib import Path

import numpy as np
import requests

import config
from steps.common import info, media_duration, needs_run, read_json, split_sentences, warn, write_json


def audio_path(folder: Path) -> Path | None:
    for name in ("audio.mp3", "audio.wav"):
        if (folder / name).exists():
            return folder / name
    return None


def choose_engine(wish: str) -> str:
    if wish == "elevenlabs":
        if not (config.ELEVENLABS_API_KEY and config.ELEVENLABS_VOICE_ID):
            raise SystemExit("ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID fehlen in .env.")
        return "elevenlabs"
    if wish == "piper":
        return "piper"
    # "auto" bzw. "de": ElevenLabs, wenn konfiguriert, sonst Piper
    return "elevenlabs" if config.ELEVENLABS_API_KEY and config.ELEVENLABS_VOICE_ID else "piper"


# ---------------------------------------------------------------- ElevenLabs
def tts_elevenlabs(text: str, folder: Path) -> list[dict]:
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{config.ELEVENLABS_VOICE_ID}/with-timestamps"
    resp = requests.post(
        url,
        headers={"xi-api-key": config.ELEVENLABS_API_KEY, "Content-Type": "application/json"},
        json={
            "text": text,
            "model_id": config.ELEVENLABS_MODEL,
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
        },
        params={"output_format": "mp3_44100_128"},
        timeout=180,
    )
    if resp.status_code != 200:
        raise SystemExit(f"ElevenLabs-Fehler {resp.status_code}: {resp.text[:300]}")
    data = resp.json()
    (folder / "audio.mp3").write_bytes(base64.b64decode(data["audio_base64"]))

    # Buchstaben-Zeitstempel zu Wörtern zusammenfassen
    al = data["alignment"]   # bezieht sich auf den Originaltext (mit Ziffern)
    words, cur, start, end = [], "", 0.0, 0.0
    for ch, s, e in zip(al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]):
        if ch.isspace():
            if cur:
                words.append({"word": cur, "start": start, "end": end})
                cur = ""
            continue
        if not cur:
            start = s
        cur += ch
        end = e
    if cur:
        words.append({"word": cur, "start": start, "end": end})
    return words


# ---------------------------------------------------------------- Piper
def _speech_bounds(samples: np.ndarray, rate: int) -> tuple[float, float]:
    """Findet Anfang/Ende der Sprache in einem Satz (Stille am Rand ignorieren)."""
    level = np.abs(samples.astype(np.float32)) / 32768
    loud = np.where(level > 0.02)[0]
    if len(loud) == 0:
        return 0.0, len(samples) / rate
    return loud[0] / rate, loud[-1] / rate


def tts_piper(text: str, folder: Path) -> list[dict]:
    from piper import PiperVoice, SynthesisConfig  # erst hier laden (dauert etwas)

    if not config.PIPER_MODEL.exists():
        raise SystemExit(
            f"Piper-Stimme nicht gefunden: {config.PIPER_MODEL}\n"
            "Siehe README → 'Piper-Stimme herunterladen'."
        )
    voice = PiperVoice.load(str(config.PIPER_MODEL))
    syn = SynthesisConfig(length_scale=config.PIPER_LENGTH_SCALE)
    rate = voice.config.sample_rate
    pause = np.zeros(int(0.25 * rate), dtype=np.int16)    # Pause zwischen Sätzen

    chunks, words, t = [], [], 0.0
    for sentence in split_sentences(text):
        parts = list(voice.synthesize(sentence, syn_config=syn))
        audio = np.concatenate([p.audio_int16_array for p in parts])
        phonemes = [ph for p in parts for ph in (p.phonemes or [])]

        # Gewicht pro Wort = Anzahl Laute (Fallback: Buchstaben)
        sent_words = sentence.split()
        ph_words = [w for w in "".join(phonemes).split(" ") if w]
        if len(ph_words) == len(sent_words):
            weights = [len(w) for w in ph_words]
        else:
            weights = [len(w) for w in sent_words]

        s0, s1 = _speech_bounds(audio, rate)
        total, acc = sum(weights), 0
        for w, weight in zip(sent_words, weights):
            ws = s0 + (s1 - s0) * acc / total
            acc += weight
            we = s0 + (s1 - s0) * acc / total
            words.append({"word": w, "start": round(t + ws, 3), "end": round(t + we, 3)})

        chunks += [audio, pause]
        t += (len(audio) + len(pause)) / rate

    with wave.open(str(folder / "audio.wav"), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(np.concatenate(chunks).tobytes())
    return words


# ---------------------------------------------------------------- Schritt
def make_voice(folder: Path, engine_wish: str, force: bool) -> None:
    script_path, words_path = folder / "script.txt", folder / "words.json"
    existing = audio_path(folder)
    outputs = [words_path] + ([existing] if existing else [folder / "audio.wav"])
    if not needs_run(outputs, [script_path], force):
        info(f"Vorhanden, übersprungen: {existing.name}, words.json")
        report_duration(folder)
        return

    for old in ("audio.mp3", "audio.wav"):
        (folder / old).unlink(missing_ok=True)

    text = " ".join(script_path.read_text(encoding="utf-8").split())  # Absätze → ein Fluss
    engine = choose_engine(engine_wish)
    info(f"Stimme wird erzeugt mit: {engine} …")
    words = tts_elevenlabs(text, folder) if engine == "elevenlabs" else tts_piper(text, folder)
    write_json(words_path, words)
    info(f"{len(words)} Wörter mit Zeitstempeln gespeichert.")
    report_duration(folder)


def report_duration(folder: Path) -> float:
    secs = media_duration(audio_path(folder))
    info(f"Audiolänge: {secs:.1f} s")
    if secs < config.MIN_SECONDS:
        warn(f"Audio ist kürzer als {config.MIN_SECONDS} s! Skript verlängern "
             "(dann --neu stimme) oder langsamer sprechen lassen (PIPER_LENGTH_SCALE).")
    elif secs > config.MAX_SECONDS:
        warn(f"Audio ist länger als {config.MAX_SECONDS} s.")
    return secs


def load_words(folder: Path) -> list[dict]:
    return read_json(folder / "words.json")
