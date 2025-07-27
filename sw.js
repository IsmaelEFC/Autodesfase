const CACHE_NAME = 'dvr-check-v4';
const ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/ejemplo-correcto.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return Promise.all(
          ASSETS.map(asset => {
            return fetch(asset, { cache: 'no-store' })
              .then(response => {
                if (!response.ok) throw new Error(`Failed: ${asset}`);
                return cache.put(asset, response);
              })
              .catch(err => {
                console.warn('Failed to cache:', asset, err);
                return Promise.resolve();
              });
          })
        )
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.map(key => 
        key !== CACHE_NAME ? caches.delete(key) : null
      ))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Excluir streams de cámara y CDNs externos
  if (event.request.url.includes('mediaStream') || 
      event.request.url.includes('cdn.jsdelivr.net')) {
    return fetch(event.request);
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request))
  );
});