// System — Solo Leveling Reader
// App-shell service worker. Registration is guarded so this only runs on the
// published deployment (see src/lib/register-sw.ts).
const VERSION = "sl-reader-v1";
const HTML_CACHE = `${VERSION}-html`;
const ASSET_CACHE = `${VERSION}-assets`;
const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(HTML_CACHE);
      await Promise.allSettled(PRECACHE.map((u) => cache.add(u)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith("sl-reader-") && !n.startsWith(VERSION))
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // HTML navigations: network-first, fall back to cached shell.
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      (async () => {
        try {
          const net = await fetch(req);
          const cache = await caches.open(HTML_CACHE);
          cache.put("/", net.clone()).catch(() => {});
          return net;
        } catch {
          const cache = await caches.open(HTML_CACHE);
          return (await cache.match("/")) ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Hashed built assets and static files: cache-first.
  if (url.pathname.startsWith("/assets/") || /\.(js|css|woff2?|ttf|png|jpg|jpeg|svg|webp|ico|json|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const net = await fetch(req);
          if (net.ok) cache.put(req, net.clone()).catch(() => {});
          return net;
        } catch {
          return hit ?? Response.error();
        }
      })(),
    );
  }
});
