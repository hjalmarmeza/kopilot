const CACHE = 'kopilot-v10.8-layout-fix';
const FILES = [
    './',
    './index.html?v=10.8',
    './style.css?v=10.8',
    './app.js?v=10.8',
    './icon.png',
    './manifest.json'
];

self.addEventListener('install', e => {
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
});

self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(k => Promise.all(k.map(key => {
        if (key !== CACHE) return caches.delete(key);
    }))));
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    if (e.request.url.includes('script.google.com')) return;
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
