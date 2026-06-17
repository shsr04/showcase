const APP_CACHE = "text-miner-app-v3";
const TEXT_CACHE = "text-miner-texts-v1";
const APP_ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "search-worker.js",
  "manifest.webmanifest",
  "icon.svg",
  "corpus/catalog.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(APP_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => ![APP_CACHE, TEXT_CACHE].includes(key))
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin) return;

  if (url.pathname.includes("/text-miner/corpus/texts/")) {
    event.respondWith(cacheFirst(event.request, TEXT_CACHE));
    return;
  }

  if (url.pathname.includes("/text-miner/")) {
    event.respondWith(staleWhileRevalidate(event.request, APP_CACHE));
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || fresh;
}
