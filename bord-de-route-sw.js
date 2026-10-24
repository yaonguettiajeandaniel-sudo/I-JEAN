var CACHE = 'bdr-shell-v1';
var ASSETS = [
  './BORD%20DE%20ROUTE.html',
  './bord-de-route.manifest.json',
  './bord-de-route-icon-192.png',
  './bord-de-route-icon-512.png'
];

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(ASSETS); }));
});

self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
  }));
});

// Coquille de l'appli en cache (stale-while-revalidate) pour qu'elle s'ouvre même sans réseau.
// Les appels Supabase/CDN (autre origine) ne passent pas par ici : ils vont directement au réseau.
self.addEventListener('fetch', function(e){
  if(e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if(url.origin !== location.origin) return;

  e.respondWith(
    caches.match(e.request).then(function(cached){
      var network = fetch(e.request).then(function(res){
        if(res && res.ok){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request, copy); });
        }
        return res;
      }).catch(function(){ return cached; });
      return cached || network;
    })
  );
});
