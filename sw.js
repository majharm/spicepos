/* The installed app opens from cache when the network drops. API calls stay on the network. */
const SHELL = "pos-pwa-2";
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

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!cacheable(url, req)) return;
  event.respondWith((async () => {
    const cache = await caches.open(SHELL);
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        try { await cache.put(req, res.clone()); } catch { /* some responses cannot be stored */ }
      }
      return res;
    } catch {
      const hit = await cache.match(req);
      if (hit) return hit;
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
