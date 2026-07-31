// NGACCUL PWA Service Worker for Offline Resilience and Sync Support
const CACHE_NAME = 'ngaccul-pwa-v3.1'; // bumped: forces old cached index.html/app-shell to be cleared on next deploy
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/branding/logo.svg',
  '/manifest.json'
];

// Install Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching static app shell resources');
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
         console.warn('[SW] Resource pre-caching failed', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate Service Worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[SW] Clearing legacy redundant cache:', name);
            return caches.delete(name);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Assets Interceptor
// IMPORTANT: navigation requests (the HTML shell) and index.html itself must be
// NETWORK-FIRST. They are not filename-hashed, so a cache-first strategy on them
// permanently freezes the app on whatever version was first installed on a device,
// even after new code is deployed. Hashed static assets (JS/CSS bundles with content
// hashes in their filenames) remain cache-first below — this is what still lets
// agents in low/no-network areas keep using the app fully offline, since once a
// hashed bundle is cached it never needs to be re-fetched (its content never changes
// under that filename), while index.html always tries the network first so everyone
// gets pointed at the latest deployed bundle whenever they do have connectivity.
self.addEventListener('fetch', (event) => {
  // Let browser bypass for non-GET or chrome-extension URLs
  if (event.request.method !== 'GET' || event.request.url.includes('chrome-extension')) {
    return;
  }

  const url = new URL(event.request.url);
  const isNavigation =
    event.request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname === '/index.html';

  if (isNavigation) {
    // Network-first for the app shell: try to fetch the latest index.html when
    // online; if offline, fall back to whatever was last cached so the app still
    // opens with no connectivity.
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse.clone()));
          return networkResponse;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Cache-first for everything else (hashed JS/CSS bundles, images, etc.) —
  // this is what powers full offline usability for agents in poor-network areas.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        // Cache dynamic assets if same origin
        if (event.request.url.startsWith(self.location.origin)) {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        }
        return networkResponse;
      }).catch(() => {
        // Return index.html for SPA route offline fallbacks
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('/');
        }
      });
    })
  );
});

// Sync triggers
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-offline-queue') {
    console.log('[SW] Connectivity restored. Triggering offline sync task queues');
    // Notify clients to call processOfflineSyncQueue
    self.clients.matchAll().then(clients => {
       clients.forEach(client => {
          client.postMessage({ type: 'SYNC_TRIGGER_ACTIVE' });
       });
    });
  }
});
