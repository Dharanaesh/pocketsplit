const CACHE_VERSION = 'pocketsplit-cache-v4';
const ASSETS = [
    '/pocketsplit/',
    '/pocketsplit/index.html',
    '/pocketsplit/manifest.json',
    '/pocketsplit/style.css',
    '/pocketsplit/app.js'
];

self.addEventListener('install', (e) => {
    self.skipWaiting(); // Force activation to prevent stale versions
    e.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_VERSION) return caches.delete(key);
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((response) => {
            return response || fetch(e.request);
        }).catch(() => {
            // Optional offline fallback
        })
    );
});
