const CACHE_NAME = 'pocketsplit-pwa-v3';
const ASSETS = ['./', './index.html', './style.css', './app.js', './manifest.json'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS))); });
self.addEventListener('fetch', (e) => { e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request))); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.map((x) => x !== CACHE_NAME ? caches.delete(x) : null)))); });
