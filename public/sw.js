// 全ページとビルド成果物を保存し、オフラインでも開けるようにする

// ?v= はデプロイごとに変わるバージョン
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE_NAME = `vertia-${VERSION}`;
const PAGES = ["/", "/drive", "/sessions", "/sessions/detail", "/settings"];
const ASSETS = ["/manifest.webmanifest"];
// この時間内に応答がなければ保存済みのページを返す
const NAVIGATION_TIMEOUT_MS = 3000;
const STATIC_ASSET_PATTERN = /\/_next\/static\/[^"'\\\s<>()]+/g;

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function precache() {
  const cache = await caches.open(CACHE_NAME);
  const assets = new Set(ASSETS);
  await Promise.all(
    PAGES.map(async (page) => {
      const response = await fetch(page, { cache: "reload" });
      if (!response.ok) throw new Error(`Failed to precache ${page}`);
      const html = await response.clone().text();
      for (const match of html.matchAll(STATIC_ASSET_PATTERN)) assets.add(match[0]);
      await cache.put(page, response);
    }),
  );
  await cache.addAll([...assets]);
}

async function handleNavigation(event, url) {
  // クエリ（記録の ID）を除いたパスで保存する
  const key = url.pathname;
  const network = fetch(event.request).then(async (response) => {
    if (response.ok && PAGES.includes(key)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(key, response.clone());
    }
    return response;
  });
  event.waitUntil(network.catch(() => undefined));

  const cached = await caches.match(key, { cacheName: CACHE_NAME });
  if (!cached) {
    try {
      return await network;
    } catch {
      return (await caches.match("/", { cacheName: CACHE_NAME })) ?? Response.error();
    }
  }

  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NAVIGATION_TIMEOUT_MS));
  const response = await Promise.race([network.catch(() => null), timeout]);
  return response && response.ok ? response : cached;
}

async function cacheFirst(request) {
  const cached = await caches.match(request, { cacheName: CACHE_NAME });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request, { cacheName: CACHE_NAME });
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // RSC の取得は保存しない
  if (request.headers.has("RSC") || url.searchParams.has("_rsc")) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(event, url));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(networkFirst(request));
});
