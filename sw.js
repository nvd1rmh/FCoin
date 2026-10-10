/* F Coin Telegram Mini App cache.
 * Stable assets (coin/logo/music) survive season changes.
 * Season-specific assets are kept separately and replaced when SEASON_CACHE_NAME changes.
 * API requests and account/game state are never cached.
 */
const STATIC_CACHE_NAME = "fcoin-static-v3";
const SEASON_CACHE_NAME = "fcoin-season-s1-v1"; // Change season/version here, e.g. fcoin-season-s2-v1
const STATIC_ASSETS = [
  "./home.png",
  "./FCoin.png",
  "./boost.png",
  "./farno-qr.png",
  "./music.mp3"
];
const SEASON_ASSETS = [
  "./back.png"
];
const CACHE_PREFIXES = ["fcoin-static-", "fcoin-season-"];

async function cacheOptionalAssets(cacheName, assets) {
  const cache = await caches.open(cacheName);
  await Promise.all(assets.map(async (asset) => {
    try {
      const response = await fetch(asset, { cache: "reload" });
      if (response.ok) await cache.put(asset, response);
    } catch (_) {
      // Keep installation resilient if an optional asset is absent or temporarily offline.
    }
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
    const keep = new Set([STATIC_CACHE_NAME, SEASON_CACHE_NAME]);
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)) && !keep.has(key))
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Always request the app shell and APIs from the server; never cache dynamic game/account data.
  if (request.mode === "navigate" || /\/api\//i.test(url.pathname)) {
    event.respondWith(fetch(request).catch(async () => {
      const cachedShell = await caches.match(request);
      if (cachedShell) return cachedShell;
      return caches.match("./index.html");
    }));
    return;
  }

  if (!/\.(png|jpe?g|webp|svg|mp3|woff2?|css|js)$/i.test(url.pathname)) return;
  event.respondWith((async () => {
    const isSeasonAsset = SEASON_ASSETS.some((asset) => new URL(asset, self.registration.scope).href === url.href);
    const cacheName = isSeasonAsset ? SEASON_CACHE_NAME : STATIC_CACHE_NAME;
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request, { ignoreSearch: false });
    if (cached) return cached;
    const response = await fetch(request);
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  })());
});
