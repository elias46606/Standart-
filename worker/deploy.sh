#!/usr/bin/env bash
# ============================================================
# WM-2026 Push-Worker: komplettes Setup mit EINEM Befehl.
#   cd worker && bash deploy.sh
# Erledigt: Anmeldung → KV anlegen → VAPID-Schlüssel → Deploy →
# Secret → Worker-URL automatisch in index.html eintragen.
# Anmeldung wahlweise per Browser (wrangler login) oder per
# Umgebungsvariable CLOUDFLARE_API_TOKEN (iPad/Codespaces).
# ============================================================
set -uo pipefail
cd "$(dirname "$0")"

die() { echo ""; echo "✗ $1"; exit 1; }

echo "================================================"
echo " WM 2026 · Push-Worker Setup"
echo "================================================"

# ---- 1) Anmeldung per Cloudflare-API-Token ----
# Token säubern (versehentliche Leerzeichen/Zeilenumbrüche aus dem Einfügen)
CLOUDFLARE_API_TOKEN="$(printf '%s' "${CLOUDFLARE_API_TOKEN:-}" | tr -d '[:space:]')"
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo ""
  echo "Bitte deinen Cloudflare-API-Token einfügen und Enter drücken."
  echo "(dash.cloudflare.com → Profil → API Tokens → Create Token →"
  echo " Vorlage 'Edit Cloudflare Workers')"
  printf "Token: "
  read -r CLOUDFLARE_API_TOKEN
  CLOUDFLARE_API_TOKEN="$(printf '%s' "$CLOUDFLARE_API_TOKEN" | tr -d '[:space:]')"
fi
export CLOUDFLARE_API_TOKEN
[ -n "$CLOUDFLARE_API_TOKEN" ] || die "Kein Token eingegeben."

WHO=$(npx wrangler whoami 2>&1)
if printf '%s' "$WHO" | grep -qiE "not authenticated|necessary to set|invalid|unauthor"; then
  echo "$WHO"
  die "Token ungültig oder ohne Workers-Rechte. Neues Token mit Vorlage 'Edit Cloudflare Workers' erstellen."
fi
echo "✓ Bei Cloudflare angemeldet."

# ---- 2) KV-Namespace anlegen und Binding in wrangler.toml schreiben ----
if grep -q "kv_namespaces" wrangler.toml; then
  echo "✓ KV-Namespace bereits konfiguriert."
else
  echo "→ Lege KV-Namespace an …"
  OUT=$(npx wrangler kv namespace create KV 2>&1)
  echo "$OUT"
  ID=$(echo "$OUT" | grep -oE '[0-9a-f]{32}' | head -1)

  if [ -z "$ID" ]; then
    echo "→ Existiert evtl. schon – suche bestehenden Namespace …"
    LIST=$(npx wrangler kv namespace list 2>/dev/null)
    ID=$(printf '%s' "$LIST" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const a=JSON.parse(s);const x=a.find(n=>/(^|[-_])KV$/.test(n.title)||/wm2026/.test(n.title));console.log(x?x.id:'')}catch(e){console.log('')}})" 2>/dev/null)
  fi

  if [ -z "$ID" ]; then
    die "Konnte keine KV-ID ermitteln. Bitte die Ausgabe oben kopieren und mir schicken."
  fi
  printf '\n[[kv_namespaces]]\nbinding = "KV"\nid = "%s"\n' "$ID" >> wrangler.toml
  echo "✓ KV-Namespace: $ID"
fi

# ---- 3) VAPID-Schlüssel erzeugen, Public in wrangler.toml ----
PRIV=""
if grep -q "HIER_VAPID_PUBLIC_KEY_EINTRAGEN" wrangler.toml; then
  echo "→ Erzeuge VAPID-Schlüsselpaar …"
  KEYS=$(node generate-vapid-keys.mjs raw) || die "Schlüsselerzeugung fehlgeschlagen."
  PUB=$(echo "$KEYS" | sed -n '1p')
  PRIV=$(echo "$KEYS" | sed -n '2p')
  [ -n "$PUB" ] || die "Kein Public Key erzeugt."
  sed -i.bak "s|HIER_VAPID_PUBLIC_KEY_EINTRAGEN|$PUB|" wrangler.toml && rm -f wrangler.toml.bak
  echo "✓ VAPID Public Key eingetragen."
else
  echo "✓ VAPID Public Key bereits eingetragen."
fi

# ---- 4) Deployen (legt den Worker an) ----
echo "→ Deploye Worker …"
DEPLOY_OUT=$(npx wrangler deploy 2>&1)
echo "$DEPLOY_OUT"
echo "$DEPLOY_OUT" | grep -q "Uploaded\|Deployed\|Published\|workers.dev" || die "Deploy fehlgeschlagen (Ausgabe oben)."

# ---- 5) Privaten VAPID-Schlüssel als Secret setzen ----
if ! npx wrangler secret list 2>/dev/null | grep -q "VAPID_PRIVATE_KEY"; then
  if [ -n "$PRIV" ]; then
    echo "→ Setze VAPID_PRIVATE_KEY als Secret …"
    printf '%s' "$PRIV" | npx wrangler secret put VAPID_PRIVATE_KEY || die "Secret setzen fehlgeschlagen."
    echo "✓ Secret gesetzt."
  else
    echo "⚠ VAPID_PRIVATE_KEY-Secret fehlt und kein neuer Schlüssel vorhanden."
    echo "  Einmal 'node generate-vapid-keys.mjs' ausführen und Public Key in"
    echo "  wrangler.toml ersetzen, dann 'npx wrangler secret put VAPID_PRIVATE_KEY'."
  fi
else
  echo "✓ VAPID_PRIVATE_KEY-Secret bereits gesetzt."
fi

# ---- 6) Worker-URL in die App eintragen ----
URL=$(echo "$DEPLOY_OUT" | grep -oE 'https://[a-zA-Z0-9.-]+\.workers\.dev' | head -1)
if [ -n "$URL" ]; then
  sed -i.bak "s|const PUSH_WORKER_URL = \"[^\"]*\"|const PUSH_WORKER_URL = \"$URL\"|" ../index.html
  rm -f ../index.html.bak
  echo ""
  echo "================================================"
  echo " ✅ FERTIG! Worker läuft: $URL"
  echo "    PUSH_WORKER_URL in index.html wurde gesetzt."
  echo ""
  echo " Letzter Schritt – Änderungen veröffentlichen:"
  echo "    cd .. && git add -A && git commit -m 'Push-Worker verbunden' && git push"
  echo ""
  echo " Dann auf dem Gerät: App zum Home-Bildschirm hinzufügen"
  echo " → Einstellungen → 🔔 Push einschalten."
  echo "================================================"
else
  echo "⚠ Worker-URL nicht gefunden. Bitte die URL aus der Ausgabe oben"
  echo "  manuell in index.html bei PUSH_WORKER_URL eintragen."
fi
