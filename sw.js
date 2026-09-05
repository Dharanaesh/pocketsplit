const CACHE_NAME = 'pocketsplit-pwa-v2';
const ASSETS = ['./', './index.html', './style.css', './app.js', './manifest.json'];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', (e) => {
    e.respondWith(caches.match(e.request).then((response) => response || fetch(e.request)));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys().then((keys) => {
        return Promise.all(keys.map((key) => {
            if (key !== CACHE_NAME) return caches.delete(key);
        }));
    }));
});
