const CACHE = 'kopilot-v10.2';
const FILES = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './icon.png',
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
    // API calls always network
    if (e.request.url.includes('script.google.com')) {
        return;
    }

    // For other files, try cache then network
    e.respondWith(
        caches.match(e.request).then(r => {
            return r || fetch(e.request).then(response => {
                return caches.open(CACHE).then(cache => {
                    cache.put(e.request, response.clone());
                    return response;
                });
            });
        })
    );
});
