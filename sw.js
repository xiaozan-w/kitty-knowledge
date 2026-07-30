// Service Worker for 🎀 碎知识 Kitty · 个人知识收纳
const CACHE_VERSION = 'kitty-v2.5.0';
const CACHE_NAME = CACHE_VERSION;
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=8',
  './app.js?v=8',
  './index.standalone.html',
  './assets/bg.jpg',
  './assets/logo.png',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install: cache all static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch((err) => {
        console.log('Cache addAll error:', err);
        // Cache individually to avoid one failure blocking all
        return Promise.all(
          ASSETS.map((url) => cache.add(url).catch(() => null))
        );
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: cache-first for same-origin, network-first for navigation
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip API calls (won't exist on GitHub Pages, but handle gracefully)
  if (url.pathname.startsWith('/api/')) return;

  // For navigation requests: network-first, fallback to cache (for offline)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // For same-origin static assets: cache-first
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        });
      })
    );
  }
  // Cross-origin requests (e.g. CDN for pdf.js) pass through normally
});
