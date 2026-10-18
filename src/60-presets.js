/* ===== Eommu presets: reusable daily schedules, kept apart from live task lists ===== */
'use strict';

const MODES = [
  ['skip', 'Skip unfinished duplicates', 'An unfinished copy from an earlier day moves to the new date instead of being duplicated. Everything else is added.'],
  ['fresh', 'Fresh daily reset', 'Unfinished copies this preset made earlier are removed first, then a full new copy is added.'],
  ['append', 'Append all', 'A complete new copy is always added, whatever is already there.'],
];
const modeHelp = (m) => (MODES.find((x) => x[0] === m) || MODES[0])[2];

async function newPresetFlow() {
  const name = await promptDialog({ title: 'New preset', label: 'Preset name', confirmLabel: 'Create preset', placeholder: 'Morning routine' });
  if (!name) return;
  const p = L.newPreset(S, name);
  UI.presetId = p.id; UI.presetAddFocus = p.id;
  commit();
  setView('presets', { presetId: p.id, pane: 'edit' });
}

/* ----- item operations (items mirror tasks: parentId + order, two levels) ----- */
const presetTopIds = (p) => L.topLevel(p.items).map((i) => i.id);
function addItem(p, { parentId = null, afterId = null, title = '' } = {}) {
  const it = L.newPresetItem(p, { title, parentId });
  const sibs = (parentId ? L.childrenOf(p.items, parentId) : L.topLevel(p.items)).filter((x) => x !== it);
  let beforeId = null;
  if (afterId) { const i = sibs.findIndex((x) => x.id === afterId); beforeId = (sibs[i + 1] || {}).id || null; }
  L.place(p.items, it, { parentId, beforeId });
  return it;
}
function removeItem(p, id) {
  withUndo('Item removed from the preset.', () => {
    p.items = p.items.filter((i) => i.id !== id && i.parentId !== id);
  });
}

function presetItemRow(p, it) {
  const sub = !!it.parentId;
  const row = h('div', { class: `task prow${sub ? ' sub' : ''}${it.isStarred ? ' starred' : ''}`, tabIndex: -1, role: 'listitem', dataset: { id: it.id, level: sub ? 2 : 1, parent: it.parentId || '' } });
  const grip = h('span', { class: 'grip', dataset: { drag: 'pitem' }, title: 'Drag to reorder', a: { 'aria-hidden': 'true' } }, icon('grip'));
  const time = h('input', {
    class: 'time-in', type: 'time', value: it.time || '', title: 'Clock time, applied to whatever date you copy to',
    a: { 'aria-label': 'Clock time' },
  });
  time.addEventListener('change', () => { it.time = L.isTime(time.value) ? time.value : null; save(); });

  const ta = h('textarea', { class: 'title grow', rows: 1, maxLength: 500, value: it.title, placeholder: sub ? 'Subtask' : 'Task', spellcheck: true, a: { 'aria-label': 'Preset task title' } });
  ta.addEventListener('input', () => autoSize(ta));
  const flush = () => { const v = ta.value.trim(); if (v) { it.title = v.slice(0, 500); if (UI.fresh === it.id) UI.fresh = null; save(); return true; } return false; };
  ta.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!flush()) { if (UI.fresh === it.id) { ta._done = true; p.items = p.items.filter((x) => x.id !== it.id); UI.fresh = null; commit(); } return; }
      ta._done = true;
      const n = addItem(p, { parentId: it.parentId, afterId: it.id });
      UI.fresh = n.id; UI.focusTitleId = n.id; commit();
    } else if (e.key === 'Escape') { e.preventDefault(); ta.value = it.title; ta._done = true; ta.blur(); }
    else if (e.key === 'Tab') {
      if (!e.shiftKey && !it.parentId && presetTopIds(p).indexOf(it.id) > 0) {
        e.preventDefault(); flush(); ta._done = true; UI.focusTitleId = it.id; indentItem(p, it);
      } else if (e.shiftKey && it.parentId) {
        e.preventDefault(); flush(); ta._done = true; UI.focusTitleId = it.id; unindentItem(p, it);
      }
    }
  });
  ta.addEventListener('blur', () => {
    if (ta._done) return;
    if (flush()) { deferRender(); return; }
    if (UI.fresh === it.id) { p.items = p.items.filter((x) => x.id !== it.id); UI.fresh = null; save(); deferRender(); } else ta.value = it.title;
  });
  if (UI.focusTitleId === it.id) UI.focusEl = ta;

  const star = h('button', {
    class: `star${it.isStarred ? ' on' : ''}`, type: 'button', title: it.isStarred ? 'Remove star' : 'Star as priority',
    a: { 'aria-pressed': String(it.isStarred), 'aria-label': it.isStarred ? 'Remove star' : 'Star as priority' },
    onclick: () => { it.isStarred = !it.isStarred; commit(); },
  }, icon('star'));
  const more = h('button', { class: 'ibtn quiet', type: 'button', title: 'More actions', a: { 'aria-label': 'More actions', 'aria-haspopup': 'menu' },
    onclick: () => {
      const items = [];
      if (!it.notes) items.push({ label: 'Add notes', icon: 'note', onClick: () => openNotes(it.id) });
      if (!sub) items.push({ label: 'Add subtask', icon: 'plus', onClick: () => { const n = addItem(p, { parentId: it.id }); UI.fresh = n.id; UI.focusTitleId = n.id; commit(); } });
      items.push({ label: 'Move up', icon: 'up', onClick: () => { if (L.nudge(p.items, it, -1)) { UI.focusId = it.id; commit(); } } },
        { label: 'Move down', icon: 'down', onClick: () => { if (L.nudge(p.items, it, 1)) { UI.focusId = it.id; commit(); } } },
        { sep: true }, { label: 'Delete item', icon: 'trash', danger: true, onClick: () => removeItem(p, it.id) });
      openMenu(more, items, { align: 'end' });
    } }, icon('more'));

  const acts = h('div', { class: 'acts' },
    sub ? iconBtn('unindent', 'Unindent (Shift+Tab)', () => unindentItem(p, it), 'quiet')
      : iconBtn('indent', 'Indent (Tab)', () => indentItem(p, it), 'quiet'),
    star, more);
  row.append(grip, time, h('div', { class: 'body' }, ta, notesBlock(it)), acts);
  row.addEventListener('focus', () => { UI.focusId = it.id; });
  return row;
}

function indentItem(p, it) {
  const r = L.indent(p.items, it, presetTopIds(p));
  if (!r.ok) { toast(r.reason === 'no-parent-above' ? 'There is no item above to nest this under.' : 'Subtasks only go one level deep.'); return; }
  UI.focusId = it.id; commit();
}
function unindentItem(p, it) {
  if (!L.unindent(p.items, it).ok) return;
  UI.focusId = it.id; commit();
}

function presetEditor(p) {
  const nameIn = h('input', { class: 'pe-name', type: 'text', value: p.name, maxLength: 120, a: { 'aria-label': 'Preset name' } });
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameIn.blur(); if (e.key === 'Escape') { nameIn.value = p.name; nameIn.blur(); } });
  nameIn.addEventListener('blur', () => { const v = nameIn.value.trim(); if (v && v !== p.name) { p.name = v.slice(0, 120); save(); deferRender(); } else nameIn.value = p.name; });

  const head = h('header', { class: 'pe-head' },
    UI.presetPane === 'edit' ? h('button', { class: 'ibtn back-btn', type: 'button', title: 'Back to presets', a: { 'aria-label': 'Back to presets' }, onclick: () => { UI.presetPane = 'list'; render(); } }, icon('chevL')) : null,
    nameIn,
    h('div', { class: 'pe-actions' },
      h('button', { class: 'key primary', type: 'button', onclick: () => copyPresetNow(p.id) }, icon('copy'), 'Copy preset to today'),
      h('button', { class: 'key', type: 'button', onclick: () => openCopyModal({ presetId: p.id }) }, icon('cal'), 'Customize / copy to date'),
      iconBtn('stack', 'Duplicate this preset', () => {
        const c = L.clonePreset(S, p, `${p.name} copy`);
        commit(); setView('presets', { presetId: c.id, pane: 'edit' }); toast(`Duplicated as “${c.name}”.`);
      }),
      iconBtn('trash', 'Delete this preset', async () => {
        const ok = await confirmDialog(`“${p.name}” will be deleted. Tasks already copied from it stay where they are.`, { confirmLabel: 'Delete preset', danger: true, title: 'Delete this preset?' });
        if (!ok) return;
        withUndo(`Preset “${p.name}” deleted.`, () => {
          S.presets = S.presets.filter((x) => x.id !== p.id);
          if (S.settings.lastPresetId === p.id) S.settings.lastPresetId = null;
          UI.presetId = null; UI.presetPane = 'list';
        });
      }, 'danger-i')));

  const listSel = h('select', { class: 'field', a: { 'aria-label': 'Target task list' }, onchange: () => { p.targetListId = listSel.value; save(); } },
    S.lists.slice().sort((a, b) => a.order - b.order).map((l) => h('option', { value: l.id, selected: l.id === p.targetListId }, l.name)));
  const modeSel = h('select', { class: 'field', a: { 'aria-label': 'When tasks already exist' } }, MODES.map(([v, label]) => h('option', { value: v, selected: v === p.conflictMode }, label)));
  const help = h('p', { class: 'help' }, modeHelp(p.conflictMode));
  modeSel.addEventListener('change', () => { p.conflictMode = modeSel.value; help.textContent = modeHelp(p.conflictMode); save(); });

  const autoTime = h('input', { class: 'field time', type: 'time', value: p.auto.time, a: { 'aria-label': 'Rollover time' } });
  const autoNote = h('p', { class: 'help' });
  const updNote = () => {
    autoNote.textContent = p.auto.enabled
      ? `Copies into ${presetTargetName(p)} at ${timeLabel(p.auto.time)} on the days chosen, the first time Eommu is open after that. Copying by hand today counts too.${p.lastCopiedDate ? ` Last copied ${dateLabel(p.lastCopiedDate)}.` : ''}`
      : 'Off. Turn it on to have this preset copied for you each day.';
  };
  autoTime.addEventListener('change', () => { if (L.isTime(autoTime.value)) { p.auto.time = autoTime.value; save(); updNote(); } else autoTime.value = p.auto.time; });
  const autoSw = switchBtn(p.auto.enabled, (on) => {
    p.auto.enabled = on;
    if (on && L.nowHM() >= p.auto.time && p.lastCopiedDate !== L.today()) {
      p.lastCopiedDate = L.today(); // don't copy straight away just because it was switched on late
      toast(`Auto-copy starts tomorrow at ${timeLabel(p.auto.time)}.`);
    }
    save(); updNote(); renderSidebar();
  }, 'Auto-copy every day');
  updNote();

  const settings = h('section', { class: 'pe-set' },
    h('label', { class: 'fld' }, h('span', {}, 'Copy into list'), listSel),
    h('div', { class: 'fld' }, h('label', { class: 'fl' }, 'If tasks from this preset already exist'), modeSel, help),
    h('div', { class: 'fld auto' },
      h('div', { class: 'auto-row' }, h('span', { class: 'fl' }, 'Auto-copy every day'), autoSw, h('label', { class: 'inl' }, h('span', {}, 'at'), autoTime)),
      dayPills(WEEK_SUN_FIRST, p.auto.days, (d) => { p.auto.days = d; save(); }, 'Days of the week'),
      autoNote));

  const items = h('section', { class: 'pe-items', a: { 'aria-label': 'Preset tasks' } });
  const ordered = L.topLevel(p.items);
  const list = h('div', { class: 'pe-rows', role: 'list', dataset: { preset: p.id } });
  ordered.forEach((it) => {
    const unit = h('div', { class: 'unit', dataset: { unit: it.id } }, presetItemRow(p, it));
    const kids = L.childrenOf(p.items, it.id);
    if (kids.length) unit.append(h('div', { class: 'subs' }, kids.map((k) => presetItemRow(p, k))));
    list.append(unit);
  });
  const add = h('textarea', { class: 'title grow add-in', rows: 1, maxLength: 500, placeholder: 'Add a task to this schedule', a: { 'aria-label': 'Add a task to this preset' } });
  add.addEventListener('input', () => autoSize(add));
  add.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    const v = add.value.trim();
    if (!v) return;
    const it = addItem(p, { title: v });
    void it; UI.presetAddFocus = p.id; commit();
  });
  if (UI.presetAddFocus === p.id) { UI.presetAddFocus = null; UI.focusEl = add; }
  items.append(
    h('div', { class: 'pe-items-head' }, h('h3', {}, 'Schedule'), h('p', { class: 'help' }, 'Times repeat daily. They attach to whichever date you copy to.')),
    list,
    h('div', { class: 'pe-add' }, icon('plus'), add));
  if (!ordered.length) list.append(h('p', { class: 'empty-note' }, 'Nothing in this schedule yet. Add the tasks you do every day, in order.'));

  return h('div', { class: 'pe' }, head, settings, items);
}

function presetsView() {
  const wide = !document.body.classList.contains('m');
  if (wide && (!UI.presetId || !L.getPreset(S, UI.presetId)) && S.presets.length) UI.presetId = S.presets[0].id;
  if (UI.presetId && !L.getPreset(S, UI.presetId)) UI.presetId = null;
  const cur = UI.presetId ? L.getPreset(S, UI.presetId) : null;

  const cards = S.presets.map((p) => {
    const parents = p.items.filter((i) => !i.parentId).length;
    const open = () => { UI.presetId = p.id; UI.presetPane = 'edit'; S.settings.view = 'presets'; render(); };
    return h('div', { class: `pcard${cur && cur.id === p.id ? ' on' : ''}` },
      h('button', { class: 'pc-main', type: 'button', onclick: open },
        h('span', { class: 'pc-name' }, h('i', { class: `lamp-sm${p.auto.enabled ? ' lit' : ''}` }), p.name),
        h('span', { class: 'pc-sub' }, `${parents} task${parents === 1 ? '' : 's'} into ${presetTargetName(p)}${p.auto.enabled ? `, auto at ${timeLabel(p.auto.time)}` : ''}`)),
      iconBtn('copy', `Copy “${p.name}” to today`, () => copyPresetNow(p.id)));
  });
  const listPane = h('aside', { class: 'pm-list' },
    h('div', { class: 'pm-list-head' }, h('h3', {}, 'Presets'),
      h('button', { class: 'key small', type: 'button', onclick: () => newPresetFlow() }, icon('plus'), 'New preset')),
    cards.length ? h('div', { class: 'pcards' }, cards) : h('p', { class: 'empty-note' }, 'Build a schedule once, then copy it into any day with one tap.'));

  const editPane = h('div', { class: 'pm-edit' }, cur ? presetEditor(cur)
    : h('div', { class: 'blank' }, h('p', { class: 'big' }, 'No preset open.'), h('p', { class: 'sub' }, 'Make a schedule you can copy into any day.'),
      h('button', { class: 'key primary', type: 'button', onclick: () => newPresetFlow() }, icon('plus'), 'New preset')));

  const showEdit = wide || (UI.presetPane === 'edit' && cur);
  const showList = wide || !showEdit;
  return h('div', { class: `pm${wide ? ' wide' : ''}` }, showList ? listPane : null, showEdit ? editPane : null);
}

/* ----- Customize / copy to date ----- */
function openCopyModal({ presetId, listId, date } = {}) {
  if (!S.presets.length) { toast('Create a preset first.'); setView('presets'); return; }
  let p = L.getPreset(S, presetId) || L.getPreset(S, S.settings.lastPresetId) || S.presets[0];
  const today = L.today();
  const st = { date: date || today, listId: listId || p.targetListId, mode: p.conflictMode, off: new Set(), choice: 'today' };
  if (st.date === L.addDays(today, 1)) st.choice = 'tomorrow'; else if (st.date !== today) st.choice = 'pick';

  const presetSel = h('select', { class: 'field', a: { 'aria-label': 'Preset' } }, S.presets.map((x) => h('option', { value: x.id, selected: x.id === p.id }, x.name)));
  const listSel = h('select', { class: 'field', a: { 'aria-label': 'Destination list' } },
    S.lists.slice().sort((a, b) => a.order - b.order).map((l) => h('option', { value: l.id, selected: l.id === st.listId }, l.name)));
  const modeSel = h('select', { class: 'field', a: { 'aria-label': 'Duplicate handling' } }, MODES.map(([v, label]) => h('option', { value: v, selected: v === st.mode }, label)));
  const dateIn = h('input', { class: 'field', type: 'date', min: today, value: st.date, a: { 'aria-label': 'Date' } });
  const checklist = h('div', { class: 'checklist', role: 'group', a: { 'aria-label': 'Tasks to copy' } });
  const countEl = h('span', {});
  const dateSeg = h('div', { class: 'seg', role: 'group', a: { 'aria-label': 'When' } });
  let userPicked = !!date;   // once the person chooses a day, a dated list no longer suggests one
  const copyBtnLabel = () => {
    const n = p.items.filter((i) => !st.off.has(i.id)).length;
    countEl.textContent = `Copy ${n} item${n === 1 ? '' : 's'}`;
  };

  function drawDateSeg() {
    dateSeg.replaceChildren(...[['today', 'Today'], ['tomorrow', 'Tomorrow'], ['pick', 'Pick a date']].map(([v, label]) => h('button', {
      type: 'button', class: st.choice === v ? 'on' : '', a: { 'aria-pressed': String(st.choice === v) },
      onclick: () => {
        st.choice = v; userPicked = true;
        if (v === 'today') st.date = today; else if (v === 'tomorrow') st.date = L.addDays(today, 1);
        dateIn.value = st.date; dateIn.hidden = v !== 'pick'; drawDateSeg();
      },
    }, label)));
  }
  function drawChecklist() {
    checklist.replaceChildren();
    L.topLevel(p.items).forEach((it) => {
      const kids = L.childrenOf(p.items, it.id);
      const parentOff = st.off.has(it.id);
      const mk = (x, sub, disabled) => {
        const cb = h('input', { type: 'checkbox', checked: !st.off.has(x.id) && !disabled, disabled });
        cb.addEventListener('change', () => { if (cb.checked) st.off.delete(x.id); else st.off.add(x.id); drawChecklist(); copyBtnLabel(); });
        return h('label', { class: `ck${sub ? ' sub' : ''}${disabled ? ' off' : ''}` }, cb, h('span', { class: 'box' }, icon('check')),
          x.time ? h('span', { class: 'ck-time' }, timeLabel(x.time)) : h('span', { class: 'ck-time none' }, 'Any time'), h('span', { class: 'ck-t' }, x.title || 'Untitled'));
      };
      checklist.append(mk(it, false, false));
      kids.forEach((k) => checklist.append(mk(k, true, parentOff)));
    });
    if (!p.items.length) checklist.append(h('p', { class: 'empty-note' }, 'This preset is empty.'));
  }

  presetSel.addEventListener('change', () => {
    p = L.getPreset(S, presetSel.value); st.off = new Set();
    st.listId = p.targetListId; listSel.value = st.listId; st.mode = p.conflictMode; modeSel.value = st.mode;
    followList(); drawChecklist(); copyBtnLabel();
  });
  /** A list that is for one day suggests that day, unless the person already picked another. */
  function followList() {
    if (userPicked) return;
    const ld = (L.getList(S, st.listId) || {}).dueDate;
    const d = ld && ld >= today ? ld : today;
    st.date = d;
    st.choice = d === today ? 'today' : d === L.addDays(today, 1) ? 'tomorrow' : 'pick';
    dateIn.value = d; dateIn.hidden = st.choice !== 'pick'; drawDateSeg();
  }
  listSel.addEventListener('change', () => { st.listId = listSel.value; followList(); });
  modeSel.addEventListener('change', () => { st.mode = modeSel.value; modeNote.textContent = modeHelp(st.mode); });
  dateIn.addEventListener('change', () => { userPicked = true; if (L.isDate(dateIn.value) && dateIn.value >= today) st.date = dateIn.value; else dateIn.value = st.date; });
  const modeNote = h('p', { class: 'help' }, modeHelp(st.mode));
  dateIn.hidden = st.choice !== 'pick';
  drawDateSeg(); followList(); drawChecklist(); copyBtnLabel();

  const body = h('div', { class: 'copy-form' },
    h('label', { class: 'fld' }, h('span', {}, 'Preset'), presetSel),
    h('div', { class: 'fld' }, h('span', { class: 'fl' }, 'Copy to'), dateSeg, dateIn),
    h('label', { class: 'fld' }, h('span', {}, 'Into list'), listSel),
    h('div', { class: 'fld' }, h('label', { class: 'fl' }, 'If tasks from this preset already exist'), modeSel, modeNote),
    h('div', { class: 'fld' },
      h('div', { class: 'fl-row' }, h('span', { class: 'fl' }, 'Tasks to include'),
        h('span', { class: 'mini-actions' },
          h('button', { class: 'linkbtn', type: 'button', onclick: () => { st.off = new Set(); drawChecklist(); copyBtnLabel(); } }, 'All'),
          h('button', { class: 'linkbtn', type: 'button', onclick: () => { st.off = new Set(p.items.map((i) => i.id)); drawChecklist(); copyBtnLabel(); } }, 'None'))),
      checklist,
      h('p', { class: 'help' }, 'Unchecked tasks are skipped for this copy only. The saved preset does not change.')));

  openDialog({
    title: 'Copy preset to a date', body, cls: 'wide-dlg',
    actions: [{ label: 'Cancel' }, {
      label: 'Copy', kind: 'primary', onClick: () => {
        const skip = new Set(st.off);
        p.items.forEach((i) => { if (i.parentId && st.off.has(i.parentId)) skip.add(i.id); });
        if (skip.size >= p.items.length) { toast('Pick at least one task to copy.'); return false; }
        copyPresetNow(p.id, { date: st.date, listId: st.listId, mode: st.mode, skip });
      },
    }],
  });
  // make the primary button show the live count
  const prim = $('dialog.wide-dlg .dlg-foot .key.primary');
  if (prim) { prim.replaceChildren(countEl); }
}
