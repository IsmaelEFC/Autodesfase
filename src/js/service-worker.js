// Service Worker Version
const VERSION = 'v5';
const CACHE_NAME = `timecam-${VERSION}`;
const DYNAMIC_CACHE = 'dynamic-cache-v1';
const OFFLINE_PAGE = '/offline.html';

// Enviar mensaje a todas las pestañas abiertas
const broadcastMessage = (type, data) => {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({ type, data });
    });
  });
};

// Escuchar mensajes del cliente
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Cache strategies
const CACHE_STRATEGIES = {
  CACHE_FIRST: 'CACHE_FIRST',
  NETWORK_FIRST: 'NETWORK_FIRST',
  STALE_WHILE_REVALIDATE: 'STALE_WHILE_REVALIDATE',
  NETWORK_ONLY: 'NETWORK_ONLY',
  CACHE_ONLY: 'CACHE_ONLY'
};

// Precached assets
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
  '/src/css/style.css',
  '/src/js/app.js',
  '/src/js/modules/camera.js',
  '/src/js/modules/geolocation.js',
  '/src/js/modules/ui.js',
  '/src/js/modules/ocr.js',
  '/src/js/modules/notifications.js',
  '/src/js/modules/captura-db.js',
  '/src/js/modules/error-handler.js',
  '/src/assets/icons/icon-192x192.png',
  '/src/assets/icons/icon-512x512.png',
  '/src/assets/icons/maskable_icon_x192.png',
  '/src/assets/icons/maskable_icon_x512.png'
];

// Routes with specific cache strategies
const ROUTES = [
  { 
    pattern: new RegExp('^https://unpkg\.com/tesseract\.js@5\.1\.0/'),
    strategy: CACHE_STRATEGIES.STALE_WHILE_REVALIDATE,
    cacheName: 'tesseract-cache'
  },
  {
    pattern: new RegExp('^/api/'),
    strategy: CACHE_STRATEGIES.NETWORK_FIRST,
    cacheName: 'api-cache',
    options: {
      networkTimeoutSeconds: 3,
      cacheableResponse: {
        statuses: [0, 200]
      }
    }
  },
  {
    pattern: new RegExp('\\.(?:png|jpg|jpeg|svg|gif|webp)$'),
    strategy: CACHE_STRATEGIES.CACHE_FIRST,
    cacheName: 'image-cache',
    options: {
      cacheableResponse: {
        statuses: [0, 200]
      },
      expiration: {
        maxEntries: 50,
        maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
      }
    }
  }
];

/**
 * Cache First Strategy
 * Returns cached response if available, falls back to network
 */
const cacheFirst = async (request, cacheName = CACHE_NAME) => {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  // If we have a cached response, update cache in background
  if (cachedResponse) {
    const fetchPromise = fetch(request).then(networkResponse => {
      if (isResponseValid(networkResponse)) {
        return cache.put(request, networkResponse);
      }
    }).catch(() => {
      // Ignore fetch errors for background updates
    });
    
    // Return cached response immediately
    return cachedResponse;
  }
  
  // If not in cache, fetch from network
  return fetchAndCache(request, cache, cacheName);
};

/**
 * Network First Strategy
 * Tries network first, falls back to cache if offline
 */
const networkFirst = async (request, cacheName = CACHE_NAME, options = {}) => {
  const { networkTimeoutSeconds = 3 } = options;
  
  try {
    // Try to fetch from network with timeout
    const networkPromise = fetch(request);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Network timeout')), networkTimeoutSeconds * 1000)
    );
    
    const networkResponse = await Promise.race([networkPromise, timeoutPromise]);
    
    // If valid response, update cache
    if (isResponseValid(networkResponse)) {
      const cache = await caches.open(cacheName);
      await cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // If network fails, try cache
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // If nothing in cache, return offline page for navigation requests
    if (request.mode === 'navigate') {
      return caches.match(OFFLINE_PAGE);
    }
    
    throw error;
  }
};

/**
 * Stale While Revalidate Strategy
 * Returns cached response immediately, then updates cache in background
 */
const staleWhileRevalidate = async (request, cacheName = CACHE_NAME) => {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  // Always make a network request to update the cache
  const fetchPromise = fetch(request)
    .then(networkResponse => {
      if (isResponseValid(networkResponse)) {
        return cache.put(request, networkResponse);
      }
    })
    .catch(() => {
      // Ignore fetch errors for background updates
    });
  
  // Return cached response if available, otherwise wait for network
  return cachedResponse || (await fetchPromise) || fetch(request);
};

/**
 * Check if a response is valid
 */
const isResponseValid = (response) => {
  return response && 
         response.status >= 200 && 
         response.status < 300 && 
         response.type === 'basic';
};

// Service Worker Installation
self.addEventListener('install', (event) => {
  console.log(`[Service Worker] Installing new version: ${VERSION}`);
  
  // Skip waiting to activate the new service worker immediately
  self.skipWaiting();
  
  // Cache all precache assets
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => {
        console.log('[Service Worker] Pre-caching complete');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[Service Worker] Installation failed:', error);
      })
  );
});

// Service Worker Activation
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating new version:', VERSION);
  
  // Limpiar caches antiguos
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE) {
            console.log('[Service Worker] Removing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      ).then(() => {
        // Notificar a los clientes que hay una nueva versión
        broadcastMessage('NEW_VERSION_AVAILABLE', { version: VERSION });
        clients.forEach(client => {
          client.postMessage({
            type: 'SERVICE_WORKER_UPDATE',
            version: VERSION
          });
        });
      });
      
      console.log(`[Service Worker] Activated version: ${VERSION}`);
    })
  );
});

/**
 * Fetch and cache helper with better error handling and options support
 */
const fetchAndCache = async (request, options = {}, cacheName = DYNAMIC_CACHE) => {
  try {
    const response = await fetch(request, options);
    
    if (isResponseValid(response)) {
      const responseToCache = response.clone();
      const cache = await caches.open(cacheName);
      await cache.put(request, responseToCache);
    }
    
    return response;
  } catch (error) {
    console.error('Fetch and cache failed:', error);
    throw error;
  }
};

// Fetch Event Handler
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests and non-http(s) requests
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }
  
  // Skip browser extensions and chrome-extension
  if (request.url.startsWith('chrome-extension:') || 
      request.url.includes('extension') ||
      request.url.includes('sockjs-node') ||
      request.url.includes('safari-extension')) {
    return;
  }
  
  // Handle navigation requests with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // If we got a valid response, cache it and return
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(DYNAMIC_CACHE)
              .then(cache => cache.put(request, responseToCache));
          }
          return response;
        })
        .catch(() => caches.match(OFFLINE_PAGE))
    );
    return;
  }
  
  // For API calls, use network first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache API responses for offline use
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(DYNAMIC_CACHE)
              .then(cache => cache.put(request, responseToCache));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }
  
  // For images, use cache first with network fallback
  if (request.destination === 'image') {
    event.respondWith(
      caches.match(request)
        .then(response => {
          // Return cached image if available
          if (response) {
            // Update cache in the background
            fetchAndCache(request, null, DYNAMIC_CACHE).catch(() => {});
            return response;
          }
          
          // Otherwise fetch from network and cache
          return fetchAndCache(request, null, DYNAMIC_CACHE)
            .catch(() => caches.match(OFFLINE_PAGE));
        })
    );
    return;
  }
  
  // For other static assets, use cache first with network fallback
  event.respondWith(
    caches.match(request)
      .then(response => response || fetchAndCache(request))
      .catch(() => caches.match(OFFLINE_PAGE))
  );
});

// Message Event Handler
self.addEventListener('message', (event) => {
  if (!event.data) return;
  
  switch (event.data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'GET_VERSION':
      event.ports[0].postMessage({ version: VERSION });
      break;
      
    case 'CLEAR_CACHE':
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      }).then(() => {
        console.log('[Service Worker] All caches cleared');
        if (event.ports[0]) {
          event.ports[0].postMessage({ success: true });
        }
      }).catch(error => {
        console.error('[Service Worker] Error clearing caches:', error);
        if (event.ports[0]) {
          event.ports[0].postMessage({ success: false, error: error.message });
        }
      });
      break;
  }
});

// Background Sync for failed requests
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-failed-requests') {
    console.log('[Service Worker] Background sync for failed requests');
    // Implement retry logic for failed requests
  }
});

// Push Notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  const data = event.data.json();
  const { title, body, icon, badge, vibrate } = data;
  
  event.waitUntil(
    self.registration.showNotification(title || 'TimeCam', {
      body,
      icon: icon || '/src/assets/icons/icon-192x192.png',
      badge: badge || '/src/assets/icons/icon-192x192.png',
      vibrate: vibrate || [200, 100, 200],
      data: data.data || {}
    })
  );
});

// Notification Click Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const urlToOpen = new URL('/', self.location.origin).href;
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // Check if there's already a window/tab open with the app
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      
      // If no existing window, open a new one
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});