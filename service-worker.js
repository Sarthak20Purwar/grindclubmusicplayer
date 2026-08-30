const CACHE = 'retro-player-shell-v26';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './mobile.css',
  './app.js',
  './manifest.webmanifest',
  './icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  // Let the browser stream large music and video files directly. Caching them
  // here can delay seeking/playback and can quickly exhaust mobile storage.
  const path = new URL(event.request.url).pathname;
  // The playlist can change independently of the app shell. Always request
  // its latest generated index instead of returning a stale PWA cache entry.
  if (path.endsWith('/playlist/playlist.json')) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }
  if (event.request.destination === 'audio' || event.request.destination === 'video' || /\.(mp3|m4a|ogg|wav|mp4|webm|mov)$/i.test(path)) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    if (new URL(event.request.url).origin === self.location.origin) {
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match('./index.html'))));
});
