const INFO_DOCK_CACHE = "info-dock-honor-share-20260609";
const INFO_DOCK_ASSETS = [
  "./info-dock-051904.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(INFO_DOCK_CACHE)
      .then((cache) => cache.addAll(INFO_DOCK_ASSETS.map((url) => new Request(url, { cache: "reload" }))))
      .catch((error) => console.warn("Info Dock precache failed:", error))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => key === INFO_DOCK_CACHE ? undefined : caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method === "POST" && isInfoDockPage(url)) {
    event.respondWith(handlePostShare(request));
    return;
  }

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate" || isInfoDockPage(url) || isCoreAsset(url)) {
    event.respondWith(networkFirst(request));
  }
});

function isInfoDockPage(url) {
  return url.origin === self.location.origin && /\/info-dock-051904\.html$/.test(url.pathname);
}

function isCoreAsset(url) {
  return /\/(manifest\.json|icon-192\.png|icon-512\.png)$/.test(url.pathname);
}

async function networkFirst(request) {
  const cache = await caches.open(INFO_DOCK_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    return cache.match("./info-dock-051904.html");
  }
}

async function handlePostShare(request) {
  const formData = await request.formData();
  const redirectUrl = new URL("./info-dock-051904.html", self.location.href);
  redirectUrl.searchParams.set("shareTarget", "1");
  for (const [target, aliases] of Object.entries({
    title: ["title", "name"],
    text: ["text", "description", "body"],
    url: ["url", "link"]
  })) {
    const value = aliases.map((name) => formData.get(name)).find(Boolean);
    if (value) redirectUrl.searchParams.set(target, String(value));
  }
  return Response.redirect(redirectUrl.href, 303);
}
