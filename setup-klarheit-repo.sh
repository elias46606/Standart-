#!/usr/bin/env bash
# ============================================================
# Klarheit als EIGENES Repo mit eigener Live-Adresse anlegen.
# Im Codespace ausführen:   bash setup-klarheit-repo.sh
# Ergebnis: neues Repo "klarheit" + Live unter
#           https://<dein-name>.github.io/klarheit/
# Voraussetzung: gh (GitHub-CLI) ist im Codespace eingeloggt.
# ============================================================
set -uo pipefail
die() { echo ""; echo "✗ $1"; exit 1; }
REPO_NAME="klarheit"

echo "============================================="
echo " Klarheit · eigenes Repo + Live-Seite anlegen"
echo "============================================="

command -v gh >/dev/null 2>&1 || die "gh (GitHub-CLI) nicht gefunden – im Codespace sollte es vorhanden sein."
gh auth status >/dev/null 2>&1 || die "gh ist nicht eingeloggt. Bitte 'gh auth login' ausführen."

# 1) Klarheit-Quellcode aus dem sharp-einstein-Branch holen
echo "→ Hole Klarheit-Code aus dem sharp-einstein-Branch …"
git fetch origin claude/sharp-einstein-tf9ppn -q || die "Konnte den Branch nicht laden."
WORK="$(mktemp -d)"
git archive origin/claude/sharp-einstein-tf9ppn klarheit-src \
  | tar -x -C "$WORK" --strip-components=1 || die "Konnte klarheit-src nicht extrahieren."
cd "$WORK" || die "Arbeitsordner fehlt."
[ -f package.json ] || die "package.json nicht gefunden – Quellcode unvollständig."

# 2) Pages-Deploy-Workflow hinzufügen (baut Vite, veröffentlicht /dist)
mkdir -p .github/workflows
cat > .github/workflows/deploy.yml <<'YAML'
name: Klarheit auf GitHub Pages veröffentlichen

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build-deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - uses: actions/configure-pages@v5
        with:
          enablement: true
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deployment
        uses: actions/deploy-pages@v4
YAML

# 3) Git-Repo initialisieren
git init -b main -q
git add -A
git -c user.email="noreply@github.com" -c user.name="Klarheit Setup" commit -q -m "Klarheit: Social-Media-Schulprojekt + Pages-Deploy"

# 4) Neues GitHub-Repo anlegen und pushen
echo "→ Lege GitHub-Repo \"$REPO_NAME\" an und pushe …"
gh repo create "$REPO_NAME" --public --source=. --remote=origin --push \
  || die "Repo-Erstellung fehlgeschlagen. Existiert '$REPO_NAME' schon? Dann anderen Namen waehlen (REPO_NAME im Skript)."

USER="$(gh api user --jq .login 2>/dev/null)"
echo ""
echo "============================================="
echo " ✅ FERTIG!"
echo " Repo:  https://github.com/$USER/$REPO_NAME"
echo " Live:  https://$USER.github.io/$REPO_NAME/  (in 1-2 Min)"
echo ""
echo " Der Deploy-Workflow laeuft jetzt automatisch."
echo " Status: https://github.com/$USER/$REPO_NAME/actions"
echo "============================================="
