/* Pixelarium service worker: app-shell caching so the studio installs and runs offline. */
const VERSION = 'pixelarium-v2';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      await cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))).catch(() => {});
      // Precache the hashed build assets referenced by the shell so the very
      // first visit is enough to work offline.
      try {
        const response = await fetch('/index.html', { cache: 'reload' });
        const html = await response.text();
        await cache.put('/index.html', new Response(html, { headers: response.headers }));
        const urls = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
        await Promise.all(urls.map((url) => cache.add(url).catch(() => {})));
      } catch {
        /* First install may be offline; runtime caching will fill in the rest. */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

const isAsset = (url) => /^\/(assets|icons)\//.test(url.pathname);

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request, { ignoreVary: true, ignoreSearch: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
      if (request.mode === 'navigate') {
        const html = await response.clone().text();
        const urls = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
        await Promise.all(urls.map((url) => cache.add(url).catch(() => {})));
      }
    }
    return response;
  } catch {
    const hit =
      (await cache.match(request, { ignoreVary: true })) ||
      (await cache.match('/index.html', { ignoreVary: true })) ||
      (await cache.match('/', { ignoreVary: true }));
    if (hit) return hit;
    throw new Error('Offline and no cached response');
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js') return;

  if (isAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(request, { ignoreVary: true, ignoreSearch: true });
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => hit);
      return hit || network;
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
