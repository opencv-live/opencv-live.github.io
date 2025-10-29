self.addEventListener("install", evt => {
  self.skipWaiting();
  evt.waitUntil(
    caches.open("Demo")
    .then(cache => cache.addAll([
      "index.html",
      "manifest.json"
    ]))
    .catch(err => console.error(err))
  );
});

self.addEventListener("activate", evt => self.clients.claim());

self.addEventListener("fetch", evt => evt.respondWith(
  fetch(evt.request).catch(() => caches.match(evt.request))
));