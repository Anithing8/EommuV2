/* ===== Eommu drag and drop: pointer events, so it works with touch, pen and mouse ===== */
'use strict';

const DND = { s: null, line: null };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function dndLine(rect, indent) {
  if (!DND.line) { DND.line = h('div', { class: 'dropline' }); document.body.append(DND.line); }
  if (!rect) { DND.line.style.display = 'none'; return; }
  Object.assign(DND.line.style, { display: 'block', left: rect.left + indent + 'px', width: Math.max(24, rect.width - indent) + 'px', top: rect.y + 'px' });
}
function dndClearHot() { $$('.drop-hot').forEach((n) => n.classList.remove('drop-hot')); dndLine(null); }

/* Each handler turns "what is under the pointer" into a drop description, and applies it. */
const DROP = {
  /* a task card dragged on the board */
  task: {
    over(el, srcId) {
      const t = L.getTask(S, srcId);
      const col = el && el.closest('.col');
      if (!col) return null;
      const listId = col.dataset.list, list = L.getList(S, listId);
      const sameList = listId === t.listId;
      const blocked = sameList && list.sort !== 'manual';
      const row = el.closest('.task');
      const srcUnit = $(`.unit[data-unit="${t.parentId || t.id}"]`);
      if (row && row.dataset.id === srcId) return { noop: true };
      if (!t.parentId && row && srcUnit && srcUnit.contains(row)) return { noop: true };

      if (t.parentId) {
        if (row && row.dataset.level === '2') {
          const r = row.getBoundingClientRect(), before = DND.s.y < r.top + r.height / 2;
          const subs = $$('.task.sub', row.closest('.subs')).filter((x) => x.dataset.id !== srcId);
          const i = subs.indexOf(row);
          return { kind: 'sub', parentId: row.dataset.parent, beforeId: before ? row.dataset.id : (subs[i + 1] ? subs[i + 1].dataset.id : null), line: { rect: { left: r.left, width: r.width, y: before ? r.top : r.bottom }, indent: 0 } };
        }
        if (row && row.dataset.level === '1') {
          const unit = row.closest('.unit'), first = $$('.subs .task', unit).find((x) => x.dataset.id !== srcId);
          const r = row.getBoundingClientRect();
          return { kind: 'sub', parentId: row.dataset.id, beforeId: first ? first.dataset.id : null, line: { rect: { left: r.left, width: r.width, y: r.bottom }, indent: 28 } };
        }
        return { kind: 'top', listId, beforeId: null, blocked, col };
      }
      if (row) {
        const unit = row.closest('.unit'), r = unit.getBoundingClientRect(), before = DND.s.y < r.top + r.height / 2;
        const units = $$('.unit', col.querySelector('.col-body')).filter((u) => u.dataset.unit !== srcId && !u.closest('.drawer'));
        const i = units.indexOf(unit);
        return { kind: 'top', listId, blocked, beforeId: before ? unit.dataset.unit : (units[i + 1] ? units[i + 1].dataset.unit : null), line: blocked ? null : { rect: { left: r.left, width: r.width, y: before ? r.top : r.bottom }, indent: 0 }, col: blocked ? col : null };
      }
      return { kind: 'top', listId, beforeId: null, blocked, col };
    },
    drop(info, srcId) {
      const t = L.getTask(S, srcId);
      if (info.blocked) { toast('Switch this list to My order to rearrange its tasks.'); return; }
      const fromList = t.listId;
      if (info.kind === 'sub') {
        const parent = L.getTask(S, info.parentId);
        t.listId = parent.listId; t.recur = null;
        L.place(S.tasks, t, { parentId: info.parentId, beforeId: info.beforeId });
      } else {
        const kids = L.childrenOf(S.tasks, t.id);
        t.listId = info.listId; kids.forEach((k) => { k.listId = info.listId; });
        L.place(S.tasks, t, { parentId: null, beforeId: info.beforeId, scope: inList(info.listId) });
      }
      UI.focusId = srcId;
      commit();
      if (t.listId !== fromList) toast(`Moved to ${L.getList(S, t.listId).name}.`);
    },
  },

  /* a calendar chip dragged to another day or hour */
  chip: {
    over(el) {
      const slot = el && el.closest('.slot, .allday');
      if (!slot) return null;
      if (slot.classList.contains('allday')) return { date: slot.dataset.date, time: null, hot: slot, label: `${dateLabel(slot.dataset.date)}, all day` };
      const r = slot.getBoundingClientRect();
      const frac = clamp((DND.s.y - r.top) / r.height, 0, 0.999);
      const time = `${L.pad(+slot.dataset.hour)}:${L.pad(Math.floor(frac * 4) * 15)}`;
      return { date: slot.dataset.date, time, hot: slot, label: `${dateLabel(slot.dataset.date)}, ${timeLabel(time)}` };
    },
    drop(info, srcId) {
      updateTask(srcId, { dueDate: info.date, dueTime: info.time });
      commit();
    },
  },

  /* an item dragged inside a preset */
  pitem: {
    over(el, srcId) {
      const box = el && el.closest('.pe-rows');
      if (!box) return null;
      const p = L.getPreset(S, box.dataset.preset);
      const it = p.items.find((x) => x.id === srcId);
      const row = el.closest('.prow');
      if (!it) return null;
      if (row && row.dataset.id === srcId) return { noop: true };
      const srcUnit = $(`.unit[data-unit="${it.parentId || it.id}"]`, box);
      if (!it.parentId && row && srcUnit && srcUnit.contains(row)) return { noop: true };
      const rect = (r, y, indent = 0) => ({ rect: { left: r.left, width: r.width, y }, indent });
      if (it.parentId) {
        if (row && row.dataset.level === '2') {
          const r = row.getBoundingClientRect(), before = DND.s.y < r.top + r.height / 2;
          const subs = $$('.prow.sub', row.closest('.subs')).filter((x) => x.dataset.id !== srcId);
          const i = subs.indexOf(row);
          return { kind: 'sub', preset: p.id, parentId: row.dataset.parent, beforeId: before ? row.dataset.id : (subs[i + 1] ? subs[i + 1].dataset.id : null), line: rect(r, before ? r.top : r.bottom) };
        }
        if (row && row.dataset.level === '1') {
          const unit = row.closest('.unit'), first = $$('.subs .prow', unit).find((x) => x.dataset.id !== srcId), r = row.getBoundingClientRect();
          return { kind: 'sub', preset: p.id, parentId: row.dataset.id, beforeId: first ? first.dataset.id : null, line: rect(r, r.bottom, 28) };
        }
        return { kind: 'top', preset: p.id, beforeId: null, hot: box };
      }
      if (row) {
        const unit = row.closest('.unit'), r = unit.getBoundingClientRect(), before = DND.s.y < r.top + r.height / 2;
        const units = $$('.unit', box).filter((u) => u.dataset.unit !== srcId);
        const i = units.indexOf(unit);
        return { kind: 'top', preset: p.id, beforeId: before ? unit.dataset.unit : (units[i + 1] ? units[i + 1].dataset.unit : null), line: rect(r, before ? r.top : r.bottom) };
      }
      return { kind: 'top', preset: p.id, beforeId: null, hot: box };
    },
    drop(info, srcId) {
      const p = L.getPreset(S, info.preset);
      const it = p.items.find((x) => x.id === srcId);
      L.place(p.items, it, { parentId: info.kind === 'sub' ? info.parentId : null, beforeId: info.beforeId });
      UI.focusId = srcId;
      commit();
    },
  },
};

function dndLabel(kind, id) {
  if (kind === 'task' || kind === 'chip') { const t = L.getTask(S, id); return t ? t.title || 'Untitled' : ''; }
  for (const p of S.presets) { const it = p.items.find((x) => x.id === id); if (it) return it.title || 'Untitled'; }
  return '';
}

function dndDown(e) {
  if (e.button > 0 || DND.s) return;
  const handle = e.target.closest('[data-drag]');
  if (!handle) return;
  const kind = handle.dataset.drag;
  if (kind === 'chip' && e.target.closest('button')) return;
  const srcEl = kind === 'chip' ? handle : handle.closest('.task');
  if (!srcEl) return;
  const touch = e.pointerType !== 'mouse';
  const s = DND.s = { kind, id: srcEl.dataset.id, srcEl, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, started: false, touch, longPress: kind === 'chip' && touch, pid: e.pointerId, info: null };
  if (s.longPress) s.timer = setTimeout(() => dndStart(), 320);
  window.addEventListener('pointermove', dndMove, { passive: false });
  window.addEventListener('pointerup', dndUp);
  window.addEventListener('pointercancel', dndCancel);
  window.addEventListener('keydown', dndKey, true);
}

function dndStart() {
  const s = DND.s;
  if (!s || s.started) return;
  s.started = true;
  clearTimeout(s.timer);
  s.ghost = h('div', { class: 'ghost' }, h('span', {}, dndLabel(s.kind, s.id)), h('em', {}));
  document.body.append(s.ghost);
  s.srcEl.classList.add('drag-src');
  document.body.classList.add('dragging');
  closeMenu();
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  s.stopTouch = (ev) => ev.preventDefault();
  window.addEventListener('touchmove', s.stopTouch, { passive: false });
  if (navigator.vibrate && s.touch) { try { navigator.vibrate(8); } catch (e) { /* not allowed */ } }
  const tick = () => { if (DND.s !== s) return; dndScroll(); dndUpdate(); s.raf = requestAnimationFrame(tick); };
  s.raf = requestAnimationFrame(tick);
  dndUpdate();
}

function dndMove(e) {
  const s = DND.s;
  if (!s || e.pointerId !== s.pid) return;
  s.x = e.clientX; s.y = e.clientY;
  if (!s.started) {
    const d = Math.hypot(s.x - s.x0, s.y - s.y0);
    if (s.longPress) { if (d > 9) dndCancel(); return; }
    if (d > 5) dndStart(); else return;
  }
  e.preventDefault();
}

function dndUpdate() {
  const s = DND.s;
  if (!s || !s.started) return;
  s.ghost.style.transform = `translate(${s.x + 14}px, ${s.y + 12}px)`;
  const el = document.elementFromPoint(s.x, s.y);
  dndClearHot();
  const info = DROP[s.kind].over(el, s.id);
  s.info = info && !info.noop ? info : null;
  const note = $('em', s.ghost);
  if (info && info.label) note.textContent = info.label; else if (note.textContent) note.textContent = '';
  if (!info || info.noop) return;
  if (info.line) dndLine(info.line.rect, info.line.indent);
  const hot = info.hot || info.col || (info.blocked ? null : null);
  if (hot) hot.classList.add('drop-hot');
  if (info.blocked) s.ghost.classList.add('no'); else s.ghost.classList.remove('no');
}

function dndScroll() {
  const s = DND.s;
  let el = document.elementFromPoint(s.x, s.y);
  const EDGE = 56, speed = (d) => Math.min(18, 3 + d / 4);
  let v = false, hz = false;
  while (el && el !== document.documentElement && !(v && hz)) {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (!v && /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) {
      if (s.y < r.top + EDGE) { el.scrollTop -= speed(r.top + EDGE - s.y); v = true; }
      else if (s.y > r.bottom - EDGE) { el.scrollTop += speed(s.y - (r.bottom - EDGE)); v = true; }
    }
    if (!hz && /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) {
      if (s.x < r.left + EDGE) { el.scrollLeft -= speed(r.left + EDGE - s.x); hz = true; }
      else if (s.x > r.right - EDGE) { el.scrollLeft += speed(s.x - (r.right - EDGE)); hz = true; }
    }
    el = el.parentElement;
  }
}

function dndEnd() {
  const s = DND.s;
  if (!s) return;
  clearTimeout(s.timer); cancelAnimationFrame(s.raf);
  window.removeEventListener('pointermove', dndMove);
  window.removeEventListener('pointerup', dndUp);
  window.removeEventListener('pointercancel', dndCancel);
  window.removeEventListener('keydown', dndKey, true);
  if (s.stopTouch) window.removeEventListener('touchmove', s.stopTouch);
  if (s.ghost) s.ghost.remove();
  s.srcEl.classList.remove('drag-src');
  document.body.classList.remove('dragging');
  dndClearHot();
  DND.s = null;
  if (s.started) {
    const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', stop, true);
    setTimeout(() => window.removeEventListener('click', stop, true), 80);
  }
}
function dndUp(e) {
  const s = DND.s;
  if (!s || e.pointerId !== s.pid) return;
  if (s.started) { s.x = e.clientX; s.y = e.clientY; dndUpdate(); } // resolve the drop at the exact release point
  const { started, info, kind, id } = s;
  dndEnd();
  if (started && info) DROP[kind].drop(info, id);
}
function dndCancel() { dndEnd(); }
function dndKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); dndEnd(); } }

document.addEventListener('pointerdown', dndDown, { passive: true });
document.addEventListener('contextmenu', (e) => { if (DND.s && DND.s.started) e.preventDefault(); });
