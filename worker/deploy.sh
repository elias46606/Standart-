#!/usr/bin/env bash
# ============================================================
# WM-2026 Push-Worker: komplettes Setup mit EINEM Befehl.
#   cd worker && bash deploy.sh
# Erledigt: Login → KV anlegen → VAPID-Schlüssel → Secret →
# Deploy → Worker-URL automatisch in index.html eintragen.
# Einzige Interaktion: einmal im Browser bei Cloudflare "Allow".
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

echo "================================================"
echo " WM 2026 · Push-Worker Setup"
echo "================================================"

# ---- 1) Login (öffnet Browser, nur 'Allow' klicken) ----
if npx wrangler whoami >/dev/null 2>&1; then
  echo "✓ Bereits bei Cloudflare angemeldet."
else
  echo "→ Browser öffnet sich: bei Cloudflare einloggen und 'Allow' klicken …"
  npx wrangler login
fi

# ---- 2) KV-Namespace anlegen und ID eintragen ----
if grep -q "HIER_KV_NAMESPACE_ID_EINTRAGEN" wrangler.toml; then
  echo "→ Lege KV-Namespace an …"
  OUT=$(npx wrangler kv namespace create KV 2>&1 || true)
  ID=$(echo "$OUT" | grep -oE '[0-9a-f]{32}' | head -1)
  if [ -z "$ID" ]; then
    # Existiert vielleicht schon von einem früheren Lauf → nachschlagen
    ID=$(npx wrangler kv namespace list 2>/dev/null | grep -B2 -A2 "wm2026-push-KV" | grep -oE '[0-9a-f]{32}' | head -1)
  fi
  if [ -z "$ID" ]; then
    echo "✗ Konnte keine KV-ID ermitteln. Ausgabe von wrangler:"; echo "$OUT"; exit 1
  fi
  sed -i.bak "s/HIER_KV_NAMESPACE_ID_EINTRAGEN/$ID/" wrangler.toml && rm -f wrangler.toml.bak
  echo "✓ KV-Namespace: $ID"
else
  echo "✓ KV-Namespace bereits eingetragen."
fi

# ---- 3) VAPID-Schlüssel erzeugen, Public eintragen, Private als Secret ----
if grep -q "HIER_VAPID_PUBLIC_KEY_EINTRAGEN" wrangler.toml; then
  echo "→ Erzeuge VAPID-Schlüsselpaar …"
  KEYS=$(node generate-vapid-keys.mjs raw)
  PUB=$(echo "$KEYS" | sed -n '1p')
  PRIV=$(echo "$KEYS" | sed -n '2p')
  sed -i.bak "s|HIER_VAPID_PUBLIC_KEY_EINTRAGEN|$PUB|" wrangler.toml && rm -f wrangler.toml.bak
  printf '%s' "$PRIV" | npx wrangler secret put VAPID_PRIVATE_KEY
  echo "✓ VAPID-Schlüssel gesetzt (privater Schlüssel nur als Cloudflare-Secret)."
else
  echo "✓ VAPID-Schlüssel bereits eingetragen."
fi

# ---- 4) Deployen ----
echo "→ Deploye Worker …"
DEPLOY_OUT=$(npx wrangler deploy 2>&1) && echo "$DEPLOY_OUT" || { echo "$DEPLOY_OUT"; exit 1; }
URL=$(echo "$DEPLOY_OUT" | grep -oE 'https://[a-zA-Z0-9.-]+\.workers\.dev' | head -1)

# ---- 5) Worker-URL in die App eintragen ----
if [ -n "$URL" ]; then
  sed -i.bak "s|const PUSH_WORKER_URL = \"[^\"]*\"|const PUSH_WORKER_URL = \"$URL\"|" ../index.html
  rm -f ../index.html.bak
  echo ""
  echo "================================================"
  echo " ✅ FERTIG! Worker läuft: $URL"
  echo "    PUSH_WORKER_URL in index.html wurde gesetzt."
  echo ""
  echo " Letzter Schritt – Änderungen veröffentlichen:"
  echo "    git add -A && git commit -m 'Push-Worker verbunden' && git push"
  echo ""
  echo " Dann auf dem Handy: App zum Home-Bildschirm"
  echo " hinzufügen → Einstellungen → 🔔 Push einschalten."
  echo "================================================"
else
  echo "⚠ Worker-URL nicht in der Deploy-Ausgabe gefunden."
  echo "  Bitte die URL aus der Ausgabe oben manuell in index.html"
  echo "  bei PUSH_WORKER_URL eintragen."
fi
