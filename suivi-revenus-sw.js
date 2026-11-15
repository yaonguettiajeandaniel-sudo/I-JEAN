// Coquille de l'appli en cache pour qu'elle s'ouvre même sans réseau.
// Réseau d'abord (toujours la dernière version en ligne), cache si le réseau est absent ou trop lent.
// Les appels de synchronisation (autre origine) ne passent pas ici : ils vont directement au réseau.
var CACHE = 'suivi-revenus-shell-v1';
var ASSETS = [
  './SUIVIS%20REVENUS.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];
var NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  e.respondWith(new Promise(function (resolve) {
    var settled = false;
    function done(res) { if (!settled) { settled = true; resolve(res); } }

    var timer = setTimeout(function () {
      caches.match(e.request).then(function (cached) { if (cached) done(cached); });
    }, NETWORK_TIMEOUT_MS);

    fetch(e.request).then(function (res) {
      clearTimeout(timer);
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      }
      done(res);
    }).catch(function () {
      clearTimeout(timer);
      caches.match(e.request).then(function (cached) { done(cached || Response.error()); });
    });
  }));
});
