const CACHE_NAME = 'kopilot-bento-v4.0-final'; // NEW NAME
const ASSETS = [
    './index.html?v=4.0',
    './style.css?v=4.0',
    './app.js?v=4.0',
    './manifest.json'
];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys().then(keys => Promise.all(
        keys.map(k => k !== CACHE_NAME ? caches.delete(k) : null)
    )));
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    if (e.request.url.includes('script.google.com')) {
        e.respondWith(fetch(e.request));
        return;
    }
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
