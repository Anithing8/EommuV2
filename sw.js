/* Eommu service worker: the whole app is cached, so it opens and works with no connection. */
const VERSION = 'db9626312d';
const CACHE = 'eommu-' + VERSION;
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('eommu-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (err) {
      if (req.mode === 'navigate') { const shell = await cache.match('./index.html'); if (shell) return shell; }
      return Response.error();
    }
  })());
});

/* ----- reminders ----- */
function idb() {
  return new Promise((res, rej) => {
    const rq = indexedDB.open('eommu', 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
async function idbGet(k) { const db = await idb(); return new Promise((res) => { const r = db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); }); }
async function idbSet(k, v) { const db = await idb(); return new Promise((res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(); tx.onerror = () => res(); }); }

/* Browsers that allow periodic background sync (installed apps on Chromium) wake this now and then. */
async function checkDue() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (clients.some((c) => c.visibilityState === 'visible')) return; // the open app handles it
  const data = await idbGet('reminders');
  if (!data || !data.enabled) return;
  const shown = (await idbGet('shown')) || [];
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  for (const it of data.items || []) {
    const key = `${it.id}|${it.date}|${it.time}`;
    const min = parseInt(it.time.slice(0, 2), 10) * 60 + parseInt(it.time.slice(3), 10);
    if (it.date !== today || min > nowMin || nowMin - min > 180 || shown.includes(key)) continue;
    shown.push(key);
    await self.registration.showNotification(it.title || 'Task reminder', {
      body: it.list ? `Due now in ${it.list}` : 'Due now', tag: key, icon: './icons/icon-192.png', badge: './icons/icon-192.png',
      data: { taskId: it.id }, actions: [{ action: 'done', title: 'Mark done' }],
    });
  }
  await idbSet('shown', shown.slice(-300));
}
self.addEventListener('periodicsync', (e) => { if (e.tag === 'eommu-reminders') e.waitUntil(checkDue()); });

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const taskId = e.notification.data && e.notification.data.taskId;
  const done = e.action === 'done' && taskId;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (all.length) {
      const c = all[0];
      if (done) c.postMessage({ type: 'done', taskId });
      if (c.focus) await c.focus();
      return;
    }
    await self.clients.openWindow(done ? `./?done=${encodeURIComponent(taskId)}` : './?view=today');
  })());
});
