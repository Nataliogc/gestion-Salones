const CACHE_NAME = 'mesachef-matrix-v9.14';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/base.css',
    './manifest.json',
    // Add other core files here if needed
];

// Instalar el Service Worker y guardar en caché los recursos estáticos
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Forzar activación inmediata
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS_TO_CACHE))
    );
});

// Activar el Service Worker y limpiar cachés antiguas
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Borrando caché antigua:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Tomar control de todos los clientes
    );
});

// Estrategia de Carga
self.addEventListener('fetch', (event) => {
    // Ignorar peticiones no-GET o esquemas no soportados
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith('http')) return;

    const isHTML = event.request.headers.get('accept').includes('text/html');

    if (isHTML) {
        // Para HTML: Network First (Intenta red, si falla usa caché)
        // Esto asegura que el usuario siempre vea la última versión de la estructura de la página
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Si la respuesta es válida, la guardamos en caché para uso offline futuro
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME)
                        .then((cache) => cache.put(event.request, responseToCache));
                    return response;
                })
                .catch(() => {
                    return caches.match(event.request);
                })
        );
    } else {
        // Para otros recursos (CSS, JS, Imágenes): Stale-While-Revalidate
        // Carga rápida desde caché, pero actualiza en segundo plano
        event.respondWith(
            caches.match(event.request)
                .then((cachedResponse) => {
                    const fetchPromise = fetch(event.request).then((networkResponse) => {
                        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                            const responseToCache = networkResponse.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => cache.put(event.request, responseToCache));
                        }
                        return networkResponse;
                    }).catch((err) => {
                        // Si falla red y no hay caché, no podemos hacer mucho más para recursos secundarios
                        console.log('Fallo fetch segundo plano:', err);
                    });

                    return cachedResponse || fetchPromise;
                })
        );
    }
});