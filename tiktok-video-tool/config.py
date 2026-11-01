"""Zentrale Einstellungen. Alle Keys kommen aus der .env-Datei, nie aus dem Code."""

import os
from pathlib import Path

from dotenv import load_dotenv

# Projektordner = Ordner, in dem diese Datei liegt
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def env(name: str, default: str = "") -> str:
    """Liest eine Einstellung aus der Umgebung / .env (leere Werte = default)."""
    return os.getenv(name, "").strip() or default


# --- Video ---
WIDTH, HEIGHT = 1080, 1920        # 9:16
FPS = 30
MIN_SECONDS = 61                  # TikTok: muss ÜBER 60 Sekunden liegen
MAX_SECONDS = 90

# --- Skript ---
WORDS_MIN, WORDS_MAX = 170, 230
WORDS_PER_SECOND = 2.6            # grobe Schätzung für deutsche TTS-Stimmen

# --- Szenen ---
SCENE_MIN_WORDS, SCENE_MAX_WORDS = 10, 17   # ≈ 5–8 Sekunden pro Szene

# --- APIs / Modelle ---
CLAUDE_MODEL = env("CLAUDE_MODEL", "claude-opus-5-5")
ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY")
CLAUDE_BASE_URL = env("CLAUDE_BASE_URL", "https://api.anthropic.com")

ELEVENLABS_API_KEY = env("ELEVENLABS_API_KEY")
ELEVENLABS_VOICE_ID = env("ELEVENLABS_VOICE_ID")
ELEVENLABS_MODEL = env("ELEVENLABS_MODEL", "eleven_multilingual_v2")

PIPER_MODEL = BASE_DIR / env("PIPER_MODEL", "models/de_DE-thorsten-high.onnx")
PIPER_LENGTH_SCALE = float(env("PIPER_LENGTH_SCALE", "1.0"))

PEXELS_API_KEY = env("PEXELS_API_KEY")
OPENAI_API_KEY = env("OPENAI_API_KEY")
OPENAI_IMAGE_MODEL = env("OPENAI_IMAGE_MODEL", "gpt-image-1")
OPENAI_IMAGE_QUALITY = env("OPENAI_IMAGE_QUALITY", "medium")

SUBTITLE_FONT = env("SUBTITLE_FONT", "Arial Black")

VIDEOS_DIR = BASE_DIR / "videos"
