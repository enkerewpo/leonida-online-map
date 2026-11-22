// Keeps every map tile the reader has seen, so coming back to a place draws it at once instead of asking GitHub Pages
// again (which only lets the browser keep files for ten minutes). Tiles older than a week are still shown, then
// refreshed in the background. Nothing else is cached.
const CACHE = 'tiles-512-v2';
const WEEK = 7 * 24 * 3600 * 1000;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function fetchAndStore(cache, req) {
  const res = await fetch(req);
  if (res.ok) {
    const headers = new Headers(res.headers);
    headers.set('sw-time', String(Date.now()));
    const body = await res.clone().blob();
    await cache.put(req, new Response(body, { status: 200, headers }));
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.includes('/tiles/')) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(e.request);
    if (hit) {
      if (Date.now() - Number(hit.headers.get('sw-time') || 0) > WEEK) e.waitUntil(fetchAndStore(cache, e.request).catch(() => {}));
      return hit;
    }
    return fetchAndStore(cache, e.request);
  })());
});
