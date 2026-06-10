const CACHE_NAME = "info-dock-pwa-share-target-v20260610";
const APP_SHELL = [
  "./info-dock-051904.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(APP_SHELL.map((asset) => cache.add(asset)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith("info-dock-") && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  const isInfoDockPage = requestUrl.pathname.endsWith("/info-dock-051904.html");

  if (event.request.method === "POST" && isInfoDockPage) {
    event.respondWith((async () => {
      const formData = await event.request.formData();
      const redirectUrl = new URL("./info-dock-051904.html", self.registration.scope);
      redirectUrl.searchParams.set("shareTarget", "1");

      for (const field of ["title", "text", "url"]) {
        const value = formData.get(field);
        if (value) redirectUrl.searchParams.set(field, String(value));
      }

      redirectUrl.searchParams.set("ts", String(Date.now()));
      return Response.redirect(redirectUrl.href, 303);
    })());
    return;
  }

  if (event.request.method !== "GET") return;

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;

    try {
      const response = await fetch(event.request);
      if (response && response.status === 200 && response.type === "basic") {
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, response.clone());
      }
      return response;
    } catch (error) {
      return caches.match("./info-dock-051904.html");
    }
  })());
});
