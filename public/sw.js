/**
 * Ateliê de Colagem service worker: keeps the editor working without internet.
 *
 * - On install it downloads every file of the current build (the list is written in at
 *   build time by the plugin in vite.config.ts), so one visit is enough to work offline.
 * - Pages are network-first: when online you always get the latest version.
 * - Everything else (hashed scripts, styles, fonts, icons) is cache-first.
 *
 * Only the app's own files are cached. Images the user opens never pass through here:
 * they are read straight from the device into memory.
 */
const BUILD_ID = 'dev';
const PRECACHE = /* precache */ ['./'];
const CACHE = `atelie-${BUILD_ID}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // one file failing (a flaky connection) should not cost the whole offline copy
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('atelie-') && k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

/** Store a good same-origin response for later offline use. */
function keep(request, response) {
  if (response.ok && response.type === 'basic') {
    const copy = response.clone();
    void caches.open(CACHE).then((cache) => cache.put(request, copy));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => keep(request, response))
        .catch(() =>
          caches
            .match(request, { ignoreSearch: true, ignoreVary: true })
            .then((hit) => hit || caches.match('./'))
            .then((hit) => hit || Response.error()),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((response) => keep(request, response))),
  );
});
