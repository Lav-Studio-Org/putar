// Offline cache: serve cached files instantly, refresh them in the background.
// Bump CACHE on every release and list every new file in ASSETS (docs/10-deploy-pwa.md).
const CACHE = 'putar-v1';
const ASSETS = ['./', 'index.html', 'style.css', 'js/engine.js', 'js/meta.js', 'js/audio.js', 'js/ads-config.js', 'js/native.js', 'js/ads.js', 'js/game.js', 'fonts/fredoka-latin.woff2', 'icon.svg', 'icon-180.png', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(e.request);
      const net = fetch(e.request)
        .then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; })
        .catch(() => hit);
      return hit || net;
    })
  );
});
