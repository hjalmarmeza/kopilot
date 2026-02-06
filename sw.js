const CACHE = 'kopilot-v10.5-final';
const FILES = [
    './',
    './index.html?v=10.5',
    './style.css?v=10.5',
    './app.js?v=10.5',
    './icon.png',
    './manifest.json'
];

self.addEventListener('install', e => {
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
});

self.addEventListener('activate', e => {
    // Elimina cualquier caché anterior para FORZAR la actualización
    e.waitUntil(caches.keys().then(k => Promise.all(k.map(key => {
        if (key !== CACHE) return caches.delete(key);
    }))));
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    if (e.request.url.includes('script.google.com')) return;

    // Estrategia: Cache-First para velocidad, pero con actualización forzada arriba
    e.respondWith(
        caches.match(e.request).then(r => r || fetch(e.request))
    );
});
