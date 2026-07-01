'use strict';

const STATIC_CACHE = 'krypto-dashboard-static-v1';
const MARKET_CACHE = 'krypto-dashboard-market-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== STATIC_CACHE && k !== MARKET_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch { return; }

  // CoinGecko-Marktdaten: Netzwerk zuerst, letzte bekannte Antwort als Offline-Fallback.
  if (url.hostname === 'api.coingecko.com' && url.pathname.includes('/coins/markets')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(MARKET_CACHE).then((cache) => cache.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.open(MARKET_CACHE).then((cache) => cache.match(request)))
    );
    return;
  }

  // Eigene statische Assets: Cache zuerst, sonst Netzwerk (und dabei nachcachen).
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
        }
        return res;
      }).catch(() => cached))
    );
  }
});
