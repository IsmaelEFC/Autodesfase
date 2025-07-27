const CACHE_NAME = 'dvr-check-v3';
const ASSETS = [
  { url: '/', type: 'html' },
  { url: '/index.html', type: 'html' },
  { url: '/app.js', type: 'script' },
  { url: '/manifest.json', type: 'json' },
  { url: '/icons/icon-192x192.png', type: 'image' },
  { url: '/icons/icon-512x512.png', type: 'image' },
  { url: '/ejemplo-correcto.jpg', type: 'image' }
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cacheando recursos estáticos');
        return Promise.all(
          ASSETS.map(asset => {
            return fetch(asset.url)
              .then(res => {
                if (!res.ok) throw new Error(`Failed: ${asset.url}`);
                console.log('Cached:', asset.url);
                return cache.put(asset.url, res);
              })
              .catch(err => {
                console.warn('Cache skip:', asset.url, err);
                return Promise.resolve(); // Continue with other assets
              });
          })
        );
      })
      .then(() => {
        console.log('Todos los recursos han sido cacheados');
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('Error durante la instalación del Service Worker:', err);
        throw err; // Re-throw to ensure the installation fails visibly
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Eliminando caché antigua:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  // Activar el service worker inmediatamente
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Estrategia: Cache primero, luego red
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Intentar con la red si no está en caché
        const fetchPromise = fetch(event.request).then(response => {
          // Si es una respuesta exitosa, actualizar la caché
          if (response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        }).catch(() => {
          // Si falla la red y no hay respuesta en caché, mostrar una página de error
          if (event.request.mode === 'navigate') {
            return caches.match('/offline.html');
          }
        });
        
        // Devolver la respuesta en caché o la de la red
        return cachedResponse || fetchPromise;
      })
  );
});