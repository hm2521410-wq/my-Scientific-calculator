// Offline support. The deploy workflow stamps CACHE with the commit, so every
// release gets a fresh cache; bump the suffix by hand when testing locally.
const CACHE = 'fx375es-web-v4';

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

// The app is a set of ES modules that only work together when they all come
// from the same release. Fetching or refreshing them one by one has run a new
// keys.js against an old flick.js after a deployment, and the SI ladder then
// never opened. So a release is installed whole, straight from the server
// (`reload` skips the HTTP cache, which could still hold the previous files),
// and pages are served only from that one complete set. The page reloads
// itself when a new set takes over (see app.js).
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
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

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  const key = request.mode === 'navigate' ? './index.html' : request;
  event.respondWith(
    caches.open(CACHE)
      .then((c) => c.match(key, { ignoreSearch: true }))
      .then((hit) => hit || fetch(request)),
  );
});
