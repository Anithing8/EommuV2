/* ===== Eommu start-up, keyboard shortcuts and URL actions ===== */
'use strict';

function visibleRows(fromRow) {
  const scope = fromRow.closest('.col-body, .smart-rows, .pe-rows, .drawer-body') || $('#main');
  return $$('.task', scope);
}

document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented) return;
  const key = e.key;
  // Copy-preset modal works from anywhere
  if (e.ctrlKey && e.shiftKey && (key === 'P' || key === 'p')) {
    e.preventDefault();
    if (!$('dialog[open]')) openCopyModal();
    return;
  }
  if ($('dialog[open]') || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (!t || !t.classList || !t.classList.contains('task')) return; // only act when a task row itself has focus
  const id = t.dataset.id;
  const rows = visibleRows(t);
  const i = rows.indexOf(t);
  const isPreset = t.classList.contains('prow');

  if (key === 'ArrowDown' || key === 'ArrowUp') {
    e.preventDefault();
    const next = rows[i + (key === 'ArrowDown' ? 1 : -1)];
    if (next) { next.tabIndex = 0; next.focus(); UI.focusId = next.dataset.id; next.scrollIntoView({ block: 'nearest' }); }
  } else if (key === ' ' && !isPreset) {
    e.preventDefault(); toggleDone(id);
  } else if (key === 'Delete' && !isPreset) {
    e.preventDefault();
    const nextRow = rows[i + 1] || rows[i - 1];
    if (nextRow) UI.focusId = nextRow.dataset.id;
    removeTask(id);
  } else if ((key === 's' || key === 'S') && !isPreset) {
    e.preventDefault(); toggleStar(id);
  } else if (key === 's' || key === 'S') {
    e.preventDefault();
    const p = S.presets.find((x) => x.items.some((it) => it.id === id));
    const it = p && p.items.find((x) => x.id === id);
    if (it) { it.isStarred = !it.isStarred; UI.focusId = id; commit(); }
  } else if (key === 'Enter') {
    e.preventDefault();
    const ta = $('textarea.title', t);
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  } else if (key === 'Tab' && !isPreset) {
    const task = L.getTask(S, id);
    if (!task || task.isCompleted || !t.closest('.col-body')) return;
    if (!e.shiftKey && !task.parentId && visibleTopIds(task.listId).indexOf(id) > 0) { e.preventDefault(); indentTask(id); }
    else if (e.shiftKey && task.parentId) { e.preventDefault(); unindentTask(id); }
  } else if (key === 'Tab' && isPreset) {
    const p = S.presets.find((x) => x.items.some((it) => it.id === id));
    const it = p && p.items.find((x) => x.id === id);
    if (!it) return;
    if (!e.shiftKey && !it.parentId && presetTopIds(p).indexOf(id) > 0) { e.preventDefault(); indentItem(p, it); }
    else if (e.shiftKey && it.parentId) { e.preventDefault(); unindentItem(p, it); }
  } else if (key === 'Escape') {
    t.blur();
  }
});

window.addEventListener('storage', (e) => {
  if (e.key !== KEY || !e.newValue) return;
  try { S = L.validateImport({ data: JSON.parse(e.newValue) }); softRender(); } catch (err) { /* ignore a bad write from another tab */ }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); } });
window.addEventListener('focus', tick);
window.addEventListener('pagehide', () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } });
window.addEventListener('online', () => {});

function handleUrlActions() {
  const q = new URLSearchParams(location.search);
  if (![...q.keys()].length) return;
  const view = q.get('view');
  if (view && VIEW_TITLES[view]) { UI.view = view; S.settings.view = view; }
  const done = q.get('done');
  if (done) markDoneFromNotification(done);
  const action = q.get('action');
  const sharedTitle = q.get('title'), sharedText = q.get('text'), sharedUrl = q.get('url');
  history.replaceState(null, '', location.pathname);
  render();
  if (action === 'copy') setTimeout(() => openCopyModal(), 200);
  else if (action === 'capture' || sharedTitle || sharedText || sharedUrl) {
    const found = (sharedText || '').match(/https?:\/\/[^\s]+/);
    setTimeout(() => openCapture({
      title: sharedTitle || (sharedText ? sharedText.replace(/https?:\/\/[^\s]+/g, '').trim().slice(0, 200) : ''),
      url: sharedUrl || (found ? found[0] : ''), label: sharedTitle && (sharedUrl || found) ? sharedTitle.slice(0, 60) : '',
    }), 200);
  }
}

function boot() {
  S = loadState();
  L.normalize(S);
  UI.view = VIEW_TITLES[S.settings.view] ? S.settings.view : 'board';
  save();
  render();
  handleUrlActions();
  lastDay = L.today();
  // let the service worker's record of shown reminders merge in before the first check
  IDB.get('shown').then((arr) => { (arr || []).forEach((k) => notified.add(k)); }).catch(() => {}).finally(() => { tick(); });
  setInterval(tick, 30000);
  registerWorker();
  mirrorReminders(); updateBadge();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
