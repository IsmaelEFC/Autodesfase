const CACHE_NAME = 'dvr-checker-v4';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  'https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/tesseract.min.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/worker.min.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js-core@4/tesseract-core.wasm.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js-data@4/eng.traineddata.gz',
  'https://cdn.jsdelivr.net/npm/tesseract.js-data@4/spa.traineddata.gz',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cacheando recursos esenciales');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .catch(err => console.error('Error al cachear:', err))
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