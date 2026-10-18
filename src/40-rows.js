/* ===== Eommu task rows: the card, its inline editing, notes, badges and menus ===== */
'use strict';

function listChipFor(listId) {
  const l = L.getList(S, listId);
  if (!l) return null;
  return h('span', { class: `badge listb c${l.color % 6}` }, h('i', { class: 'dot' }), l.name);
}

function sourceChip(src) {
  const url = safeUrl(src.url);
  const label = src.label || (url ? new URL(url).hostname.replace(/^www\./, '') : 'Source');
  if (!url) return h('span', { class: 'badge src' }, icon('link'), label);
  return h('a', { class: 'badge src', href: url, target: '_blank', rel: 'noopener noreferrer', title: url, onclick: (e) => e.stopPropagation() },
    icon('link'), h('span', { class: 'tx' }, label));
}

function dateBadges(t, today, mode = 'board') {
  const out = [];
  const listDate = !t.dueDate && !t.isCompleted ? (L.getList(S, t.listId) || {}).dueDate : null;
  if (listDate && (listDate < today || mode !== 'board')) {
    // the date comes from the list: only worth a badge when it is late, or in views that mix lists
    const past = listDate < today;
    out.push(h('span', { class: `badge date inh${past ? ' late' : ''}`, title: 'This task follows the date of its list' },
      past ? h('i', { class: 'led' }) : icon('cal'), past ? h('b', {}, 'Past due') : null, dateLabel(listDate, today)));
  }
  if (t.dueDate) {
    const past = !t.isCompleted && t.dueDate < today;
    out.push(h('button', {
      class: `badge date${past ? ' late' : ''}`, type: 'button', title: 'Change due date',
      onclick: (e) => { e.stopPropagation(); openTaskSheet(t.id, { focus: 'date' }); },
    }, past ? h('i', { class: 'led' }) : icon('cal'), past ? h('b', {}, 'Past due') : null, dateLabel(t.dueDate, today)));
    if (t.dueTime) {
      out.push(h('button', {
        class: `badge time${past ? ' late' : ''}`, type: 'button', title: 'Change time',
        onclick: (e) => { e.stopPropagation(); openTaskSheet(t.id, { focus: 'time' }); },
      }, icon('clock'), timeLabel(t.dueTime)));
    }
  }
  return out;
}

/* ----- notes: collapsed when empty, expands when clicked or filled; URLs become links ----- */
function notesBlock(t) {
  if (UI.notesOpen === t.id) {
    const ta = h('textarea', {
      class: 'notes-in grow', rows: 2, value: t.notes, placeholder: 'Add notes. Links become clickable.',
      a: { 'aria-label': 'Notes' },
    });
    ta.addEventListener('input', () => autoSize(ta));
    const finish = () => {
      if (ta._done) return; ta._done = true;
      t.notes = ta.value.slice(0, 4000);
      UI.notesOpen = null; save(); deferRender(120);
    };
    ta.addEventListener('blur', finish);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); ta.blur(); }
    });
    UI.focusEl = ta;
    return h('div', { class: 'notes open' }, ta);
  }
  if (!t.notes) return null;
  const view = h('div', {
    class: 'notes', tabIndex: 0, role: 'button', title: 'Edit notes',
    onclick: (e) => { if (e.target.closest('a')) return; openNotes(t.id); },
    onkeydown: (e) => { if (e.key === 'Enter' && e.target === view) { e.preventDefault(); openNotes(t.id); } },
  }, linkify(t.notes));
  return view;
}

function taskMenu(t, anchor, mode) {
  const list = L.getList(S, t.listId);
  const board = mode === 'board';
  const items = [{ label: 'Details', icon: 'sliders', onClick: () => openTaskSheet(t.id) }];
  if (!t.notes) items.push({ label: 'Add notes', icon: 'note', onClick: () => openNotes(t.id) });
  if (!t.parentId && !t.isCompleted) items.push({ label: 'Add subtask', icon: 'plus', onClick: () => startSubtask(t.id) });
  if (board && !t.isCompleted) {
    items.push({ sep: true });
    if (!t.parentId) items.push({ label: 'Indent', icon: 'indent', hint: 'Tab', onClick: () => indentTask(t.id) });
    else items.push({ label: 'Unindent', icon: 'unindent', hint: 'Shift+Tab', onClick: () => unindentTask(t.id) });
    if (list.sort === 'manual') {
      items.push({ label: 'Move up', icon: 'up', onClick: () => nudgeTask(t.id, -1) },
        { label: 'Move down', icon: 'down', onClick: () => nudgeTask(t.id, 1) });
    }
  }
  items.push({ sep: true }, { label: 'Delete', icon: 'trash', danger: true, onClick: () => removeTask(t.id) });
  openMenu(anchor, items, { align: 'end' });
}

/**
 * One task or subtask.
 * o.mode: 'board' (manual editing, drag), 'smart' (aggregate views), 'drawer' (completed)
 */
function taskRow(t, o = {}) {
  const today = o.today || L.today();
  const sub = !!t.parentId;
  const mode = o.mode || 'board';
  const kids = sub ? [] : S.tasks.filter((k) => k.parentId === t.id);
  const row = h('div', {
    class: `task${sub ? ' sub' : ''}${t.isCompleted ? ' done' : ''}${t.isStarred ? ' starred' : ''}`,
    tabIndex: -1, role: 'listitem',
    dataset: { id: t.id, level: sub ? 2 : 1, list: t.listId, parent: t.parentId || '' },
  });
  row.addEventListener('click', (e) => {
    if (e.target === row || e.target.classList.contains('body') || e.target.classList.contains('meta')) { UI.focusId = t.id; row.focus(); }
  });
  row.addEventListener('focus', () => { UI.focusId = t.id; });

  const grip = o.drag
    ? h('span', { class: 'grip', dataset: { drag: 'task' }, title: 'Drag to move', a: { 'aria-hidden': 'true' } }, icon('grip'))
    : null;

  const check = h('button', {
    class: 'check', type: 'button', role: 'checkbox',
    a: { 'aria-checked': String(t.isCompleted), 'aria-label': t.isCompleted ? 'Mark as not done' : 'Mark as done' },
    onclick: (e) => { e.stopPropagation(); toggleDone(t.id); },
  }, icon('check'));

  /* title: an always-editable field, so a click edits immediately with no modal */
  const ta = h('textarea', {
    class: 'title grow', rows: 1, maxLength: 500, value: t.title, spellcheck: true, placeholder: 'Task title',
    a: { 'aria-label': sub ? 'Subtask title' : 'Task title' },
  });
  ta.addEventListener('input', () => autoSize(ta));
  ta.addEventListener('focus', () => { UI.focusId = t.id; });
  const flush = () => {
    const v = ta.value.trim();
    if (v) { if (v !== t.title) setTitle(t.id, v); if (UI.fresh === t.id) UI.fresh = null; return true; }
    return false;
  };
  ta.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!flush()) {
        if (UI.fresh === t.id) { ta._done = true; L.deleteTask(S, t.id); UI.fresh = null; UI.focusId = null; commit(); }
        else { ta.value = t.title; ta.blur(); }
        return;
      }
      ta._done = true;
      if (mode === 'board' && !t.isCompleted) {
        const n = addTask(t.listId, '', { parentId: t.parentId, afterId: t.id });
        UI.fresh = n.id; UI.focusTitleId = n.id; commit();
      } else { save(); ta.blur(); deferRender(0); }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      ta.value = t.title; autoSize(ta); ta._done = true; ta.blur();
      if (UI.fresh === t.id && !t.title) { L.deleteTask(S, t.id); UI.fresh = null; commit(); return; }
      row.focus();
    } else if (e.key === 'Tab' && mode === 'board' && !t.isCompleted) {
      if (!e.shiftKey && !t.parentId) {
        const ids = visibleTopIds(t.listId);
        if (ids.indexOf(t.id) > 0) {
          e.preventDefault();
          if (!flush() && UI.fresh !== t.id) ta.value = t.title;
          ta._done = true; UI.focusTitleId = t.id; indentTask(t.id);
        }
      } else if (e.shiftKey && t.parentId) {
        e.preventDefault(); flush(); ta._done = true; UI.focusTitleId = t.id; unindentTask(t.id);
      }
    }
  });
  ta.addEventListener('blur', () => {
    if (ta._done) return;
    if (flush()) { deferRender(); return; }
    if (UI.fresh === t.id) { L.deleteTask(S, t.id); UI.fresh = null; save(); deferRender(); }
    else ta.value = t.title;
  });
  if (UI.focusTitleId === t.id) UI.focusEl = ta;

  const meta = [];
  if (!sub && t.recur && t.recur.freq && t.recur.freq !== 'none') {
    meta.push(h('button', { class: 'badge rep', type: 'button', title: 'Change repeat', onclick: (e) => { e.stopPropagation(); openTaskSheet(t.id, { focus: 'repeat' }); } },
      icon('repeat'), repeatLabel(t.recur)));
  }
  meta.unshift(...dateBadges(t, today, mode));
  if (t.source) meta.push(sourceChip(t.source));
  if (kids.length) {
    const d = kids.filter((k) => k.isCompleted).length;
    meta.push(h('span', { class: 'badge cnt', title: `${d} of ${kids.length} subtasks done` }, `${d}/${kids.length}`));
  }
  if (o.showList) meta.push(listChipFor(t.listId));
  if (o.crumb) meta.push(h('span', { class: 'badge crumb', title: 'Subtask of' }, 'in ', h('em', {}, o.crumb)));

  const body = h('div', { class: 'body' }, ta, notesBlock(t), meta.length ? h('div', { class: 'meta' }, meta) : null);

  const star = h('button', {
    class: `star${t.isStarred ? ' on' : ''}`, type: 'button', title: t.isStarred ? 'Remove star' : 'Star as priority',
    a: { 'aria-pressed': String(t.isStarred), 'aria-label': t.isStarred ? 'Remove star' : 'Star as priority' },
    onclick: (e) => { e.stopPropagation(); toggleStar(t.id); },
  }, icon('star'));
  const more = h('button', {
    class: 'ibtn quiet', type: 'button', title: 'More actions', a: { 'aria-label': 'More actions', 'aria-haspopup': 'menu' },
    onclick: (e) => { e.stopPropagation(); taskMenu(t, more, mode); },
  }, icon('more'));

  const acts = h('div', { class: 'acts' }, star, more);
  const hovs = h('div', { class: 'hovs' });
  if (!t.dueDate && !t.isCompleted) hovs.append(iconBtn('cal', 'Add a due date', () => openTaskSheet(t.id, { focus: 'date' }), 'quiet'));
  if (mode === 'board' && !t.isCompleted) {
    hovs.append(sub
      ? iconBtn('unindent', 'Unindent (Shift+Tab)', () => unindentTask(t.id), 'quiet')
      : iconBtn('indent', 'Indent (Tab)', () => indentTask(t.id), 'quiet'));
  }

  row.append(...[grip, check, body, acts, hovs.children.length ? hovs : null].filter(Boolean));
  return row;
}

/** A parent with its open subtasks, kept together as one unit. */
function taskUnit(u, o) {
  const wrap = h('div', { class: 'unit', dataset: { unit: u.task.id } });
  wrap.append(taskRow(u.task, o));
  if (u.kids.length) {
    const subs = h('div', { class: 'subs' });
    u.kids.forEach((k) => subs.append(taskRow(k, o)));
    wrap.append(subs);
  }
  return wrap;
}

/** "Add a task": click for an inline input; Enter saves and opens the next one. */
function addRow(list) {
  const btn = () => h('button', {
    class: 'add-row', type: 'button',
    onclick: () => { UI.reopenAdd = null; open(); },
  }, icon('plus'), h('span', {}, 'Add a task'));
  const holder = h('div', { class: 'add-holder' });
  const closed = btn();
  holder.append(closed);

  function open() {
    const ta = h('textarea', { class: 'title grow', rows: 1, maxLength: 500, placeholder: 'Task title', a: { 'aria-label': `New task in ${list.name}` } });
    const wrap = h('div', { class: 'add-row open' }, h('span', { class: 'check ghost', a: { 'aria-hidden': 'true' } }), ta);
    let done = false;
    ta.addEventListener('input', () => autoSize(ta));
    ta.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const v = ta.value.trim();
        if (!v) { done = true; holder.replaceChildren(btn()); return; }
        done = true;
        addTask(list.id, v);
        UI.reopenAdd = list.id;
        commit();
      } else if (e.key === 'Escape') { e.preventDefault(); done = true; holder.replaceChildren(btn()); }
    });
    ta.addEventListener('blur', () => {
      if (done) return;
      const v = ta.value.trim();
      if (v) { addTask(list.id, v); done = true; save(); deferRender(); }
      else { holder.replaceChildren(btn()); }
    });
    holder.replaceChildren(wrap);
    ta.focus();
  }

  if (UI.reopenAdd === list.id) { UI.reopenAdd = null; queueMicrotask(open); }
  return holder;
}

function completedDrawer(list, view) {
  const total = view.completed.reduce((n, c) => n + 1 + c.kids.length, 0);
  const open = !!list.completedOpen;
  const head = h('div', { class: 'drawer-head' },
    h('button', {
      class: 'drawer-toggle', type: 'button', a: { 'aria-expanded': String(open) },
      onclick: () => { list.completedOpen = !open; save(); render(); },
    }, icon('chevR', open ? 'turn' : ''), h('span', {}, `Completed (${total})`)),
    open && total ? h('button', { class: 'key small danger', type: 'button', onclick: () => purgeCompleted(list.id) }, icon('trash'), 'Delete all completed') : null);
  const wrap = h('div', { class: `drawer${open ? ' open' : ''}` }, head);
  if (open) {
    const body = h('div', { class: 'drawer-body', role: 'list' });
    if (!view.completed.length) body.append(h('p', { class: 'empty-note' }, 'Finished tasks will collect here.'));
    view.completed.forEach((c) => {
      const unit = h('div', { class: 'unit' }, taskRow(c.task, { mode: 'drawer', crumb: c.crumb }));
      if (c.kids.length) unit.append(h('div', { class: 'subs' }, c.kids.map((k) => taskRow(k, { mode: 'drawer' }))));
      body.append(unit);
    });
    wrap.append(body);
  }
  return wrap;
}
