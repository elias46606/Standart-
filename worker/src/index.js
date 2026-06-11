/* WM-2026 Push-Worker (Cloudflare Free-Tier)
   - POST /subscribe    Push-Subscription speichern (KV)
   - POST /unsubscribe  Subscription löschen
   - GET  /vapid        öffentlichen VAPID-Schlüssel liefern
   - Cron (alle 2 Min.) WM-Spiele prüfen (TheSportsDB, Liga 4429) und
                        bei Toren, Roten Karten, Aufstellung, Anpfiff,
                        Abpfiff Web-Push an alle Subscriptions senden.
   Zustand pro Spiel liegt in KV ("state:<idEvent>") → keine Doppel-Pushes. */

import { sendWebPush } from "./webpush.js";

const TSDB_KEY = "123";
const TSDB = `https://www.thesportsdb.com/api/v1/json/${TSDB_KEY}`;
const LEAGUE_ID = "4429";          // FIFA World Cup
const LINEUP_WINDOW_MIN = 75;      // Aufstellung ab 75 Min. vor Anpfiff prüfen

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...CORS } });

async function endpointKey(endpoint) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return "sub:" + [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

    if (url.pathname === "/vapid" && req.method === "GET") {
      return json({ publicKey: env.VAPID_PUBLIC_KEY });
    }

    if (url.pathname === "/subscribe" && req.method === "POST") {
      const sub = await req.json().catch(() => null);
      if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
        return json({ error: "Ungültige Subscription" }, 400);
      }
      await env.KV.put(await endpointKey(sub.endpoint), JSON.stringify(sub));
      return json({ ok: true });
    }

    if (url.pathname === "/unsubscribe" && req.method === "POST") {
      const { endpoint } = await req.json().catch(() => ({}));
      if (endpoint) await env.KV.delete(await endpointKey(endpoint));
      return json({ ok: true });
    }

    return json({ error: "Not found" }, 404);
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(checkMatches(env));
  },
};

// ---------------- Spielprüfung (Cron) ----------------

async function checkMatches(env) {
  const today = new Date().toISOString().slice(0, 10);
  const res = await fetch(`${TSDB}/eventsday.php?d=${today}&l=${LEAGUE_ID}`);
  if (!res.ok) return;
  const events = (await res.json())?.events || [];
  if (!events.length) return;

  const pushes = [];

  for (const ev of events) {
    const stateKey = "state:" + ev.idEvent;
    const prev = JSON.parse(await env.KV.get(stateKey) || "{}");
    const next = { ...prev };
    const title = `${ev.strHomeTeam} vs. ${ev.strAwayTeam}`;
    const mins = ev.strTimestamp ? (new Date(ev.strTimestamp) - Date.now()) / 60000 : Infinity;
    const live = isLive(ev), done = isFinished(ev);

    // 📋 Aufstellung verfügbar (Zeitfenster vor Anpfiff)
    if (!prev.lineupNotified && mins > 0 && mins <= LINEUP_WINDOW_MIN) {
      if (await hasLineup(ev.idEvent)) {
        pushes.push({ title: "📋 Aufstellung ist da!", body: title, tag: "lineup-" + ev.idEvent });
        next.lineupNotified = true;
      }
    }

    // ▶️ Anpfiff
    if (live && !prev.kickoffNotified) {
      pushes.push({ title: "▶️ Anpfiff!", body: title, tag: "ko-" + ev.idEvent });
      next.kickoffNotified = true;
    }

    // ⚽ Tor (Score-Änderung)
    const score = `${ev.intHomeScore ?? ""}:${ev.intAwayScore ?? ""}`;
    if (live && prev.score && score !== prev.score && score !== ":") {
      pushes.push({ title: "⚽ TOOOR!", body: scoreText(ev), tag: "goal-" + ev.idEvent + "-" + score });
    }
    if (score !== ":") next.score = score;

    // 🟥 Rote Karten (Timeline, nur live)
    if (live) {
      const reds = await countRedCards(ev.idEvent);
      if (reds > (prev.redCards || 0)) {
        pushes.push({ title: "🟥 Rote Karte!", body: title, tag: "red-" + ev.idEvent + "-" + reds });
      }
      next.redCards = Math.max(reds, prev.redCards || 0);
    }

    // ⏹ Abpfiff
    if (done && !prev.finishedNotified) {
      pushes.push({ title: "⏹ Abpfiff", body: "Endstand: " + scoreText(ev), tag: "ft-" + ev.idEvent });
      next.finishedNotified = true;
    }

    if (JSON.stringify(next) !== JSON.stringify(prev)) {
      // Zustand 3 Tage aufheben, danach räumt KV selbst auf
      await env.KV.put(stateKey, JSON.stringify(next), { expirationTtl: 259200 });
    }
  }

  if (pushes.length) await broadcast(env, pushes);
}

const scoreText = ev =>
  `${ev.strHomeTeam} ${ev.intHomeScore ?? 0} : ${ev.intAwayScore ?? 0} ${ev.strAwayTeam}`;
const isLive = ev => ["1H", "2H", "HT", "ET", "LIVE", "P"]
  .some(x => (ev.strStatus || "").toUpperCase().includes(x));
const isFinished = ev => ["FT", "AET", "PEN", "FINISHED", "MATCH FINISHED"]
  .some(x => (ev.strStatus || "").toUpperCase().includes(x));

async function hasLineup(idEvent) {
  try {
    const res = await fetch(`${TSDB}/lookuplineup.php?id=${idEvent}`);
    if (!res.ok) return false;
    return ((await res.json())?.lineup || []).length > 0;
  } catch { return false; }
}

async function countRedCards(idEvent) {
  try {
    const res = await fetch(`${TSDB}/lookuptimeline.php?id=${idEvent}`);
    if (!res.ok) return 0;
    return ((await res.json())?.timeline || []).filter(t =>
      (t.strTimeline || "").toLowerCase().includes("card") &&
      (t.strTimelineDetail || "").toLowerCase().includes("red")).length;
  } catch { return 0; }
}

// Alle Subscriptions benachrichtigen; tote (404/410) löschen
async function broadcast(env, pushes) {
  let cursor;
  do {
    const page = await env.KV.list({ prefix: "sub:", cursor });
    cursor = page.list_complete ? null : page.cursor;
    for (const k of page.keys) {
      const sub = JSON.parse(await env.KV.get(k.name) || "null");
      if (!sub) continue;
      for (const p of pushes) {
        try {
          const res = await sendWebPush(env, sub, { ...p, url: "./" });
          if (res.status === 404 || res.status === 410) {
            await env.KV.delete(k.name);
            break;
          }
        } catch { /* einzelner Fehlschlag: nächste Runde versucht es erneut */ }
      }
    }
  } while (cursor);
}
