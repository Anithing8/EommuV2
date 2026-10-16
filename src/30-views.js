/* ===== Eommu views: shell, sidebar, board, smart views, quick widget, render loop ===== */
'use strict';

const VIEW_SHORT = { board: 'Lists', today: 'Today', starred: 'Starred', calendar: 'Calendar', widget: 'Focus', presets: 'Presets' };
const VIEW_TITLES = {
  board: 'All selected lists', today: 'Today & overdue', starred: 'Starred / priority',
  calendar: 'Calendar', widget: 'Quick focus', presets: 'Preset daily schedules',
};

function setView(view, extra = {}) {
  UI.view = view;
  if (extra.presetId !== undefined) UI.presetId = extra.presetId;
  if (view === 'presets' && extra.pane) UI.presetPane = extra.pane;
  S.settings.view = view;
  UI.sidebarOpen = false;
  save();
  render();
  const main = $('#main');
  if (main) main.scrollTop = 0;
}

/* ---------- theme and layout ---------- */
const darkQuery = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
function applyTheme() {
  const t = S.settings.theme;
  const dark = t === 'dark' || (t === 'system' && darkQuery && darkQuery.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#2b2e31' : '#d7dadb';
}
function applyLayout() {
  const compact = !!S.settings.compact;
  document.body.classList.toggle('compact', compact);
  document.body.classList.toggle('m', compact || innerWidth < 760);
  document.body.classList.toggle('side-open', UI.sidebarOpen);
}
if (darkQuery) darkQuery.addEventListener('change', () => { if (S && S.settings.theme === 'system') applyTheme(); });
window.addEventListener('resize', () => { if (S) applyLayout(); });

/* ---------- render loop ---------- */
function captureScroll() {
  const main = $('#main'), board = $('.board'), side = $('.side-scroll');
  const cols = {};
  $$('.col-body').forEach((c) => { cols[c.dataset.list] = c.scrollTop; });
  const cs = $('.cal-scroll');
  return {
    main: main ? main.scrollTop : 0, board: board ? board.scrollLeft : 0, cols,
    side: side ? side.scrollTop : 0, cal: cs ? [cs.scrollLeft, cs.scrollTop] : null,
    pe: $('.pe-items') ? $('.pe-items').scrollTop : 0,
  };
}
function restoreScroll(sc) {
  const main = $('#main'), board = $('.board'), side = $('.side-scroll');
  if (main) main.scrollTop = sc.main;
  if (board) board.scrollLeft = sc.board;
  if (side) side.scrollTop = sc.side;
  $$('.col-body').forEach((c) => { if (sc.cols[c.dataset.list] != null) c.scrollTop = sc.cols[c.dataset.list]; });
  const cs = $('.cal-scroll');
  if (cs && sc.cal) { cs.scrollLeft = sc.cal[0]; cs.scrollTop = sc.cal[1]; }
  const pe = $('.pe-items'); if (pe) pe.scrollTop = sc.pe;
}
function activeControl() {
  const a = document.activeElement;
  const row = a && a.closest && a.closest('.task');
  if (!row) return null;
  if (a === row) return { id: row.dataset.id, sel: null };
  if (a.matches('.check')) return { id: row.dataset.id, sel: '.check' };
  if (a.matches('.star')) return { id: row.dataset.id, sel: '.star' };
  return null;
}

function render() {
  if (rendering || !S) return;
  rendering = true;
  try {
    const prev = activeControl();
    const sc = captureScroll();
    UI.focusEl = null; UI.orderCtx = {};
    applyTheme(); applyLayout();
    renderSidebar(); renderTopbar(); renderMain(); renderTabbar();
    fitAll(document);
    restoreScroll(sc);
    if (UI.focusEl) {
      const el = UI.focusEl; UI.focusEl = null; UI.focusTitleId = null;
      el.focus({ preventScroll: false });
      try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* not text */ }
    } else if (prev) {
      const row = $(`.task[data-id="${prev.id}"]`);
      const el = row && (prev.sel ? $(prev.sel, row) : row);
      if (el) el.focus({ preventScroll: true });
    }
    // roving tab stop: one task row is reachable by Tab, arrow keys do the rest
    const rows = $$('.task');
    const stop = (UI.focusId && rows.find((r) => r.dataset.id === UI.focusId)) || rows[0];
    if (stop) stop.tabIndex = 0;
    document.title = `${VIEW_TITLES[UI.view]} – Eommu`;
  } finally { rendering = false; }
}

/* ---------- sidebar ---------- */
function openCount(list) { return S.tasks.filter((t) => t.listId === list.id && !t.parentId && !t.isCompleted).length; }

function renderSidebar() {
  const today = L.today();
  const todayN = L.todayView(S, today).count;
  const starN = L.starredView(S).active.length;
  const navItem = (view, ic, label, count) => h('button', {
    class: `nav-item${UI.view === view ? ' on' : ''}`, type: 'button', a: { 'aria-current': UI.view === view ? 'page' : 'false' },
    onclick: () => setView(view),
  }, icon(ic), h('span', { class: 'lbl' }, label), count ? h('span', { class: 'count' }, count) : null);

  const lists = S.lists.slice().sort((a, b) => a.order - b.order);
  const listRows = lists.map((l) => {
    const cb = h('input', {
      type: 'checkbox', checked: l.visible, a: { 'aria-label': `Show ${l.name} on the board` },
      onchange: () => { l.visible = cb.checked; save(); if (UI.view === 'board') render(); else renderSidebar(); },
    });
    return h('div', { class: 'list-row' },
      h('label', { class: 'vis', title: 'Show on the board' }, cb, h('span', { class: 'box' }, icon('check'))),
      h('button', {
        class: 'lname', type: 'button', title: `Go to ${l.name}`,
        onclick: () => {
          if (!l.visible) l.visible = true;
          save(); UI.view = 'board'; S.settings.view = 'board'; UI.sidebarOpen = false; render();
          const col = $(`.col[data-list="${l.id}"]`);
          if (col) { col.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); col.classList.add('ping'); setTimeout(() => col.classList.remove('ping'), 900); }
        },
      }, h('i', { class: `dot c${l.color % 6}` }), h('span', { class: 'lbl' }, l.name)),
      h('span', { class: 'count soft' }, openCount(l) || ''));
  });

  const presetRows = S.presets.map((p) => h('div', { class: `preset-row${UI.view === 'presets' && UI.presetId === p.id ? ' on' : ''}` },
    h('button', {
      class: 'lname', type: 'button', title: 'Open this preset',
      onclick: () => setView('presets', { presetId: p.id, pane: 'edit' }),
    }, h('i', { class: `lamp-sm${p.auto && p.auto.enabled ? ' lit' : ''}`, title: p.auto && p.auto.enabled ? 'Auto-copy is on' : '' }), h('span', { class: 'lbl' }, p.name)),
    iconBtn('copy', `Copy “${p.name}” to today`, () => copyPresetNow(p.id), 'quiet')));

  const themeBtn = (val, ic, label) => h('button', {
    type: 'button', class: S.settings.theme === val ? 'on' : '', title: label, a: { 'aria-label': label, 'aria-pressed': String(S.settings.theme === val) },
    onclick: () => { S.settings.theme = val; save(); applyTheme(); renderSidebar(); },
  }, icon(ic));

  const side = h('aside', { class: 'side', a: { 'aria-label': 'Navigation' } },
    h('div', { class: 'brand' }, h('span', { class: 'lamp' }), h('h1', {}, 'Eommu')),
    h('div', { class: 'side-scroll' },
      h('nav', { class: 'nav' },
        navItem('board', 'board', 'All selected lists'),
        navItem('today', 'today', 'Today & overdue', todayN || ''),
        navItem('starred', 'star', 'Starred / priority', starN || ''),
        navItem('calendar', 'cal', 'Calendar'),
        navItem('widget', 'gauge', 'Quick focus'),
        navItem('presets', 'stack', 'Preset daily schedules')),
      h('section', { class: 'grp' },
        h('header', {}, h('h3', {}, 'Lists'), iconBtn('plus', 'New list', newListFlow, 'quiet')),
        h('div', { class: 'grp-rows' }, listRows)),
      h('section', { class: 'grp' },
        h('header', {}, h('h3', {}, 'Presets'), iconBtn('plus', 'New preset', () => newPresetFlow(), 'quiet')),
        h('div', { class: 'grp-rows' }, presetRows.length ? presetRows : h('p', { class: 'empty-note' }, 'No presets yet.')))),
    h('div', { class: 'side-foot' },
      h('div', { class: 'seg icons', role: 'group', a: { 'aria-label': 'Theme' } },
        themeBtn('light', 'sun', 'Light theme'), themeBtn('system', 'sliders', 'Match system theme'), themeBtn('dark', 'moon', 'Dark theme')),
      iconBtn('sliders', 'Settings', openSettings)));

  const old = $('.side');
  if (old) old.replaceWith(side); else $('#app').prepend(side);
  const scrim = $('.scrim');
  if (!scrim) $('#app').append(h('div', { class: 'scrim', onclick: () => { UI.sidebarOpen = false; applyLayout(); } }));
}

async function newListFlow() {
  const name = await promptDialog({ title: 'New list', label: 'List name', confirmLabel: 'Create list', placeholder: 'Groceries' });
  if (!name) return;
  const l = addList(name);
  setView('board');
  const col = $(`.col[data-list="${l.id}"]`);
  if (col) col.scrollIntoView({ inline: 'center', block: 'nearest' });
}

/* ---------- top bar and tab bar ---------- */
function presetMenu(anchor, { listId } = {}) {
  if (!S.presets.length) { toast('Create a preset first.'); setView('presets'); return; }
  const items = [{ head: listId ? `Copy to today in ${L.getList(S, listId).name}` : 'Copy to today' }];
  S.presets.forEach((p) => items.push({
    label: p.name, icon: 'copy', hint: listId ? '' : presetTargetName(p),
    onClick: () => copyPresetNow(p.id, { listId }),
  }));
  items.push({ sep: true }, { label: 'Customize or pick a date', icon: 'cal', hint: 'Ctrl+Shift+P', onClick: () => openCopyModal({ listId }) },
    { label: 'Manage presets', icon: 'stack', onClick: () => setView('presets') });
  openMenu(anchor, items, { align: 'end', width: 240 });
}

/** One tap copies the preset you used last; the arrow chooses another. */
function presetSplit({ listId, cls = '' } = {}) {
  const p = L.getPreset(S, S.settings.lastPresetId) || S.presets[0];
  const main = h('button', {
    class: 'key primary', type: 'button',
    title: p ? `Copy “${p.name}” to today` : 'Create your first preset',
    onclick: () => { if (!p) { setView('presets'); return; } copyPresetNow(p.id, { listId }); },
  }, icon('copy'), h('span', { class: 'lbl' }, p ? 'Copy ' : 'Add a preset', p ? h('b', { class: 'pname' }, `“${p.name}”`) : null, p ? ' to today' : null));
  const caret = h('button', {
    class: 'key primary caret', type: 'button', title: 'Choose a preset', a: { 'aria-label': 'Choose a preset', 'aria-haspopup': 'menu' },
    onclick: () => presetMenu(caret, { listId }),
  }, icon('chevD'));
  return h('div', { class: `split ${cls}` }, main, caret);
}

function renderTopbar() {
  const bar = h('header', { class: 'topbar' },
    h('button', {
      class: 'ibtn menu-btn', type: 'button', title: 'Lists and views', a: { 'aria-label': 'Open navigation' },
      onclick: () => { UI.sidebarOpen = !UI.sidebarOpen; applyLayout(); },
    }, icon('menu')),
    h('h2', { class: 'view-title' }, document.body.classList.contains('m') ? VIEW_SHORT[UI.view] : VIEW_TITLES[UI.view]),
    h('div', { class: 'bar-actions' },
      h('button', { class: 'key', type: 'button', onclick: () => openCapture(), title: 'Capture an external source' },
        icon('inbox'), h('span', { class: 'lbl' }, 'Capture')),
      presetSplit({ cls: 'bar-split' }),
      iconBtn('print', 'Print this view', () => window.print(), 'hide-m'),
      h('button', {
        class: `ibtn${S.settings.compact ? ' on' : ''}`, type: 'button', title: S.settings.compact ? 'Leave sidebar mode' : 'Sidebar mode: a narrow panel for beside other windows',
        a: { 'aria-pressed': String(!!S.settings.compact), 'aria-label': 'Sidebar mode' },
        onclick: () => { S.settings.compact = !S.settings.compact; save(); render(); },
      }, icon('panel'))));
  const old = $('.topbar');
  if (old) old.replaceWith(bar); else $('.stage').prepend(bar);
}

function renderTabbar() {
  const tab = (view, ic, label) => h('button', {
    class: UI.view === view ? 'on' : '', type: 'button', a: { 'aria-current': UI.view === view ? 'page' : 'false' },
    onclick: () => setView(view),
  }, icon(ic), h('span', {}, label));
  const bar = h('nav', { class: 'tabbar', a: { 'aria-label': 'Views' } },
    tab('board', 'board', 'Lists'), tab('today', 'today', 'Today'), tab('calendar', 'cal', 'Calendar'),
    tab('presets', 'stack', 'Presets'), tab('widget', 'gauge', 'Focus'));
  const old = $('.tabbar');
  if (old) old.replaceWith(bar); else $('#app').append(bar);
}

function renderMain() {
  const main = $('#main');
  const v = UI.view;
  const node = v === 'board' ? boardView() : v === 'today' ? todayViewEl() : v === 'starred' ? starredViewEl()
    : v === 'calendar' ? calendarView() : v === 'widget' ? widgetView() : presetsView();
  main.className = `main v-${v}`;
  main.replaceChildren(node);
}

/* ---------- board ---------- */
function listColumn(list, today) {
  const view = L.listView(S, list, today);
  UI.orderCtx[list.id] = view.sections.flatMap((s) => s.units.map((u) => u.task.id));
  const sortNames = { manual: 'My order', due: 'Due date', starred: 'Starred recently', title: 'Title' };

  const titleIn = h('input', { class: 'col-title', type: 'text', value: list.name, maxLength: 120, a: { 'aria-label': 'List name' } });
  titleIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') titleIn.blur();
    if (e.key === 'Escape') { titleIn.value = list.name; titleIn.blur(); }
  });
  titleIn.addEventListener('blur', () => {
    const v = titleIn.value.trim();
    if (v && v !== list.name) { renameList(list.id, v); deferRender(); } else titleIn.value = list.name;
  });

  const menuBtn = h('button', {
    class: 'ibtn quiet', type: 'button', title: 'List actions', a: { 'aria-label': `Actions for ${list.name}`, 'aria-haspopup': 'menu' },
    onclick: () => openMenu(menuBtn, [
      { label: 'Rename', icon: 'rename', onClick: () => { titleIn.focus(); titleIn.select(); } },
      { label: 'Hide from board', icon: 'board', onClick: () => { list.visible = false; commit(); } },
      { sep: true },
      { label: list.isDefault ? 'Default list can’t be deleted' : 'Delete list', icon: 'trash', danger: true, disabled: list.isDefault, onClick: () => deleteList(list.id) },
    ], { align: 'end' }),
  }, icon('more'));

  const sortBtn = h('button', {
    class: 'key small', type: 'button', title: 'Sort this list', a: { 'aria-haspopup': 'menu' },
    onclick: () => openMenu(sortBtn, [{ head: 'Sort this list' }].concat(L.SORTS.map((s) => ({
      label: sortNames[s], icon: 'sort', checked: list.sort === s, onClick: () => setSort(list.id, s),
    })))),
  }, icon('sort'), h('span', {}, sortNames[list.sort]));

  const tools = h('div', { class: 'col-tools' },
    sortBtn,
    h('button', { class: 'key small', type: 'button', onclick: (e) => presetMenu(e.currentTarget, { listId: list.id }) }, icon('plus'), 'Load preset…'),
    h('button', {
      class: 'key small', type: 'button', title: 'Save this list as a reusable preset schedule',
      onclick: () => saveListAsPreset(list.id),
    }, icon('save'), 'Save list as preset'));

  const body = h('div', { class: 'col-body', dataset: { list: list.id }, role: 'list', a: { 'aria-label': `${list.name} tasks` } });
  body.append(addRow(list));
  view.sections.forEach((s) => {
    if (s.label) body.append(h('div', { class: `sec-head ${s.key}` }, h('span', {}, s.label), h('span', { class: 'count soft' }, s.units.length)));
    s.units.forEach((u) => body.append(taskUnit(u, { mode: 'board', drag: true, today })));
  });
  if (!view.count) {
    body.append(h('div', { class: 'empty' },
      h('p', {}, view.completed.length ? 'All done here.' : 'Nothing here yet.'),
      h('p', { class: 'sub' }, 'Add a task above, or load a preset to fill the day.')));
  }
  body.append(completedDrawer(list, view));

  return h('section', { class: `col c${list.color % 6}`, dataset: { list: list.id }, a: { 'aria-label': list.name } },
    h('header', { class: 'col-head' }, h('i', { class: `dot c${list.color % 6}` }), titleIn, h('span', { class: 'count' }, view.count), menuBtn),
    tools, body);
}

function boardView() {
  const today = L.today();
  const lists = S.lists.filter((l) => l.visible).sort((a, b) => a.order - b.order);
  if (!lists.length) {
    return h('div', { class: 'blank' },
      h('p', { class: 'big' }, 'No lists are showing.'),
      h('p', { class: 'sub' }, 'Tick a list in the sidebar to put it on the board.'),
      h('button', { class: 'key primary', type: 'button', onclick: () => { UI.sidebarOpen = true; applyLayout(); } }, 'Open lists'));
  }
  const board = h('div', { class: 'board' }, lists.map((l) => listColumn(l, today)),
    h('button', { class: 'new-col', type: 'button', onclick: newListFlow }, icon('plus'), h('span', {}, 'New list')));
  return board;
}

async function saveListAsPreset(listId) {
  const list = L.getList(S, listId);
  const open = S.tasks.filter((t) => t.listId === listId && !t.isCompleted);
  if (!open.length) { toast('This list has no open tasks to save.'); return; }
  const name = await promptDialog({
    title: 'Save list as preset', label: 'Preset name', value: `${list.name} preset`, confirmLabel: 'Save preset',
  });
  if (!name) return;
  const p = L.presetFromList(S, list, name);
  S.settings.lastPresetId = p.id;
  commit();
  toast(`Saved “${p.name}” with ${p.items.length} item${p.items.length > 1 ? 's' : ''}.`, {
    actions: [{ label: 'Open', fn: () => setView('presets', { presetId: p.id, pane: 'edit' }) }],
  });
}

/* ---------- smart views ---------- */
function emptyState(title, sub, withPreset) {
  return h('div', { class: 'blank' }, h('p', { class: 'big' }, title), h('p', { class: 'sub' }, sub), withPreset ? presetSplit() : null);
}
function rowsFor(tasks, today) {
  return tasks.map((t) => {
    const parent = t.parentId ? L.getTask(S, t.parentId) : null;
    return taskRow(t, { mode: 'smart', showList: true, today, crumb: parent ? parent.title : null });
  });
}
function todayViewEl() {
  const today = L.today();
  const v = L.todayView(S, today);
  if (!v.count) return emptyState('Nothing due today.', 'Anything overdue or due today shows up here, from every list.', true);
  const wrap = h('div', { class: 'panel' });
  if (v.past.length) wrap.append(h('section', { class: 'smart-sec' },
    h('div', { class: 'sec-head past' }, h('span', {}, 'Past due'), h('span', { class: 'count soft' }, v.past.length)),
    h('div', { class: 'smart-rows', role: 'list' }, rowsFor(v.past, today))));
  if (v.today.length) wrap.append(h('section', { class: 'smart-sec' },
    h('div', { class: 'sec-head today' }, h('span', {}, 'Today'), h('span', { class: 'count soft' }, v.today.length)),
    h('div', { class: 'smart-rows', role: 'list' }, rowsFor(v.today, today))));
  return wrap;
}
function starredViewEl() {
  const today = L.today();
  const v = L.starredView(S);
  if (!v.active.length && !v.completed.length) return emptyState('No starred tasks.', 'Star a task or subtask and it appears here, still kept in its own list.', false);
  const wrap = h('div', { class: 'panel' },
    h('section', { class: 'smart-sec' }, h('div', { class: 'smart-rows', role: 'list' }, v.active.length ? rowsFor(v.active, today) : h('p', { class: 'empty-note' }, 'Everything starred is done.'))));
  if (v.completed.length) {
    const open = UI.starDone;
    wrap.append(h('div', { class: `drawer${open ? ' open' : ''}` },
      h('div', { class: 'drawer-head' }, h('button', {
        class: 'drawer-toggle', type: 'button', a: { 'aria-expanded': String(open) },
        onclick: () => { UI.starDone = !open; render(); },
      }, icon('chevR', open ? 'turn' : ''), h('span', {}, `Completed (${v.completed.length})`))),
      open ? h('div', { class: 'drawer-body', role: 'list' }, rowsFor(v.completed, today)) : null));
  }
  return wrap;
}

/* ---------- quick focus widget ---------- */
function widgetView() {
  const today = L.today();
  const st = L.todayStats(S, today);
  const t = L.todayView(S, today);
  const doneToday = S.tasks.filter((x) => x.dueDate === today && x.isCompleted)
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  const N = 20, lit = Math.round((st.pct / 100) * N);
  const segs = Array.from({ length: N }, (_, i) => h('i', { class: i < lit ? 'seg-on' : '' }));
  const full = st.total > 0 && st.done === st.total;
  const date = L.parseDate(today).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  const quick = h('input', {
    class: 'field', type: 'text', placeholder: 'Add something for today', maxLength: 500, a: { 'aria-label': 'Add a task for today' },
  });
  quick.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    const v = quick.value.trim();
    if (!v) return;
    const def = L.defaultList(S);
    addTask(def.id, v, { props: { dueDate: today } });
    commit();
    const q = $('.widget .field'); if (q) q.focus();
  });

  return h('div', { class: 'widget' },
    h('section', { class: 'device', a: { 'aria-label': 'Progress today' } },
      h('p', { class: 'w-date' }, date),
      h('div', { class: 'lcd' },
        h('span', { class: 'pct', a: { 'aria-live': 'polite' } }, `${st.pct}`, h('small', {}, '%')),
        h('span', { class: 'lcd-note' }, st.total ? (full ? 'All done' : `${st.done} of ${st.total} done`) : 'Nothing planned')),
      h('div', { class: `leds${full ? ' full' : ''}`, role: 'progressbar', a: { 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(st.pct), 'aria-label': 'Completed today' } }, segs),
      st.overdue ? h('p', { class: 'w-over' }, h('i', { class: 'led' }), `${st.overdue} overdue ${st.overdue > 1 ? 'tasks are' : 'task is'} included`) : null,
      h('div', { class: 'w-actions' }, presetSplit({ cls: 'wide' })),
      quick),
    h('section', { class: 'w-list', a: { 'aria-label': 'Today’s checklist' } },
      t.past.length ? h('div', { class: 'smart-sec' }, h('div', { class: 'sec-head past' }, h('span', {}, 'Overdue'), h('span', { class: 'count soft' }, t.past.length)),
        h('div', { class: 'smart-rows', role: 'list' }, rowsFor(t.past, today))) : null,
      t.today.length ? h('div', { class: 'smart-sec' }, h('div', { class: 'sec-head today' }, h('span', {}, 'To do today'), h('span', { class: 'count soft' }, t.today.length)),
        h('div', { class: 'smart-rows', role: 'list' }, rowsFor(t.today, today))) : null,
      doneToday.length ? h('div', { class: 'smart-sec' }, h('div', { class: 'sec-head' }, h('span', {}, 'Done'), h('span', { class: 'count soft' }, doneToday.length)),
        h('div', { class: 'smart-rows', role: 'list' }, rowsFor(doneToday, today))) : null,
      !t.count && !doneToday.length ? h('p', { class: 'empty-note center' }, 'Load a preset or add a task to start the day.') : null));
}
