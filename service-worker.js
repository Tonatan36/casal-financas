const CACHE_NAME = 'financas-casal-v5';
const APP_SHELL = [
    './',
    './index.html',
    './app.js',
    './manifest.webmanifest',
    './icons/icon.svg',
    './icons/icon-192.png',
    './icons/icon-512.png'
];
const EXTERNAL_SCRIPT_HOSTS = new Set(['cdn.tailwindcss.com', 'cdn.jsdelivr.net']);

function updateCache(request, response) {
    return caches.open(CACHE_NAME)
        .then(cache => cache.put(request, response.clone()))
        .catch(error => console.error('Erro ao atualizar cache do PWA:', error));
}

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(key => key.startsWith('financas-casal-') && key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') {
        return;
    }

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) {
        if (request.destination !== 'script' || !EXTERNAL_SCRIPT_HOSTS.has(url.hostname)) {
            return;
        }

        event.respondWith(
            fetch(request)
                .then(response => {
                    if (response.ok || response.type === 'opaque') {
                        return updateCache(request, response).then(() => response);
                    }
                    return response;
                })
                .catch(() => caches.match(request).then(cached => {
                    if (!cached) {
                        throw new Error(`Script indisponível offline: ${url.hostname}`);
                    }
                    return cached;
                }))
        );
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(response => {
                    if (response.ok) {
                        return updateCache('./index.html', response).then(() => response);
                    }
                    return response;
                })
                .catch(() => caches.match('./index.html'))
        );
        return;
    }

    event.respondWith(
        caches.match(request)
            .then(cached => cached || fetch(request).then(response => {
                if (response.ok) {
                    return updateCache(request, response).then(() => response);
                }
                return response;
            }))
    );
});
