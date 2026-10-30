// Offline cache for the app shell. Bump CACHE_VERSION on every release.
const CACHE_VERSION = 'mini-mart-v1'

const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/brand.css',
  './vendor/jszip.min.js',
  './assets/imperfect.otf',
  './assets/talina.ttf',
  './assets/logo-wordmark.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png',
  './src/main.js',
  './src/router.js',
  './src/ui.js',
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_FILES)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request)),
  )
})
