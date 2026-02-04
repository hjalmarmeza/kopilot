const CACHE = 'kopilot-smart-sync-v9.0';
const FILES = [
    './index.html?v=8.0',
    './style.css?v=8.2',
    './app.js?v=9.0',
    './manifest.json',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&display=swap',
    'https://fonts.googleapis.com/icon?family=Material+Icons+Round'
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
