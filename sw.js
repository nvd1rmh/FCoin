/* F Coin cache strategy: stable assets and season artwork are stored separately. */
const STATIC_CACHE_NAME = "fcoin-static-v3";
const SEASON_CACHE_NAME = "fcoin-season-s1-v1";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./home.png",
  "./FCoin.png",
  "./boost.png",
  "./farno-qr.png",
  "./music.mp3",
  "./barg.png"
];
const SEASON_ASSETS = ["./back.png"];

async function cacheOptionalAssets(cacheName, assets) {
  const cache = await caches.open(cacheName);
  await Promise.all(assets.map(async (asset) => {
    try { await cache.add(asset); } catch (_) { /* Optional assets may be absent or temporarily offline. */ }
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await Promise.all([
      cacheOptionalAssets(STATIC_CACHE_NAME, STATIC_ASSETS),
      cacheOptionalAssets(SEASON_CACHE_NAME, SEASON_ASSETS)
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const keep = new Set([STATIC_CACHE_NAME, SEASON_CACHE_NAME]);
    await Promise.all(keys
      .filter((key) => (key.startsWith("fcoin-static-") || key.startsWith("fcoin-season-")) && !keep.has(key))
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || /\/api\//.test(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => {
      return (await caches.match(request)) || (await caches.match("./index.html"));
    }));
    return;
  }

  if (!/\.(png|jpe?g|webp|svg|mp3|woff2?|css|js)$/i.test(url.pathname)) return;
  const isSeasonAsset = /\/back\.png$/i.test(url.pathname);
  const cacheName = isSeasonAsset ? SEASON_CACHE_NAME : STATIC_CACHE_NAME;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response && response.ok) {
      try { await cache.put(request, response.clone()); } catch (_) {}
    }
    return response;
  })());
});
