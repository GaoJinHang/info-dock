const CACHE_NAME = "info-dock-app-v062204-xhs-mobile-search";
const APP_PAGE = "./info-dock-051904.html";
const SHARE_TARGET_PAGE = "./share-target/index.html";
const SHARE_TARGET_DIR = "./share-target/";
const APP_SHELL = [
  "./",
  APP_PAGE,
  SHARE_TARGET_PAGE,
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

function normalizePath(value) {
  const path = String(value || "").replace(/\/+$/, "");
  return path || "/";
}

const SHARE_PARAM_MAX_LENGTHS = { title: 220, text: 1200, url: 2048, description: 700, link: 2048, name: 220 };

function truncateShareParam(key, value) {
  const cleanValue = String(value || "").replace(/\s+/g, " ").trim();
  const maxLength = SHARE_PARAM_MAX_LENGTHS[key] || 1000;
  return cleanValue.length > maxLength ? `${cleanValue.slice(0, maxLength)}…` : cleanValue;
}

function appendShareParam(targetUrl, key, value) {
  if (value == null) return;
  const cleanValue = truncateShareParam(key, value);
  if (cleanValue) targetUrl.searchParams.set(key, cleanValue);
}

function appendAliasedShareParam(targetUrl, canonicalKey, data, aliases) {
  for (const key of [canonicalKey].concat(aliases || [])) {
    const value = data.get ? data.get(key) : data[key];
    if (value != null && String(value).trim()) {
      appendShareParam(targetUrl, canonicalKey, value);
      return;
    }
  }
}

function isShareTargetRequest(request, url) {
  if (url.origin !== self.location.origin) return false;

  const requestPath = normalizePath(url.pathname);
  const pagePath = normalizePath(new URL(SHARE_TARGET_PAGE, self.registration.scope).pathname);
  const dirPath = normalizePath(new URL(SHARE_TARGET_DIR, self.registration.scope).pathname);

  return (requestPath === pagePath || requestPath === dirPath) && ["GET", "POST"].includes(request.method);
}

async function handleShareTarget(request, url) {
  const redirectUrl = new URL(APP_PAGE, self.registration.scope);
  redirectUrl.searchParams.set("shareTarget", "1");

  if (request.method === "GET") {
    appendAliasedShareParam(redirectUrl, "title", url.searchParams, ["name"]);
    appendAliasedShareParam(redirectUrl, "text", url.searchParams, ["description"]);
    appendAliasedShareParam(redirectUrl, "url", url.searchParams, ["link"]);
    return Response.redirect(redirectUrl.href, 303);
  }

  try {
    const formData = await request.formData();
    appendAliasedShareParam(redirectUrl, "title", formData, ["name"]);
    appendAliasedShareParam(redirectUrl, "text", formData, ["description"]);
    appendAliasedShareParam(redirectUrl, "url", formData, ["link"]);
  } catch (error) {
    console.warn("Info Dock 读取分享内容失败：", error);
  }

  return Response.redirect(redirectUrl.href, 303);
}

function shouldNeverCache(url) {
  return /(?:^|\/)(?:manifest\.json|manifest\.webmanifest|service-worker\.js)$/.test(url.pathname);
}

function fetchAndUpdateCache(request) {
  return fetch(request).then((response) => {
    if (response.ok && !shouldNeverCache(new URL(request.url))) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (isShareTargetRequest(request, url)) {
    event.respondWith(handleShareTarget(request, url));
    return;
  }

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  if (shouldNeverCache(url)) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(APP_PAGE)));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetchAndUpdateCache(request))
  );
});
