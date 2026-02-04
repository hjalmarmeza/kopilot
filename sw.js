const CACHE_NAME = 'kopilot-premium-v3.2'; // BUMP VERSION TO FORCE UPDATE
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    'https://fonts.googleapis.com/icon?family=Material+Icons+Round',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap'
];

self.addEventListener('install', (e) => {
    self.skipWaiting(); // Force activate immediately
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) return caches.delete(key);
                })
            );
        })
    );
    self.clients.claim(); // Take control immediately
});

self.addEventListener('fetch', (e) => {
    // Si es llamada a la API de Google, NO CACHEAR (Network Only)
    if (e.request.url.includes('script.google.com')) {
        e.respondWith(fetch(e.request));
        return;
    }

    // Para el resto (archivos estáticos), Cache First
    e.respondWith(
        caches.match(e.request).then((res) => res || fetch(e.request))
    );
});
