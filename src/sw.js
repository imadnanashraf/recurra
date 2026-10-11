// Service worker: lets the website open offline, and shows reminder notifications.
const CACHE = 'recurra-{{VERSION}}';
const SHELL = ['./', 'index.html', 'config.js', 'manifest.webmanifest',
  'vendor/firebase-app-compat.js', 'vendor/firebase-auth-compat.js', 'vendor/firebase-firestore-compat.js', 'vendor/capacitor.js',
  'fonts/ahn-latin.woff2', 'icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Page and settings: network first (so updates arrive), cache when offline. Libraries and fonts: cache first.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const fresh = e.request.mode === 'navigate' || /\/(index\.html|config\.js)?$/.test(url.pathname) || url.pathname.endsWith('/config.js');
  if (fresh) {
    e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
  } else {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })));
  }
});

// Pushes: daily reminders (reminder job) and chat / live-test alerts (push sender). Firebase Cloud Messaging data messages.
self.addEventListener('push', e => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (err) { p = { data: { body: e.data && e.data.text() } }; }
  const d = Object.assign({}, p.notification || {}, p.data || {});
  e.waitUntil(self.registration.showNotification(d.title || 'Recurra', {
    body: d.body || 'Your daily review is ready whenever you are.',
    icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', tag: d.tag || 'daily-review', renotify: true,
    data: { url: d.url || './' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.startsWith(self.registration.scope)) { c.postMessage({ open: new URL(target).hash }); return c.focus(); }
    return self.clients.openWindow(target);
  }));
});
