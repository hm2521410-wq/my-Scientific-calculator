// Offline support. Bump CACHE when any shipped file changes.
const CACHE = 'fx375es-web-v3';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/app.css',
  './src/app.js',
  './src/editor.js',
  './src/evaluator.js',
  './src/flick.js',
  './src/format.js',
  './src/keys.js',
  './src/numeric.js',
  './src/parser.js',
  './src/solve.js',
  './src/symbolic.js',
  './src/complex.js',
  './src/help.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network-first, revalidating with the server, for everything we ship.
//
// The app is a set of ES modules that must all come from the same release.
// Serving each from cache and refreshing it in the background let a new
// keys.js run against an old flick.js after a deployment — the SI key then
// fell back to plain k / m flicks. Asking the server every time (an ETag
// check, so usually a cheap 304) keeps every module in step; the cache is
// only the offline fallback, or the answer if the network is slow.
const NETWORK_TIMEOUT_MS = 3500;

function fromNetwork(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS);
    // A navigation Request cannot be re-issued with options, so use its URL.
    const target = request.mode === 'navigate' ? request.url : request;
    fetch(target, { cache: 'no-cache' })
      .then((res) => { clearTimeout(timer); resolve(res); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const sameOrigin = new URL(request.url).origin === self.location.origin;
  if (!sameOrigin) return;

  const key = request.mode === 'navigate' ? './index.html' : request;
  event.respondWith(
    fromNetwork(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(key, copy));
        }
        return res;
      })
      .catch(() => caches.match(key).then((hit) => hit || caches.match(request))),
  );
});
