// Cache-first service worker so the game runs offline once installed.
const VERSION = 'metamorph-20261013-000105';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './js/main.js', './js/util.js', './js/gfx.js', './js/fx.js', './js/audio.js', './js/input.js', './js/hud.js',
  './js/stages/base.js', './js/stages/title.js', './js/stages/ttt.js', './js/stages/c4.js', './js/stages/snake.js',
  './js/stages/asteroids.js', './js/stages/galaga.js', './js/stages/breakout.js', './js/stages/pong.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Network first (so updates land), falling back to cache when offline.
  e.respondWith(
    fetch(e.request).then((r) => {
      const copy = r.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
