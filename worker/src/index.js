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
const REMIND_MIN = 30;             // Erinnerung 30 Min. vor Anpfiff (Lieblingsteam)

const normTeam = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");

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

    // Test-Push an die eigene Subscription (vom Test-Knopf in der App)
    if (url.pathname === "/test" && req.method === "POST") {
      const sub = await req.json().catch(() => null);
      if (!sub?.endpoint) return json({ error: "Keine Subscription" }, 400);
      try {
        const res = await sendWebPush(env, sub, {
          title: "🔔 Test-Benachrichtigung",
          body: "Push funktioniert – du bist startklar für die WM! ⚽",
          tag: "test", url: "./",
        });
        return json({ ok: res.ok, status: res.status });
      } catch (e) {
        return json({ error: String(e.message || e) }, 500);
      }
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

  const pushes = [];      // an alle Abonnenten
  const reminders = [];   // nur an Abonnenten, deren Lieblingsteam spielt

  for (const ev of events) {
    const stateKey = "state:" + ev.idEvent;
    const prev = JSON.parse(await env.KV.get(stateKey) || "{}");
    const next = { ...prev };
    const title = `${ev.strHomeTeam} vs. ${ev.strAwayTeam}`;
    const mins = ev.strTimestamp ? (new Date(ev.strTimestamp) - Date.now()) / 60000 : Infinity;
    const live = isLive(ev), done = isFinished(ev);

    // ⏰ Erinnerung kurz vor Anpfiff – nur für Lieblingsteam-Abonnenten
    if (!prev.remindNotified && mins > 0 && mins <= REMIND_MIN && !live && !done) {
      reminders.push({
        teams: [normTeam(ev.strHomeTeam), normTeam(ev.strAwayTeam)],
        payload: { title: "⏰ Gleich geht's los!", body: `${title} – Anpfiff in ca. ${Math.max(1, Math.round(mins))} Min.`, tag: "remind-" + ev.idEvent },
      });
      next.remindNotified = true;
    }

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

  if (pushes.length || reminders.length) await broadcast(env, pushes, reminders);
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

// Subscriptions benachrichtigen; tote (404/410) löschen.
// pushes -> an alle; reminders -> nur an Abos, deren favTeam mitspielt.
async function broadcast(env, pushes, reminders = []) {
  let cursor;
  do {
    const page = await env.KV.list({ prefix: "sub:", cursor });
    cursor = page.list_complete ? null : page.cursor;
    for (const k of page.keys) {
      const sub = JSON.parse(await env.KV.get(k.name) || "null");
      if (!sub) continue;
      const fav = normTeam(sub.favTeam);
      const queue = pushes.concat(
        reminders.filter(r => fav && r.teams.includes(fav)).map(r => r.payload));
      let dead = false;
      for (const p of queue) {
        try {
          const res = await sendWebPush(env, sub, { ...p, url: "./" });
          if (res.status === 404 || res.status === 410) { dead = true; break; }
        } catch { /* einzelner Fehlschlag: nächste Runde versucht es erneut */ }
      }
      if (dead) await env.KV.delete(k.name);
    }
  } while (cursor);
}
