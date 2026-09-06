const CACHE_VERSION = 'pocketsplit-cache-v3';
const ASSETS = [
    '/pocketsplit/',
    '/pocketsplit/index.html',
    '/pocketsplit/manifest.json',
    '/pocketsplit/js/app.js'
    // Add your CSS and image paths here
];

self.addEventListener('install', (e) => {
    self.skipWaiting();
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
            // Offline fallback logic here if needed
        })
    );
});
