const CACHE_VERSION = 'v3';
const STATIC_CACHE  = `frostdex-static-${CACHE_VERSION}`;
const FONT_CACHE    = `frostdex-fonts-${CACHE_VERSION}`;

const NEVER_CACHE = ['/', '/index.html', '/config.js', '/sw.js', '/manifest.json'];

const PRECACHE_FONTS = [
  '/fonts/Manrope/Manrope-Bold.ttf',
  '/fonts/Manrope/Manrope-SemiBold.ttf',
  '/fonts/Manrope/Manrope-Medium.ttf',
];

const PRECACHE_ASSETS = [
  '/frostdex-logo.webp',
  '/favicon.webp',
];

/* ── install: pre-cache fonts + logo immediately ── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(FONT_CACHE).then(cache =>
        cache.addAll(PRECACHE_FONTS).catch(() => {})
      ),
      caches.open(STATIC_CACHE).then(cache =>
        cache.addAll(PRECACHE_ASSETS).catch(() => {})
      ),
    ])
  );
  self.skipWaiting();
});

/* ── activate: delete old caches ── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== FONT_CACHE)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* ── helpers ── */
const isHashedAsset   = url => /\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(js|mjs|css|woff2?|ttf)$/.test(url.pathname);
const isFont          = url => /\.(woff2?|ttf|otf)$/.test(url.pathname);
const isStaticImage   = url => /\.(webp|png|jpg|jpeg|svg|ico)$/.test(url.pathname);
const isNeverCache    = url => NEVER_CACHE.includes(url.pathname);
const isExternalReq   = (url, origin) => url.origin !== origin;

/* ── fetch: tiered caching strategy ── */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  /* Skip non-http and cross-origin API calls */
  if (!url.protocol.startsWith('http')) return;
  if (isExternalReq(url, self.location.origin)) return;
  if (isNeverCache(url)) return;

  /* 1. Hashed JS/CSS chunks → Cache-First (immutable, safe to serve stale forever) */
  if (isHashedAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(res => {
            if (res && res.status === 200 && res.type === 'basic') {
              cache.put(request, res.clone()).catch(() => {});
            }
            return res;
          });
        })
      )
    );
    return;
  }

  /* 2. Fonts → Cache-First (pre-cached on install, long-lived) */
  if (isFont(url)) {
    event.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(res => {
            if (res && res.status === 200) {
              cache.put(request, res.clone()).catch(() => {});
            }
            return res;
          });
        })
      )
    );
    return;
  }

  /* 3. Static images → Stale-While-Revalidate */
  if (isStaticImage(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(cache =>
        cache.match(request).then(cached => {
          const fetchPromise = fetch(request).then(res => {
            if (res && res.status === 200 && res.type === 'basic') {
              cache.put(request, res.clone()).catch(() => {});
            }
            return res;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  /* 4. Everything else → Network with cache fallback */
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
