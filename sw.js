/* The installed app opens from cache when the network drops. API calls stay on the network. */
const SHELL = "pos-pwa-3";
const OFFLINE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.add(OFFLINE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function cacheable(url, req) {
  if (req.method !== "GET") return false;
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  return true;
}

function isAsset(url) {
  return /\.(?:js|css|png|jpe?g|webp|gif|svg|ico|woff2?|webmanifest)$/i.test(url.pathname);
}

function store(cache, req, res) {
  if (!res || !res.ok) return;
  const copy = res.clone();
  cache.put(req, copy).catch(() => {});
}

async function fromNetwork(cache, req) {
  const res = await fetch(req);
  store(cache, req, res);
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!cacheable(url, req)) return;
  event.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const cached = await cache.match(req);
    if (cached && isAsset(url)) {
      fromNetwork(cache, req).catch(() => {});
      return cached;
    }
    try {
      return await fromNetwork(cache, req);
    } catch {
      if (cached) return cached;
      if (req.mode === "navigate") {
        const home = await cache.match("/index.html");
        if (home) return home;
        const offline = await cache.match(OFFLINE);
        if (offline) return offline;
      }
      return new Response("", { status: 503, statusText: "Offline" });
    }
  })());
});
