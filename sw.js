/* Service Worker für die WM-2026-Seite.
   Strategie:
   - App-Shell (HTML, Icons, Manifest) beim Install cachen → offline startbar.
   - Navigationsanfragen: Netzwerk zuerst, bei Offline aus Cache (index.html).
   - Spieldaten (openfootball) & Flaggen: stale-while-revalidate → schnell,
     aktualisiert sich im Hintergrund, funktioniert offline mit letztem Stand. */

const VERSION = "wm2026-v1";
const SHELL = "shell-" + VERSION;
const DATA = "data-" + VERSION;

const SHELL_ASSETS = [
  "./",
  "index.html",
  "manifest.json",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(SHELL).then(c => c.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== SHELL && k !== DATA).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

function isData(url) {
  return /githubusercontent\.com|jsdelivr\.net|flagcdn\.com|api\.espn\.com/.test(url);
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = req.url;

  // Navigation: Netzwerk zuerst, Fallback auf gecachte index.html
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("index.html").then(r => r || caches.match("./")))
    );
    return;
  }

  // Spieldaten & Flaggen: stale-while-revalidate
  if (isData(url)) {
    event.respondWith(
      caches.open(DATA).then(async cache => {
        const cached = await cache.match(req);
        const network = fetch(req).then(res => {
          if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
          return res;
        }).catch(() => null);
        return cached || network || new Response("", { status: 504 });
      })
    );
    return;
  }

  // Rest (Shell, Fonts): Cache zuerst, sonst Netzwerk
  event.respondWith(
    caches.match(req).then(r => r || fetch(req).catch(() => r))
  );
});
