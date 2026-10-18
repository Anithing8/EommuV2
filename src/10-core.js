/* ===== Eommu UI core: DOM helper, icons, storage, toasts, dialogs, menus ===== */
'use strict';
const KEY = 'eommu.v1';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/** Small element builder. Text is always inserted as text, never as HTML. */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'a') for (const [ak, av] of Object.entries(v)) el.setAttribute(ak, av);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v);
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}

/* ---------- icons: one stroke style, drawn on a 24 grid ---------- */
const ICONS = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  plus: 'M12 5v14M5 12h14',
  star: 'M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.2-4.1 5.8-.8z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3',
  indent: 'M4 6h16M11 10h9M11 14h9M4 18h16M4 9.5l3.2 2.5L4 14.5',
  unindent: 'M4 6h16M11 10h9M11 14h9M4 18h16M7.2 9.5L4 12l3.2 2.5',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  chevR: 'M9 6l6 6-6 6',
  chevD: 'M6 9l6 6 6-6',
  chevL: 'M15 6l-6 6 6 6',
  cal: 'M5 6h14v13H5zM5 10h14M9 4v4M15 4v4',
  today: 'M5 6h14v13H5zM5 10h14M9 4v4M15 4v4M9.5 14.5l2 2 3.5-3.8',
  clock: 'M12 4a8 8 0 100 16 8 8 0 000-16zM12 8v4.2l3 1.8',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  copy: 'M8 8h11v12H8zM5 16V4h11',
  sliders: 'M4 8h9M17 8h3M4 16h3M11 16h9M15 5.5v5M9 13.5v5',
  sun: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4',
  moon: 'M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z',
  panel: 'M4 5h16v14H4zM14 5v14',
  print: 'M7 9V4h10v5M7 17H5v-6h14v6h-2M7 14h10v6H7z',
  bell: 'M6 17v-6a6 6 0 0112 0v6l1.5 2h-15zM10 21h4',
  up: 'M12 19V6M6 11.5l6-6 6 6',
  down: 'M12 5v13M6 12.5l6 6 6-6',
  x: 'M6 6l12 12M18 6L6 18',
  dl: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  ul: 'M12 16V5M7 9l5-5 5 5M5 20h14',
  repeat: 'M4 11V9a3 3 0 013-3h11M15 3l3 3-3 3M20 13v2a3 3 0 01-3 3H6M9 21l-3-3 3-3',
  note: 'M6 4h12v16H6zM9 9h6M9 13h6M9 17h3',
  board: 'M4 5h5v14H4zM10 5h4v9h-4zM15 5h5v6h-5z',
  gauge: 'M4 17a8 8 0 0116 0M12 17l3.6-5.2',
  stack: 'M12 4l8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4',
  inbox: 'M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5',
  sort: 'M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3',
  menu: 'M4 7h16M4 12h16M4 17h16',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  rename: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  save: 'M5 4h12l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
};
const DOTTED = new Set(['more', 'grip']);
function icon(name, cls = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `ic ${cls}${DOTTED.has(name) ? ' dots' : ''}`);
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', ICONS[name] || '');
  svg.append(p);
  return svg;
}
const iconBtn = (name, label, onclick, cls = '') =>
  h('button', { class: `ibtn ${cls}`, type: 'button', title: label, a: { 'aria-label': label }, onclick }, icon(name));

/* ---------- state ---------- */
let S;                       // persisted data
const UI = {                 // session-only view state
  view: 'board', presetId: null, cal: { date: null }, notesOpen: null, focusId: null,
  focusTitleId: null, fresh: null, reopenAdd: null, sidebarOpen: false, starDone: false,
  orderCtx: {}, presetPane: 'list',
};

function loadState() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
  if (raw) {
    try { return L.validateImport({ data: JSON.parse(raw) }); }
    catch (e) {
      try { localStorage.setItem(KEY + '.corrupt', raw); } catch (e2) { /* ignore */ }
      setTimeout(() => toast('Saved data could not be read, so Eommu started fresh. A copy was kept in this browser.', { ms: 9000 }), 500);
    }
  }
  return L.sampleState();
}

let quotaWarned = false;
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) {
    if (!quotaWarned) {
      quotaWarned = true;
      toast('This browser would not save your changes. Export a backup from Settings so nothing is lost.', { ms: 10000 });
    }
  }
  if (typeof afterSave === 'function') afterSave();
}

/* ---------- render scheduling ---------- */
let rendering = false, deferT = null;
function commit() { L.normalize(S); save(); render(); }
/** For background triggers: never rebuild the page under someone who is typing. */
function softRender() {
  const a = document.activeElement;
  if (a && a.matches && a.matches('input, textarea, select') && !a.closest('dialog')) { return; }
  if ($('dialog[open]')) return;
  render();
}
/** After saving an inline edit on blur: wait so a click that caused the blur still lands. */
function deferRender(ms = 350) { clearTimeout(deferT); deferT = setTimeout(softRender, ms); }

/* ---------- formatting ---------- */
function dateLabel(date, today = L.today()) {
  if (date === today) return 'Today';
  if (date === L.addDays(today, 1)) return 'Tomorrow';
  if (date === L.addDays(today, -1)) return 'Yesterday';
  const d = L.parseDate(date);
  const sameYear = d.getFullYear() === L.parseDate(today).getFullYear();
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}
function timeLabel(hm) {
  if (!hm) return '';
  const [H, M] = hm.split(':').map(Number);
  return new Date(2000, 0, 1, H, M).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
function repeatLabel(r) {
  if (!r || !r.freq || r.freq === 'none') return '';
  const n = Math.max(1, parseInt(r.n, 10) || 1);
  const unit = { day: 'day', week: 'week', month: 'month', year: 'year' }[r.freq];
  if (n === 1) return { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' }[r.freq];
  return `Every ${n} ${unit}s`;
}

const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"']+)/gi;
/** Turn plain text into text plus real links (opened in a new tab). */
function linkify(text) {
  const frag = document.createDocumentFragment();
  let last = 0, m;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text))) {
    let url = m[1], trail = '';
    const t = url.match(/[.,;:!?)\]}'"]+$/);
    if (t) { trail = t[0]; url = url.slice(0, -trail.length); }
    if (m.index > last) frag.append(text.slice(last, m.index));
    frag.append(h('a', {
      href: /^www\./i.test(url) ? 'https://' + url : url, target: '_blank', rel: 'noopener noreferrer',
      onclick: (e) => e.stopPropagation(),
    }, url));
    if (trail) frag.append(trail);
    last = m.index + m[1].length;
  }
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}
function safeUrl(u) {
  try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href : null; }
  catch (e) { return null; }
}
function autoSize(ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
function fitAll(root) { $$('textarea.grow', root).forEach(autoSize); }

/* ---------- toasts ---------- */
function toast(msg, { actions = [], ms, kind = '' } = {}) {
  const box = $('#toasts');
  while (box.children.length > 3) box.firstChild.remove();
  let timer;
  const close = () => { clearTimeout(timer); el.remove(); };
  const el = h('div', { class: `toast ${kind}`, role: 'status' },
    h('span', { class: 'msg' }, msg),
    actions.map((a) => h('button', { class: 'tbtn', type: 'button', onclick: () => { close(); a.fn(); } }, a.label)),
    h('button', { class: 'tclose', type: 'button', title: 'Dismiss', a: { 'aria-label': 'Dismiss' }, onclick: close }, icon('x')));
  box.append(el);
  timer = setTimeout(close, ms || (actions.length ? 8000 : 4500));
  return { close };
}

/* ---------- dialogs ---------- */
/** Focus a field shortly after a dialog opens, unless the person has already started typing in another one. */
function focusSoon(el, select = false) {
  setTimeout(() => {
    const a = document.activeElement;
    if (a && a !== el && a.matches && a.matches('dialog input, dialog textarea, dialog select')) return;
    el.focus();
    if (select && el.select) el.select();
  }, 30);
}
function openDialog({ title, body, actions = [], cls = '', onClose }) {
  const dlg = h('dialog', { class: `dlg ${cls}` });
  let closed = false;
  const close = (val) => {
    if (closed) return;
    closed = true;
    try { dlg.close(); } catch (e) { /* not open */ }
    dlg.remove();
    if (onClose) onClose(val);
  };
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.addEventListener('mousedown', (e) => { dlg._down = e.target === dlg; });
  dlg.addEventListener('click', (e) => { if (e.target === dlg && dlg._down) close(); });
  const foot = actions.length ? h('div', { class: 'dlg-foot' }, actions.map((a) =>
    h('button', {
      class: `key ${a.kind || ''}`, type: 'button',
      onclick: async () => { const r = a.onClick ? await a.onClick(close) : undefined; if (r !== false && !a.stay) close(a.value); },
    }, a.label))) : null;
  dlg.append(h('div', { class: 'dlg-in' },
    h('header', { class: 'dlg-head' }, h('h2', {}, title), iconBtn('x', 'Close', () => close(), 'quiet')),
    h('div', { class: 'dlg-body' }, body), foot));
  document.body.append(dlg);
  dlg.showModal();
  return { el: dlg, close };
}

function confirmDialog(message, { confirmLabel = 'Confirm', danger = false, title = 'Are you sure?' } = {}) {
  return new Promise((resolve) => {
    let answer = false;
    openDialog({
      title, cls: 'small', body: h('p', { class: 'plain' }, message),
      actions: [{ label: 'Cancel', kind: '' }, { label: confirmLabel, kind: danger ? 'danger' : 'primary', onClick: () => { answer = true; } }],
      onClose: () => resolve(answer),
    });
  });
}

function promptDialog({ title, label, value = '', confirmLabel = 'Save', placeholder = '' }) {
  return new Promise((resolve) => {
    let out = null;
    const input = h('input', { class: 'field', type: 'text', value, placeholder, maxLength: 120, a: { 'aria-label': label } });
    const submit = (close) => { const v = input.value.trim(); if (!v) { input.focus(); return false; } out = v; };
    const dlg = openDialog({
      title, cls: 'small', body: h('label', { class: 'fld' }, h('span', {}, label), input),
      actions: [{ label: 'Cancel' }, { label: confirmLabel, kind: 'primary', onClick: submit }],
      onClose: () => resolve(out),
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (submit() !== false) dlg.close(); }
    });
    input.focus(); input.select();
  });
}

/* ---------- menus ---------- */
let openMenuEl = null, menuAnchor = null;
function closeMenu(returnFocus) {
  if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; }
  if (returnFocus && menuAnchor && document.contains(menuAnchor)) menuAnchor.focus();
  menuAnchor = null;
}
function openMenu(anchor, items, { align = 'start', width } = {}) {
  closeMenu();
  menuAnchor = anchor;
  const m = h('div', { class: 'menu', role: 'menu' }, items.map((it) => it.sep ? h('div', { class: 'menu-sep' }) :
    it.head ? h('div', { class: 'menu-head' }, it.head) :
    h('button', {
      class: `menu-item${it.danger ? ' danger' : ''}`, type: 'button', role: 'menuitem', disabled: !!it.disabled,
      onclick: () => { closeMenu(); if (it.onClick) it.onClick(); },
    }, it.icon ? icon(it.icon) : h('span', { class: 'ic ph' }), h('span', { class: 'lbl' }, it.label),
    it.hint ? h('span', { class: 'hint' }, it.hint) : null,
    it.checked ? icon('check', 'tick') : null)));
  if (width) m.style.minWidth = width + 'px';
  document.body.append(m);
  openMenuEl = m;
  const r = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
  let left = align === 'end' ? r.right - mw : r.left;
  left = Math.max(8, Math.min(left, innerWidth - mw - 8));
  let top = r.bottom + 6;
  if (top + mh > innerHeight - 8) top = Math.max(8, r.top - mh - 6);
  m.style.left = left + 'px'; m.style.top = top + 'px';
  const first = $('.menu-item:not(:disabled)', m);
  if (first) first.focus({ preventScroll: true });
  return m;
}
document.addEventListener('pointerdown', (e) => {
  if (openMenuEl && !openMenuEl.contains(e.target) && !(menuAnchor && menuAnchor.contains(e.target))) closeMenu();
}, true);
document.addEventListener('keydown', (e) => {
  if (!openMenuEl) return;
  const items = $$('.menu-item:not(:disabled)', openMenuEl);
  const i = items.indexOf(document.activeElement);
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  else if (e.key === 'Tab') closeMenu();
}, true);
window.addEventListener('resize', () => closeMenu());

/* ---------- shared form controls ---------- */
function segmented(options, value, onPick, label) {
  const wrap = h('div', { class: 'seg', role: 'group', a: { 'aria-label': label || '' } });
  options.forEach(([val, text, ic]) => wrap.append(h('button', {
    type: 'button', class: val === value ? 'on' : '', a: { 'aria-pressed': String(val === value) },
    onclick: () => onPick(val),
  }, ic ? icon(ic) : null, h('span', {}, text))));
  return wrap;
}
function switchBtn(on, onToggle, label) {
  const b = h('button', {
    type: 'button', class: `switch${on ? ' on' : ''}`, role: 'switch', a: { 'aria-checked': String(!!on), 'aria-label': label },
    onclick: () => { const v = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', String(v)); b.classList.toggle('on', v); onToggle(v); },
  }, h('span', { class: 'knob' }));
  return b;
}
const WEEK_MON_FIRST = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];
const WEEK_SUN_FIRST = [[0, 'Sun'], [1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat']];
function dayPills(order, selected, onChange, label) {
  const sel = new Set(selected);
  const wrap = h('div', { class: 'pills', role: 'group', a: { 'aria-label': label } });
  order.forEach(([d, name]) => {
    const b = h('button', {
      type: 'button', class: `pill${sel.has(d) ? ' on' : ''}`, a: { 'aria-pressed': String(sel.has(d)) }, title: name,
      onclick: () => {
        if (sel.has(d)) sel.delete(d); else sel.add(d);
        b.classList.toggle('on', sel.has(d)); b.setAttribute('aria-pressed', String(sel.has(d)));
        onChange([...sel].sort((a, c) => a - c));
      },
    }, name.slice(0, 3));
    wrap.append(b);
  });
  return wrap;
}
