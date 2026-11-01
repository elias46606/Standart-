"""Dünne Hülle um die Claude API (anthropic SDK).

- ask_text():  freier Text (z. B. das Skript)
- ask_json():  strukturierte Antwort, direkt als Pydantic-Objekt (z. B. Szenen)

Server-seitige Fallbacks sind aktiviert: Lehnt das Modell eine Anfrage ab
(z. B. Fehlalarm eines Sicherheitsfilters bei Geschichtsthemen), versucht die
API automatisch ein passendes anderes Modell.
"""

import anthropic
from pydantic import BaseModel

import config

_FALLBACK_BETA = "server-side-fallback-2026-07-01"
_client = None


def client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        if not config.ANTHROPIC_API_KEY:
            raise SystemExit("ANTHROPIC_API_KEY fehlt in .env (oder --demo nutzen).")
        # base_url fest setzen: manche Umgebungen (z. B. Cloud-Sessions) setzen
        # ANTHROPIC_BASE_URL auf einen eigenen Proxy – dein Key gehört zur echten API.
        _client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY, base_url=config.CLAUDE_BASE_URL)
    return _client


def _check(response) -> None:
    if response.stop_reason == "refusal":
        raise SystemExit("Claude hat die Anfrage abgelehnt. Thema/Stichpunkte umformulieren.")
    if response.stop_reason == "max_tokens":
        raise SystemExit("Antwort von Claude wurde abgeschnitten (max_tokens).")


def ask_text(system: str, prompt: str) -> str:
    response = client().beta.messages.create(
        model=config.CLAUDE_MODEL,
        max_tokens=16000,
        system=system,
        messages=[{"role": "user", "content": prompt}],
        output_config={"effort": "medium"},
        betas=[_FALLBACK_BETA],
        fallbacks="default",
    )
    _check(response)
    # Nur die Text-Blöcke zusammensetzen (Denk-Blöcke ignorieren)
    return "".join(b.text for b in response.content if b.type == "text").strip()


def ask_json(system: str, prompt: str, schema: type[BaseModel]) -> BaseModel:
    response = client().beta.messages.parse(
        model=config.CLAUDE_MODEL,
        max_tokens=16000,
        system=system,
        messages=[{"role": "user", "content": prompt}],
        output_format=schema,
        output_config={"effort": "medium"},
        betas=[_FALLBACK_BETA],
        fallbacks="default",
    )
    _check(response)
    return response.parsed_output
