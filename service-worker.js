const CACHE_NAME = "info-dock-app-v060910-honor-share";
const APP_PAGE = "./info-dock-051904.html";
const MANIFEST_FILE = "./manifest.json";
const SHARE_TARGET_PATH = new URL("./share-target/", self.registration.scope).pathname.replace(/\/+$/, "");
const APP_SHELL = [
  "./",
  APP_PAGE,
  MANIFEST_FILE,
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((error) => {
        console.warn("Info Dock Service Worker 安装缓存失败：", error);
      })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function appendShareParam(targetUrl, key, value) {
  if (typeof value !== "string") return;
  const cleanValue = value.trim();
  if (cleanValue) targetUrl.searchParams.set(key, cleanValue);
}

function isLegacyShareTargetRequest(request, url) {
  if (url.origin !== self.location.origin) return false;
  return url.pathname.replace(/\/+$/, "") === SHARE_TARGET_PATH && ["GET", "POST"].includes(request.method);
}

async function handleLegacyShareTarget(request, url) {
  const redirectUrl = new URL(APP_PAGE, self.registration.scope);
  redirectUrl.searchParams.set("shareTarget", "1");

  if (request.method === "GET") {
    ["title", "text", "url"].forEach((key) => appendShareParam(redirectUrl, key, url.searchParams.get(key) || ""));
    return Response.redirect(redirectUrl.href, 303);
  }

  try {
    const formData = await request.formData();
    ["title", "text", "url"].forEach((key) => appendShareParam(redirectUrl, key, formData.get(key)));
  } catch (error) {
    console.warn("Info Dock 读取分享内容失败：", error);
  }

  return Response.redirect(redirectUrl.href, 303);
}

function fetchAndUpdateCache(request) {
  return fetch(request).then((response) => {
    const copy = response.clone();
    if (response.ok) {
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (isLegacyShareTargetRequest(request, url)) {
    event.respondWith(handleLegacyShareTarget(request, url));
    return;
  }

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith("/manifest.json") || url.pathname.endsWith("/service-worker.js")) {
    event.respondWith(fetchAndUpdateCache(request).catch(() => caches.match(request)));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(APP_PAGE))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetchAndUpdateCache(request);
    })
  );
});
