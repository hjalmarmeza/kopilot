const CACHE = 'kopilot-circles-v5.0';
const FILES = [
    './index.html?v=5.0',
    './style.css?v=5.0',
    './app.js?v=5.0',
    './manifest.json'
];

self.addEventListener('install', e => {
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
});

self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(k => Promise.all(k.map(key => key !== CACHE ? caches.delete(key) : null))));
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    if (e.request.url.includes('script.google.com')) { e.respondWith(fetch(e.request)); return; }
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
