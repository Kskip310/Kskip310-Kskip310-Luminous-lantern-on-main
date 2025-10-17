const CACHE_NAME = 'luminous-cache-v2'; // Bump version
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

const RUNTIME_CACHE_URLS = [
  'https://aistudiocdn.com/', // Cache CDN assets
  'https://cdn.tailwindcss.com' // Cache tailwind
];

// Install: Pre-cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Pre-caching core assets.');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(self.skipWaiting())
  );
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Serve from cache, fall back to network, and cache new responses
self.addEventListener('fetch', (event) => {
  // Ignore non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const isRuntimeAsset = RUNTIME_CACHE_URLS.some(url => event.request.url.startsWith(url));

  // Strategy: Cache First for runtime assets (like CDNs)
  if (isRuntimeAsset) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          // Return from cache
          return cachedResponse;
        }

        // Fetch from network, then cache
        try {
            const networkResponse = await fetch(event.request);
            if(networkResponse.ok) {
                 cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
        } catch(e) {
            console.error('[Service Worker] Fetch failed for runtime asset:', event.request.url, e);
            // Do not return anything, let the browser handle the error
        }
      })
    );
    return;
  }

  // Strategy: Network First for app shell/main files to get updates quickly
  // but fall back to cache for offline access.
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Update the cache with the new version
        return caches.open(CACHE_NAME).then((cache) => {
          if(networkResponse.ok) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        });
      })
      .catch(() => {
        // If network fails, try to serve from cache
        return caches.match(event.request).then(response => {
            return response || new Response("You are offline.", { status: 503, statusText: "Service Unavailable"});
        });
      })
  );
});
