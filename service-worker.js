const CACHE_NAME = "info-dock-app-v061010-share-target-v2";
const APP_PAGE = "./info-dock-051904.html";
const SHARE_TARGET_ENTRY = "./share-target/index.html";
const APP_SHELL = [
  "./",
  APP_PAGE,
  SHARE_TARGET_ENTRY,
  "./icon-192.png",
  "./icon-512.png"
];

function normalizedPath(url) {
  return url.pathname.replace(/\/+$/, "");
}

const SHARE_TARGET_PATHS = new Set([
  normalizedPath(new URL("./share-target/", self.registration.scope)),
  normalizedPath(new URL(SHARE_TARGET_ENTRY, self.registration.scope))
]);

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

function appendFirstShareParam(targetUrl, targetKey, data, ...sourceKeys) {
  for (const sourceKey of sourceKeys) {
    const value = data.get(sourceKey);
    if (typeof value === "string" && value.trim()) {
      appendShareParam(targetUrl, targetKey, value);
      return;
    }
  }
}

function isShareTargetRequest(request, url) {
  if (url.origin !== self.location.origin) return false;
  return SHARE_TARGET_PATHS.has(normalizedPath(url)) && ["GET", "POST"].includes(request.method);
}

async function handleShareTargetRequest(request, url) {
  const redirectUrl = new URL(APP_PAGE, self.registration.scope);
  redirectUrl.searchParams.set("shareTarget", "1");

  if (request.method === "GET") {
    appendFirstShareParam(redirectUrl, "title", url.searchParams, "title", "name");
    appendFirstShareParam(redirectUrl, "text", url.searchParams, "text", "description");
    appendFirstShareParam(redirectUrl, "url", url.searchParams, "url", "link");
    return Response.redirect(redirectUrl.href, 303);
  }

  try {
    const formData = await request.formData();
    appendFirstShareParam(redirectUrl, "title", formData, "title", "name");
    appendFirstShareParam(redirectUrl, "text", formData, "text", "description");
    appendFirstShareParam(redirectUrl, "url", formData, "url", "link");
  } catch (error) {
    console.warn("Info Dock 读取分享内容失败：", error);
  }

  return Response.redirect(redirectUrl.href, 303);
}

function shouldBypassCache(url) {
  return url.pathname.endsWith("/manifest.json") ||
    url.pathname.endsWith("/manifest.webmanifest") ||
    url.pathname.endsWith("/service-worker.js");
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

  if (isShareTargetRequest(request, url)) {
    event.respondWith(handleShareTargetRequest(request, url));
    return;
  }

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  if (shouldBypassCache(url)) return;

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
