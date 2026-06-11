# WM-2026 Push-Worker (Cloudflare)

Sendet echte Web-Push-Benachrichtigungen (Tore, Rote Karten, Aufstellung,
Anpfiff, Abpfiff) an alle Abonnenten der WM-App — auch bei geschlossener App.
Läuft komplett im Cloudflare Free-Tier (Workers + KV + Cron).

## Einmalige Einrichtung

Voraussetzung: Node.js installiert. Alle Befehle in diesem Ordner (`worker/`) ausführen.

### 1. Bei Cloudflare anmelden

```bash
npx wrangler login
```

Öffnet den Browser → bei Cloudflare einloggen → „Allow" klicken.
(Prüfen mit `npx wrangler whoami`.)

### 2. KV-Namespace anlegen

```bash
npx wrangler kv namespace create KV
```

Die Ausgabe enthält eine Zeile wie `id = "abc123..."` —
diese ID in `wrangler.toml` bei `[[kv_namespaces]]` statt
`HIER_KV_NAMESPACE_ID_EINTRAGEN` eintragen.

### 3. VAPID-Schlüssel erzeugen

```bash
node generate-vapid-keys.mjs
```

- **VAPID_PUBLIC_KEY** → in `wrangler.toml` unter `[vars]` eintragen
- **VAPID_PRIVATE_KEY** → als Secret setzen (wird gleich abgefragt):

```bash
npx wrangler secret put VAPID_PRIVATE_KEY
```

Der private Schlüssel gehört **niemals** in wrangler.toml oder ins Git!

### 4. Deployen

```bash
npx wrangler deploy
```

Die Ausgabe zeigt die Worker-URL, z.B.
`https://wm2026-push.<dein-name>.workers.dev`

### 5. App verbinden

In `index.html` die Konstante `PUSH_WORKER_URL` (oben bei der Konfiguration)
auf die Worker-URL aus Schritt 4 setzen, committen, deployen.

Danach: App öffnen → Profil → Einstellungen → „Push-Benachrichtigungen"
einschalten. Fertig.

## Testen

Push direkt vom Worker auslösen (ohne auf ein Spiel zu warten):
den Cron-Handler lokal antesten geht mit

```bash
npx wrangler dev --test-scheduled
# dann in zweitem Terminal:
curl "http://localhost:8787/__scheduled?cron=*/2+*+*+*+*"
```

Logs des deployten Workers ansehen:

```bash
npx wrangler tail
```

## Hinweise

- **iPhone**: Web-Push funktioniert ab iOS 16.4, aber **nur wenn die App
  zum Homescreen hinzugefügt** wurde (Teilen → „Zum Home-Bildschirm").
- **Cron**: prüft alle 2 Minuten (`*/2 * * * *`) die heutigen Spiele der
  FIFA-WM (TheSportsDB Liga 4429). Zustand pro Spiel liegt in KV
  (`state:<idEvent>`, läuft nach 3 Tagen automatisch ab) → keine Doppel-Pushes.
- **Subscriptions** liegen in KV als `sub:<sha256(endpoint)>`. Tote
  Subscriptions (HTTP 404/410 vom Push-Dienst) werden automatisch entfernt.
- **CORS** ist auf `*` gestellt. Optional härten: in `src/index.js` bei
  `CORS` statt `*` die GitHub-Pages-Origin eintragen, z.B.
  `https://<name>.github.io`.
