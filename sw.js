const CACHE_NAME = 'copiloto-v1';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    'https://fonts.googleapis.com/icon?family=Material+Icons+Round',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (e) => {
    // Para la API (script.google.com), NO usar caché, siempre red
    if (e.request.url.includes('script.google.com')) {
        return fetch(e.request);
    }

    e.respondWith(
        caches.match(e.request).then((res) => res || fetch(e.request))
    );
});
