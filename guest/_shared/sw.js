var CACHE_NAME = 'thelifeco-guest-v4';
var SHELL_CACHE = 'thelifeco-shell-v1';
var DATA_CACHE = 'thelifeco-data-v1';
var IMG_CACHE = 'thelifeco-images-v1';
var FONT_CACHE = 'thelifeco-fonts-v1';

// Shell files to precache
var SHELL_URLS = [
  '/guest/_shell/index.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Shared guest images to precache
var IMAGE_URLS = [
  '/guest/_shared/images/hero-resort.jpg',
  '/guest/_shared/images/hero-grounds.jpg',
  '/guest/_shared/images/hero-lobby.jpg',
  '/guest/_shared/images/hero-room.jpg',
  '/guest/_shared/images/yoga-beach.jpg',
  '/guest/_shared/images/st-lucia-bay.jpg',
  '/guest/_shared/images/iv-therapy.jpg',
  '/guest/_shared/images/wellness-method.jpg',
  '/guest/_shared/images/ozone-therapy.jpg',
  '/guest/_shared/images/mindfulness.jpg',
  '/guest/_shared/images/meditation-zen.jpg',
  '/guest/_shared/images/yoga-wild.jpg',
  '/guest/_shared/images/meditation.jpg',
  '/guest/_shared/images/nutrition.jpg',
  '/guest/_shared/images/longevity.jpg',
  '/guest/_shared/images/stretching.jpg',
  '/guest/_shared/images/juice-bar.jpg',
  '/guest/_shared/images/couple-bar.jpg',
  '/guest/_shared/images/room-luxury.jpg'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE).then(function(cache) {
        return cache.addAll(SHELL_URLS);
      }),
      caches.open(IMG_CACHE).then(function(cache) {
        return cache.addAll(IMAGE_URLS);
      })
    ])
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  var validCaches = [CACHE_NAME, SHELL_CACHE, DATA_CACHE, IMG_CACHE, FONT_CACHE];
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(name) {
          return validCaches.indexOf(name) === -1;
        }).map(function(name) {
          return caches.delete(name);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  var url = event.request.url;
  var requestUrl = new URL(url);

  // API calls: network-first with data cache fallback
  if (requestUrl.pathname.indexOf('/api/') !== -1) {
    // Only cache GET requests
    if (event.request.method !== 'GET') return;

    event.respondWith(
      fetch(event.request).then(function(response) {
        if (response && response.status === 200) {
          var responseToCache = response.clone();
          caches.open(DATA_CACHE).then(function(cache) {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      }).catch(function() {
        return caches.match(event.request);
      })
    );
    return;
  }

  // Google Fonts: stale-while-revalidate
  if (url.indexOf('fonts.googleapis.com') !== -1 || url.indexOf('fonts.gstatic.com') !== -1) {
    event.respondWith(
      caches.open(FONT_CACHE).then(function(cache) {
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

  // Images (local and external): cache-first
  if (requestUrl.pathname.indexOf('/images/') !== -1 ||
      url.indexOf('thelifeco.com/wp-content') !== -1 ||
      url.indexOf('images.unsplash.com') !== -1) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          if (response && response.status === 200) {
            var responseToCache = response.clone();
            caches.open(IMG_CACHE).then(function(cache) {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Shell HTML: cache-first (the universal shell is the same for all guests)
  if (requestUrl.pathname.indexOf('/guest/') !== -1 &&
      (requestUrl.pathname.endsWith('/') || requestUrl.pathname.indexOf('.') === -1)) {
    event.respondWith(
      caches.match('/guest/_shell/index.html').then(function(cached) {
        if (cached) return cached;
        return fetch(event.request);
      })
    );
    return;
  }

  // Everything else: cache-first with network fallback
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
      });
    })
  );
});
