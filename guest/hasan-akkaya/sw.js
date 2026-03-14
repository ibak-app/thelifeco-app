var CACHE_NAME = 'thelifeco-guest-v3';
var URLS_TO_CACHE = [
  '/guest/hasan-akkaya/',
  '/guest/hasan-akkaya/manifest.json',
  '/guest/hasan-akkaya/images/hero-resort.jpg',
  '/guest/hasan-akkaya/images/hero-grounds.jpg',
  '/guest/hasan-akkaya/images/hero-lobby.jpg',
  '/guest/hasan-akkaya/images/hero-room.jpg',
  '/guest/hasan-akkaya/images/yoga-beach.jpg',
  '/guest/hasan-akkaya/images/st-lucia-bay.jpg',
  '/guest/hasan-akkaya/images/iv-therapy.jpg',
  '/guest/hasan-akkaya/images/wellness-method.jpg',
  '/guest/hasan-akkaya/images/ozone-therapy.jpg',
  '/guest/hasan-akkaya/images/mindfulness.jpg',
  '/guest/hasan-akkaya/images/meditation-zen.jpg',
  '/guest/hasan-akkaya/images/yoga-wild.jpg',
  '/guest/hasan-akkaya/images/meditation.jpg',
  '/guest/hasan-akkaya/images/nutrition.jpg',
  '/guest/hasan-akkaya/images/longevity.jpg',
  '/guest/hasan-akkaya/images/stretching.jpg',
  '/guest/hasan-akkaya/images/juice-bar.jpg',
  '/guest/hasan-akkaya/images/couple-bar.jpg',
  '/guest/hasan-akkaya/images/room-luxury.jpg'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(URLS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(name) { return name !== CACHE_NAME; })
        .map(function(name) { return caches.delete(name); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  // Cache Google Fonts with stale-while-revalidate
  if (url.indexOf('fonts.googleapis.com') !== -1 || url.indexOf('fonts.gstatic.com') !== -1) {
    event.respondWith(
      caches.open('thelifeco-fonts-v1').then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          var fetched = fetch(event.request).then(function(response) {
            cache.put(event.request, response.clone());
            return response;
          });
          return cached || fetched;
        });
      })
    );
    return;
  }

  // Normal cache-first for other requests
  event.respondWith(
    caches.match(event.request).then(function(response) {
      if (response) return response;
      return fetch(event.request).then(function(networkResponse) {
        if (networkResponse && networkResponse.status === 200) {
          var responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(function() {
        return caches.match('/guest/hasan-akkaya/');
      });
    })
  );
});
