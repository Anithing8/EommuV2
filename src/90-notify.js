/* ===== Eommu reminders, auto-copy, service worker and install ===== */
'use strict';

/* ---------- tiny IndexedDB mirror so the service worker can see upcoming reminders ---------- */
const IDB = {
  open() {
    return new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('no idb'));
      const rq = indexedDB.open('eommu', 1);
      rq.onupgradeneeded = () => { rq.result.createObjectStore('kv'); };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
  },
  async get(k) { const db = await IDB.open(); return new Promise((res) => { const r = db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); }); },
  async set(k, v) { const db = await IDB.open(); return new Promise((res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(); tx.onerror = () => res(); }); },
};

let mirrorT = null;
function afterSave() {
  clearTimeout(mirrorT);
  mirrorT = setTimeout(() => { mirrorReminders(); updateBadge(); }, 400);
}
function mirrorReminders() {
  if (!S) return;
  const today = L.today(), until = L.addDays(today, 14);
  const list = S.tasks.filter((t) => !t.isCompleted && t.dueTime && t.dueDate >= today && t.dueDate <= until)
    .map((t) => ({ id: t.id, title: t.title, date: t.dueDate, time: t.dueTime, list: (L.getList(S, t.listId) || {}).name || '' }));
  IDB.set('reminders', { enabled: S.settings.reminders !== false, items: list }).catch(() => {});
}
function updateBadge() {
  if (!S || !('setAppBadge' in navigator)) return;
  const n = L.todayView(S).count;
  (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
}

/* ---------- reminders ---------- */
const notified = new Set();
try { JSON.parse(localStorage.getItem('eommu.notified') || '[]').forEach((k) => notified.add(k)); } catch (e) { /* none */ }
function rememberNotified(key) {
  notified.add(key);
  const recent = [...notified].slice(-300);
  try { localStorage.setItem('eommu.notified', JSON.stringify(recent)); } catch (e) { /* ignore */ }
  IDB.set('shown', recent).catch(() => {});
}

async function requestNotifications() {
  if (!('Notification' in window)) { toast('This browser does not support notifications.'); return 'unsupported'; }
  let p = Notification.permission;
  if (p === 'default') { try { p = await Notification.requestPermission(); } catch (e) { p = Notification.permission; } }
  if (p === 'granted') { registerPeriodicSync(); toast('Notifications are on.'); }
  else if (p === 'denied') toast('Notifications are blocked. Allow them in your browser settings to get alerts.', { ms: 7000 });
  return p;
}

async function showNative(title, body, tag, taskId) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const opts = { body, tag, icon: './icons/icon-192.png', badge: './icons/icon-192.png', data: { taskId }, renotify: true, requireInteraction: false, actions: taskId ? [{ action: 'done', title: 'Mark done' }] : [] };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg && reg.showNotification) { await reg.showNotification(title, opts); return; }
  } catch (e) { /* fall through */ }
  try { const n = new Notification(title, { body, tag, icon: opts.icon }); n.onclick = () => { window.focus(); n.close(); }; } catch (e) { /* ignore */ }
}

function sendTestNotification() {
  showNative('Eommu reminder test', 'This is how a reminder looks.', 'eommu-test');
  toast('Test sent. Check your notifications.');
}

function alertTask(t) {
  const l = L.getList(S, t.listId);
  const when = `${timeLabel(t.dueTime)}${l ? ' in ' + l.name : ''}`;
  toast(`${t.title || 'Untitled task'}, ${when}`, {
    kind: 'reminder', ms: 60000,
    actions: [{ label: 'Mark done', fn: () => toggleDone(t.id) }],
  });
  showNative(t.title || 'Task reminder', when, `${t.id}|${t.dueDate}|${t.dueTime}`, t.id);
}

/** Runs every 30 seconds: fires reminders whose clock time has arrived. Late ones are bundled. */
function checkReminders() {
  if (!S || S.settings.reminders === false) return;
  const today = L.today(), hm = L.nowHM();
  const nowMin = L.timeToMin(hm);
  const fresh = [], stale = [];
  L.dueReminders(S, today, hm).forEach((t) => {
    const key = `${t.id}|${t.dueDate}|${t.dueTime}`;
    if (notified.has(key)) return;
    rememberNotified(key);
    (nowMin - L.timeToMin(t.dueTime) <= 15 ? fresh : stale).push(t);
  });
  fresh.forEach(alertTask);
  if (stale.length) {
    toast(`${stale.length} reminder${stale.length > 1 ? 's' : ''} came due while Eommu was closed.`, { ms: 12000, actions: [{ label: 'View', fn: () => setView('today') }] });
  }
}

/* ---------- daily auto-copy ---------- */
function runAutoCopy() {
  if (!S) return;
  const due = L.autoCopyDue(S);
  if (!due.length) return;
  due.forEach((p) => {
    const res = L.copyPreset(S, p.id, { date: L.today() });
    p.lastCopiedDate = L.today();
    const where = presetTargetName(p, res.listId);
    toast(`${p.name} was copied into ${where} for today.`, { actions: [{ label: 'View', fn: () => setView('board') }], ms: 9000 });
    showNative('Today’s schedule is ready', `${p.name} was added to ${where}.`, `auto|${p.id}|${L.today()}`);
  });
  commit();
}

/* ---------- one heartbeat ---------- */
let lastDay = null;
function tick() {
  if (!S) return;
  runAutoCopy();
  checkReminders();
  const day = L.today();
  if (lastDay && lastDay !== day) softRender(); // midnight: overdue badges roll forward
  else if (UI.view === 'calendar' || UI.view === 'widget') softRender();
  lastDay = day;
}

/* ---------- service worker, install, updates ---------- */
window.deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.deferredInstall = e; });
window.addEventListener('appinstalled', () => { window.deferredInstall = null; toast('Eommu is installed.'); });
async function promptInstall() {
  const e = window.deferredInstall;
  if (!e) return;
  e.prompt();
  try { await e.userChoice; } catch (err) { /* ignore */ }
  window.deferredInstall = null;
}

async function registerPeriodicSync() {
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.periodicSync) return;
    const st = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (st.state === 'granted') await reg.periodicSync.register('eommu-reminders', { minInterval: 15 * 60 * 1000 });
  } catch (e) { /* not supported here */ }
}

let updating = false, reloading = false;
function registerWorker() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const offer = (w) => toast('A new version of Eommu is ready.', { ms: 20000, actions: [{ label: 'Reload', fn: () => { updating = true; w.postMessage('SKIP_WAITING'); } }] });
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
    });
    if (Notification && Notification.permission === 'granted') registerPeriodicSync();
  }).catch(() => { /* offline mode simply unavailable */ });
  // reload only when the person asked for the update; the first install must not reload the page
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (updating && !reloading) { reloading = true; location.reload(); } });
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'done' && e.data.taskId) { markDoneFromNotification(e.data.taskId); }
  });
}

function markDoneFromNotification(taskId) {
  const t = L.getTask(S, taskId);
  if (t && !t.isCompleted) { toggleDone(taskId); }
}

/** The first time a clock time is set, offer to turn on alerts (once per visit). */
function nudgeNotifications() {
  if (UI.askedNotif || !('Notification' in window) || Notification.permission !== 'default') return;
  UI.askedNotif = true;
  toast('Allow notifications to be reminded at this time, even when Eommu is in the background.', {
    ms: 12000, actions: [{ label: 'Allow', fn: () => requestNotifications() }],
  });
}
