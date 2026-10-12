// Offline support: network first (so a new version shows up when online), cached copy when offline.
// Every same-origin GET is cached as it loads, so one online visit makes the app available offline.
// shortcut: old hashed bundles stay in the cache; bump CACHE to clear them if it ever grows noticeably.
const CACHE = 'hockey-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      })
      .catch(async () => (await caches.match(req)) ?? (req.mode === 'navigate' ? caches.match(self.registration.scope) : Response.error())),
  )
})
