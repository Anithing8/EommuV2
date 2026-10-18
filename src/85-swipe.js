/* ===== Eommu swipe to delete: touch and pen only, so mouse text selection stays untouched =====
 *
 * A leftward swipe slides the task (with its subtasks) over a red Delete key.
 *  - short swipe: the Delete key stays open, one more tap deletes
 *  - long swipe (past half the width): deletes at once, with Undo
 *  - vertical movement hands the gesture back to normal scrolling
 * Rows use touch-action: pan-y, so a sideways swipe on a task never scrolls the board to another list.
 */
'use strict';

const SW = { s: null, open: null };
const SW_OPEN = 92;       // px of the Delete key left showing when the row is held open
const SW_LOCK = 10;       // px of movement before the direction is decided
const SW_FULL = 0.5;      // fraction of the width that deletes straight away

function swipeTarget(row) {
  const unit = row.parentElement && row.parentElement.classList.contains('unit') ? row.parentElement : null;
  return unit || row;
}

function swipeClose(animate = true) {
  const o = SW.open;
  if (!o) return;
  SW.open = null;
  swipeRelease(o, 0, animate);
}

/** Put a swiped element at x px to the left; 0 closes it and removes the red backing. */
function swipeRelease(o, x, animate) {
  const { el, bg } = o;
  if (animate) el.style.transition = 'transform .18s ease';
  el.style.transform = x ? `translateX(${-x}px)` : '';
  if (!x) {
    const done = () => { el.classList.remove('swiping'); el.style.transition = ''; el.style.transform = ''; if (bg.isConnected) bg.remove(); };
    if (animate) setTimeout(done, 190); else done();
  }
}

function swipeDown(e) {
  if (e.pointerType === 'mouse' || SW.s || (DND && DND.s)) return;
  const row = e.target.closest && e.target.closest('.task');
  // a tap anywhere outside an open Delete key closes it
  if (SW.open && !(e.target.closest && e.target.closest('.swipe-bg'))) {
    if (!row || swipeTarget(row) !== SW.open.el) swipeClose();
  }
  if (!row || e.target.closest('[data-drag], button, a, input, select')) return;
  const t = L.getTask(S, row.dataset.id);
  if (!t) return;                                           // preset rows and anything else are not tasks
  if (e.target.tagName === 'TEXTAREA' && e.target === document.activeElement) return; // editing: let the caret work
  const el = swipeTarget(row);
  const reopen = SW.open && SW.open.el === el ? SW.open : null;
  SW.s = {
    id: t.id, row, el, pid: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp,
    base: reopen ? SW_OPEN : 0, locked: false, dx: reopen ? SW_OPEN : 0, armed: false, o: reopen, moved: false,
  };
  window.addEventListener('pointermove', swipeMove);
  window.addEventListener('pointerup', swipeUp);
  window.addEventListener('pointercancel', swipeCancel);
}

function swipeBg(el, id) {
  const bg = h('div', { class: 'swipe-bg', a: { 'aria-hidden': 'true' } },
    h('button', {
      class: 'swipe-del', type: 'button', tabIndex: -1,
      onclick: (e) => { e.stopPropagation(); SW.open = null; swipeDelete({ el, bg }, id); },
    }, icon('trash'), h('span', {}, 'Delete')));
  Object.assign(bg.style, { top: el.offsetTop + 'px', left: el.offsetLeft + 'px', width: el.offsetWidth + 'px', height: el.offsetHeight + 'px' });
  el.parentElement.append(bg);
  return bg;
}

function swipeMove(e) {
  const s = SW.s;
  if (!s || e.pointerId !== s.pid) return;
  const dx = s.x0 - e.clientX, dy = e.clientY - s.y0;
  if (!s.locked) {
    if (Math.hypot(dx, dy) < SW_LOCK) return;
    const horizontal = Math.abs(dx) > Math.abs(dy) * 1.5 && (dx > 0 || s.base > 0);
    if (!horizontal) { swipeCancel(); return; }                // vertical: the page scrolls, nothing is deleted
    s.locked = true;
    if (document.activeElement && document.activeElement.blur && s.row.contains(document.activeElement)) document.activeElement.blur();
    if (s.o) { s.bg = s.o.bg; } else { s.bg = swipeBg(s.el, s.id); }
    s.el.classList.add('swiping');
    s.el.style.transition = '';
    s.W = s.el.offsetWidth;
    s.moved = true;
  }
  e.preventDefault();
  const x = Math.max(0, Math.min(s.W, s.base + dx));
  s.dx = x;
  s.el.style.transform = x ? `translateX(${-x}px)` : '';
  const armed = x > s.W * SW_FULL;
  if (armed !== s.armed) {
    s.armed = armed;
    s.bg.classList.toggle('armed', armed);
    if (armed && navigator.vibrate) { try { navigator.vibrate(10); } catch (err) { /* not allowed */ } }
  }
  s.bg.style.setProperty('--p', String(Math.min(1, x / SW_OPEN)));
}

function swipeEnd() {
  window.removeEventListener('pointermove', swipeMove);
  window.removeEventListener('pointerup', swipeUp);
  window.removeEventListener('pointercancel', swipeCancel);
  const s = SW.s;
  SW.s = null;
  if (s && s.moved) {
    // the click that follows a swipe must not toggle or focus anything
    const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', stop, true);
    setTimeout(() => window.removeEventListener('click', stop, true), 80);
  }
  return s;
}

function swipeUp(e) {
  const s = SW.s;
  if (!s || e.pointerId !== s.pid) return;
  swipeEnd();
  if (!s.locked) return;
  const o = { el: s.el, bg: s.bg };
  const speed = (s.dx - s.base) / Math.max(1, e.timeStamp - s.t0);   // px per ms, positive = leftward
  if (s.armed) { SW.open = null; swipeDelete(o, s.id); return; }
  if (s.dx > 40 || (speed > 0.5 && s.dx > 24)) { SW.open = o; swipeRelease(o, SW_OPEN, true); return; }
  SW.open = null;
  swipeRelease(o, 0, true);
}

function swipeCancel() {
  const s = SW.s;
  if (!s) return;
  swipeEnd();
  if (!s.locked) return;
  const o = { el: s.el, bg: s.bg };
  if (s.base) { SW.open = o; swipeRelease(o, SW_OPEN, true); } else swipeRelease(o, 0, true);
}

function swipeDelete(o, id) {
  const { el, bg } = o;
  bg.classList.add('armed', 'gone');
  el.style.transition = 'transform .16s ease, opacity .16s ease';
  el.style.transform = 'translateX(-100%)';
  el.style.opacity = '0';
  setTimeout(() => { if (bg.isConnected) bg.remove(); removeTask(id); }, 170);
}

document.addEventListener('pointerdown', swipeDown, { passive: true });
// scrolling or any re-render drops an open Delete key
document.addEventListener('scroll', () => { if (SW.open) swipeClose(false); }, true);
