// Only here so Chrome offers to install the game, which asks for a fetch handler that answers (an empty one
// counts as none). It caches nothing on purpose: a new deploy is never hidden behind a stale copy
self.addEventListener('fetch', (e) => e.respondWith(fetch(e.request)))
