const CACHE_PREFIX = "zelo-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v3`;
const SHELL_URLS = ["/", "/manifest.webmanifest"];
// Runtime assets expire after 30 days and are capped at 100; offline drafts have no expiry.
const ASSET_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const ASSET_CACHE_MAX_ENTRIES = 100;
const CACHED_AT_HEADER = "X-Zelo-Cached-At";
const CLEANUP_MESSAGE = "CLEANUP_CACHES";

let cleanupPromise;

function withCacheTimestamp(response) {
  const headers = new Headers(response.headers);
  headers.set(CACHED_AT_HEADER, String(Date.now()));
  return new Response(response.clone().body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function withoutCacheTimestamp(response) {
  if (!response.headers.has(CACHED_AT_HEADER)) return response;
  const headers = new Headers(response.headers);
  headers.delete(CACHED_AT_HEADER);
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function cleanupCaches() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    );

    const cache = await caches.open(CACHE_NAME);
    const assets = [];
    for (const request of await cache.keys()) {
      const url = new URL(request.url);
      if (url.origin !== self.location.origin || !url.pathname.startsWith("/assets/")) continue;

      const response = await cache.match(request);
      if (!response) continue;
      const cachedAt = Number(response.headers.get(CACHED_AT_HEADER));
      const hasTimestamp = Number.isFinite(cachedAt) && cachedAt > 0;
      if (hasTimestamp && Date.now() - cachedAt > ASSET_CACHE_MAX_AGE_MS) {
        await cache.delete(request);
        continue;
      }
      assets.push({ request, cachedAt: hasTimestamp ? cachedAt : 0 });
    }

    assets.sort((left, right) => left.cachedAt - right.cachedAt);
    const excess = assets.length - ASSET_CACHE_MAX_ENTRIES;
    await Promise.all(
      assets.slice(0, Math.max(0, excess)).map(({ request }) => cache.delete(request)),
    );
  })().finally(() => {
    cleanupPromise = undefined;
  });
  return cleanupPromise;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of SHELL_URLS) {
        try {
          await cache.add(url);
        } catch {
          // A failed shell request must not prevent the worker from installing.
        }
      }
      await self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(cleanupCaches().then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === CLEANUP_MESSAGE) event.waitUntil(cleanupCaches());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    if (url.pathname !== "/") {
      event.respondWith(fetch(request));
      return;
    }
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          }
          return response;
        })
        .catch(async () => (await caches.match("/")) || Response.error()),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      caches.match(request).then(async (cached) => {
        if (cached) return withoutCacheTimestamp(cached);
        const response = await fetch(request);
        if (response.ok) {
          const cachedResponse = url.pathname.startsWith("/assets/")
            ? withCacheTimestamp(response)
            : response.clone();
          void caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, cachedResponse))
            .catch((error) => console.warn("[pwa] asset cache write failed", error));
        }
        return response;
      }),
    );
  }
});
