// Wanderlust service worker. Versioned by build; a new version installs alongside the old one and
// only takes over when the person chooses "Restart to update" (never forced while editing).
const BUILD = '__BUILD__';
const SHELL = 'elsewhere-shell-' + BUILD;
const PHOTOS = 'elsewhere-photos-v1';
const PRECACHE = __PRECACHE__;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // Fetch each file ourselves so a sign-in redirect or error page is never stored as the app.
    for (const url of PRECACHE) {
      const res = await fetch(url, { credentials: 'same-origin', cache: 'no-cache', redirect: 'error' });
      if (!res.ok) throw new Error('Precache failed: ' + url + ' ' + res.status);
      if (url === '/' && !(res.headers.get('Content-Type') || '').includes('text/html')) throw new Error('Shell is not HTML');
      await cache.put(url, res);
    }
    // The install only completes when every file is stored; otherwise the previous version stays in charge.
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('elsewhere-shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data?.type === 'skipWaiting') self.skipWaiting(); });

const PASS = /^\/(api|mcp|feed|s|shares|fares)(\/|$)|^\/maps\/[^/]+\.pmtiles$|^\/sw\.js$/;
const APP_ROUTES = /^\/($|explore|place|plan|journeys|wallet|settle|deals|documents|forty|story|today|search|more|prepare|index\.html)/;

self.addEventListener('fetch', event => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || PASS.test(url.pathname)) return; // private data is never cached here
  if (req.mode === 'navigate') {
    if (url.searchParams.has('signin') || url.pathname.startsWith('/__') || !APP_ROUTES.test(url.pathname)) return; // let sign-in reach the network
    event.respondWith((async () => (await caches.match('/', { cacheName: SHELL })) || (await caches.match('/')) || fetch(req))());
    return;
  }
  if (url.pathname.startsWith('/app/')) { event.respondWith((async () => (await caches.match(req)) || fetch(req))()); return; }
  if (url.pathname.startsWith('/images/')) {
    event.respondWith((async () => {
      const hit = await caches.match(req); if (hit) return hit;
      let res;
      try { res = await fetch(req); }
      catch (e) { // offline: an HD photo falls back to the small version saved for offline use
        const m = url.pathname.match(/^\/images\/(.+)\.hd-[0-9a-f]+\.webp$/); if (!m) throw e;
        const c = await caches.open(PHOTOS), key = (await c.keys()).find(k => new URL(k.url).pathname.startsWith('/images/' + m[1] + '-'));
        if (key) return c.match(key); throw e;
      }
      if (res.ok && (res.headers.get('Content-Type') || '').startsWith('image/')) { const c = await caches.open(PHOTOS); await c.put(req, res.clone()); }
      return res;
    })());
    return;
  }
  event.respondWith((async () => { try { return await fetch(req); } catch { const hit = await caches.match(req); if (hit) return hit; throw new Error('offline'); } })());
});

self.addEventListener('push', e => { const d = e.data ? e.data.json() : {}; e.waitUntil(self.registration.showNotification(d.title || 'Wanderlust', { body: d.body || '', icon: PRECACHE.find(u => u.endsWith('icon-192.png')), data: { url: d.url || '/' } })); });
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(self.clients.openWindow(e.notification.data?.url || '/')); });

// Background Sync is an enhancement: it asks an open Wanderlust window to flush its outbox.
self.addEventListener('sync', event => {
  if (event.tag !== 'elsewhere-outbox') return;
  event.waitUntil((async () => { for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage({ type: 'flush' }); })());
});
