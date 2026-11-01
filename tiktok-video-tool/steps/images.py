"""Schritt 5: Ein Bild pro Szene – Stockfoto (Pexels) oder KI-Bild (OpenAI).

Alle Bilder werden auf 9:16 zugeschnitten und etwas größer als das Video
gespeichert (1296x2304), damit beim Ken-Burns-Zoom nichts unscharf wird.
Schlägt ein Bild fehl, gibt es ein Platzhalterbild – der Lauf bricht nicht ab.
"""

import base64
import io
import random
import textwrap
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFont, ImageOps

import config
from steps.common import info, needs_run, warn

IMG_W, IMG_H = int(config.WIDTH * 1.2), int(config.HEIGHT * 1.2)
STYLE = ("Hochformat 9:16, fotorealistisch, dokumentarischer Look, filmisches Licht, "
         "hohe Detailtiefe, keine Schrift, keine Buchstaben, kein Text, kein Wasserzeichen.")


def fit_9_16(img: Image.Image) -> Image.Image:
    """Mittig auf 9:16 zuschneiden und auf Arbeitsgröße skalieren."""
    return ImageOps.fit(img.convert("RGB"), (IMG_W, IMG_H), Image.LANCZOS, centering=(0.5, 0.45))


def placeholder(scene: dict) -> Image.Image:
    """Dunkler Verlauf mit Szenennummer und Bildidee (für Tests / Fehlerfälle)."""
    img = Image.new("RGB", (IMG_W, IMG_H))
    draw = ImageDraw.Draw(img)
    hue = (scene["nr"] * 47) % 255
    for y in range(IMG_H):
        f = y / IMG_H
        draw.line([(0, y), (IMG_W, y)], fill=(int(20 + hue * 0.3 * (1 - f)), int(25 + 40 * f), int(60 + hue * 0.4 * f)))
    try:
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", 60)
    except OSError:
        font = ImageFont.load_default()
    text = f"Szene {scene['nr']}\n\n" + "\n".join(textwrap.wrap(scene["bild_prompt"], 28))
    draw.multiline_text((IMG_W / 2, IMG_H * 0.3), text, font=font, fill=(230, 230, 230), anchor="ma", align="center")
    return img


# ---------------------------------------------------------------- Pexels
def from_pexels(scene: dict, used_ids: set) -> tuple[Image.Image, str]:
    resp = requests.get(
        "https://api.pexels.com/v1/search",
        headers={"Authorization": config.PEXELS_API_KEY},
        params={"query": scene["suchbegriff"], "orientation": "portrait", "per_page": 15, "size": "large"},
        timeout=30,
    )
    resp.raise_for_status()
    photos = [p for p in resp.json().get("photos", []) if p["id"] not in used_ids]
    if not photos:
        raise RuntimeError(f"keine Pexels-Treffer für '{scene['suchbegriff']}'")
    photo = random.choice(photos[:8])   # zufällig, damit "neu" auch neue Bilder bringt
    used_ids.add(photo["id"])
    data = requests.get(photo["src"]["large2x"], timeout=60).content
    credit = f"Szene {scene['nr']}: Foto von {photo['photographer']} auf Pexels – {photo['url']}"
    return Image.open(io.BytesIO(data)), credit


# ---------------------------------------------------------------- OpenAI
_openai = None


def from_openai(scene: dict) -> tuple[Image.Image, str]:
    global _openai
    if _openai is None:
        from openai import OpenAI
        _openai = OpenAI(api_key=config.OPENAI_API_KEY)
    result = _openai.images.generate(
        model=config.OPENAI_IMAGE_MODEL,
        prompt=f"{scene['bild_prompt']}\n\n{STYLE}",
        size="1024x1536",                 # Hochformat
        quality=config.OPENAI_IMAGE_QUALITY,
        n=1,
    )
    data = base64.b64decode(result.data[0].b64_json)
    return Image.open(io.BytesIO(data)), f"Szene {scene['nr']}: KI-generiert ({config.OPENAI_IMAGE_MODEL})"


# ---------------------------------------------------------------- Schritt
def make_images(folder: Path, scenes: list[dict], source: str, force: bool, only: set[int] | None = None) -> None:
    """only = Szenennummern, die neu erzeugt werden sollen (None = alle)."""
    img_dir = folder / "images"
    img_dir.mkdir(exist_ok=True)
    scenes_path = folder / "scenes.json"

    if source == "stock" and not config.PEXELS_API_KEY:
        warn("PEXELS_API_KEY fehlt → Platzhalterbilder.")
        source = "platzhalter"
    if source == "ki" and not config.OPENAI_API_KEY:
        warn("OPENAI_API_KEY fehlt → Platzhalterbilder.")
        source = "platzhalter"

    # Bilder, die nicht mehr zu einer Szene gehören (z. B. weniger Szenen), entfernen
    valid = {f"scene_{s['nr']:02d}.jpg" for s in scenes}
    for old in img_dir.glob("scene_*.jpg"):
        if old.name not in valid:
            old.unlink()

    credits_path = img_dir / "credits.txt"
    credits = credits_path.read_text(encoding="utf-8").splitlines() if credits_path.exists() else []
    used_ids: set = set()
    made = 0
    for scene in scenes:
        out = img_dir / f"scene_{scene['nr']:02d}.jpg"
        forced = force and (only is None or scene["nr"] in only)
        if not needs_run([out], [scenes_path], forced):
            continue
        try:
            if source == "stock":
                img, credit = from_pexels(scene, used_ids)
            elif source == "ki":
                img, credit = from_openai(scene)
            else:
                img, credit = placeholder(scene), f"Szene {scene['nr']}: Platzhalter"
        except Exception as exc:  # noqa: BLE001 – ein Bild darf nie den ganzen Lauf stoppen
            warn(f"Szene {scene['nr']}: Bild fehlgeschlagen ({exc}) → Platzhalter")
            img, credit = placeholder(scene), f"Szene {scene['nr']}: Platzhalter"
        fit_9_16(img).save(out, quality=92)
        credits = [c for c in credits if not c.startswith(f"Szene {scene['nr']}:")] + [credit]
        made += 1
        info(f"Bild {scene['nr']:>2}/{len(scenes)}: {credit}")

    credits.sort(key=lambda c: int(c.split()[1].rstrip(":")))
    credits_path.write_text("\n".join(credits) + "\n", encoding="utf-8")
    if made == 0:
        info("Alle Bilder vorhanden, übersprungen.")
