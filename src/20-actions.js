/* ===== Eommu actions: every change to data goes through here ===== */
'use strict';

function withUndo(message, fn) {
  const snap = JSON.stringify(S);
  fn();
  commit();
  toast(message, {
    actions: [{ label: 'Undo', fn: () => { S = L.validateImport({ data: JSON.parse(snap) }); commit(); } }],
    ms: 7000,
  });
}

const inList = (listId) => (t) => t.listId === listId;
const $task = (id) => L.getTask(S, id);

/* ----- tasks ----- */
function addTask(listId, title, { parentId = null, afterId = null, props = {} } = {}) {
  const parent = parentId ? $task(parentId) : null;
  const t = L.newTask(S, { listId: parent ? parent.listId : listId, title, parentId, ...props });
  const scope = inList(t.listId);
  if (afterId) {
    const sibs = (parentId ? L.childrenOf(S.tasks, parentId) : L.topLevel(S.tasks, scope)).filter((x) => x !== t);
    const i = sibs.findIndex((x) => x.id === afterId);
    const next = sibs[i + 1];
    L.place(S.tasks, t, { parentId, beforeId: next ? next.id : null, scope });
  } else if (parentId) {
    L.place(S.tasks, t, { parentId });
  } else {
    // one rule, always: a new task goes to the end of its list, so the order is the order you added them
    L.place(S.tasks, t, { scope });
  }
  return t;
}

function setTitle(id, title) {
  const t = $task(id);
  if (!t) return;
  t.title = title.slice(0, 500);
  save();
}

function toggleDone(id) {
  const t = $task(id);
  if (!t) return;
  const res = L.setCompleted(S, id, !t.isCompleted);
  commit();
  if (res.spawned) {
    toast(`Next one is set for ${dateLabel(res.spawned.dueDate)}${res.spawned.dueTime ? ' at ' + timeLabel(res.spawned.dueTime) : ''}.`);
  }
}

function toggleStar(id) {
  const t = $task(id);
  if (!t) return;
  L.setStarred(S, id, !t.isStarred);
  commit();
}

function removeTask(id) {
  const t = $task(id);
  if (!t) return;
  const n = L.childrenOf(S.tasks, id).length;
  withUndo(n ? `Task and ${n} subtask${n > 1 ? 's' : ''} deleted.` : 'Task deleted.', () => L.deleteTask(S, id));
}

function updateTask(id, props) {
  const t = $task(id);
  if (!t) return;
  Object.assign(t, props);
  if (t.dueDate === null) t.dueTime = null;
}

/** Top-level order the person currently sees, for the Tab key and Indent button. */
function visibleTopIds(listId) {
  if (UI.orderCtx[listId]) return UI.orderCtx[listId];
  const list = L.getList(S, listId);
  return L.listView(S, list).sections.flatMap((s) => s.units.map((u) => u.task.id));
}

function indentTask(id) {
  const t = $task(id);
  if (!t) return false;
  if (t.parentId) { toast('Subtasks can only go one level deep.'); return false; }
  const res = L.indent(S.tasks, t, visibleTopIds(t.listId));
  if (!res.ok) { toast('There is no task above to nest this under.'); return false; }
  UI.focusId = id;
  commit();
  if (res.flattened) toast(`Its ${res.flattened} subtask${res.flattened > 1 ? 's' : ''} moved up one level with it.`);
  return true;
}

function unindentTask(id) {
  const t = $task(id);
  if (!t || !t.parentId) return false;
  const res = L.unindent(S.tasks, t, inList(t.listId));
  if (!res.ok) return false;
  UI.focusId = id;
  commit();
  return true;
}

function nudgeTask(id, dir) {
  const t = $task(id);
  if (!t) return;
  const list = L.getList(S, t.listId);
  if (list.sort !== 'manual') { toast('Switch this list to My order to rearrange its tasks.'); return; }
  if (!L.nudge(S.tasks, t, dir, inList(t.listId))) return;
  UI.focusId = id;
  commit();
}

/** Move a parent (with all its subtasks) to another list. */
function moveToList(id, listId, beforeId = null) {
  const t = $task(id);
  if (!t || !L.getList(S, listId)) return;
  const kids = L.childrenOf(S.tasks, id);
  if (t.parentId) { t.parentId = null; }
  t.listId = listId; kids.forEach((k) => { k.listId = listId; });
  L.place(S.tasks, t, { parentId: null, beforeId, scope: inList(listId) });
}

function startSubtask(parentId) {
  const p = $task(parentId);
  if (!p || p.parentId) return;
  if (p.isCompleted) L.setCompleted(S, p.id, false);
  const t = addTask(p.listId, '', { parentId });
  UI.fresh = t.id; UI.focusTitleId = t.id;
  commit();
}

function openNotes(id) { UI.notesOpen = id; render(); }

/* ----- lists ----- */
function addList(name, dueDate = null) {
  const l = L.newList(S, name, false, dueDate);
  commit();
  return l;
}
/** Make a list "for a day" (or clear it). Its undated tasks then follow that date. */
function setListDate(id, date) {
  const l = L.getList(S, id);
  if (!l) return;
  l.dueDate = L.isDate(date) ? date : null;
  commit();
}
function renameList(id, name) {
  const l = L.getList(S, id);
  if (l && name.trim()) { l.name = name.trim().slice(0, 120); save(); }
}
function deleteList(id) {
  const l = L.getList(S, id);
  if (!l || l.isDefault) return;
  const n = S.tasks.filter((t) => t.listId === id).length;
  confirmDialog(
    n ? `“${l.name}” and its ${n} task${n > 1 ? 's' : ''} will be deleted.` : `“${l.name}” will be deleted.`,
    { confirmLabel: 'Delete list', danger: true, title: 'Delete this list?' },
  ).then((ok) => {
    if (!ok) return;
    withUndo(`List “${l.name}” deleted.`, () => {
      S.tasks = S.tasks.filter((t) => t.listId !== id);
      S.lists = S.lists.filter((x) => x.id !== id);
      const def = L.defaultList(S);
      S.presets.forEach((p) => { if (p.targetListId === id) p.targetListId = def.id; });
    });
  });
}
function setSort(listId, sort) {
  const l = L.getList(S, listId);
  if (l) { l.sort = sort; commit(); }
}
function purgeCompleted(listId) {
  const l = L.getList(S, listId);
  const n = S.tasks.filter((t) => t.listId === listId && t.isCompleted).length;
  if (!n) return;
  confirmDialog(`${n} finished task${n > 1 ? 's' : ''} in “${l.name}” will be deleted for good.`,
    { confirmLabel: 'Delete all completed', danger: true, title: 'Clear the completed drawer?' }).then((ok) => {
    if (!ok) return;
    withUndo(`${n} completed task${n > 1 ? 's' : ''} deleted.`, () => {
      // a completed parent goes with its subtasks; a completed subtask of an open parent goes alone
      S.tasks = S.tasks.filter((t) => !(t.listId === listId && t.isCompleted));
    });
  });
}

/* ----- presets ----- */
function presetTargetName(p, listId) {
  const l = L.getList(S, listId || p.targetListId);
  return l ? l.name : 'its list';
}

/** One-click copy. Returns the result, or null if it could not run. */
function copyPresetNow(presetId, opts = {}) {
  const p = L.getPreset(S, presetId);
  if (!p) return null;
  const date = opts.date || L.today();
  const snap = JSON.stringify(S);
  let res;
  try { res = L.copyPreset(S, presetId, { date, listId: opts.listId, mode: opts.mode, skip: opts.skip }); }
  catch (e) { toast('That preset could not be copied.'); return null; }
  S.settings.lastPresetId = presetId;
  commit();
  if (!opts.quiet) {
    const bits = [];
    if (res.created) bits.push(`${res.created} added`);
    if (res.updated) bits.push(`${res.updated} moved to ${dateLabel(date).toLowerCase()}`);
    if (res.removed) bits.push(`${res.removed} old removed`);
    const msg = bits.length ? `${p.name}: ${bits.join(', ')} in ${presetTargetName(p, res.listId)}.`
      : `${p.name} is already in ${presetTargetName(p, res.listId)} for ${dateLabel(date).toLowerCase()}.`;
    const changed = res.created || res.updated || res.removed;
    toast(msg, { actions: changed ? [{ label: 'Undo', fn: () => { S = L.validateImport({ data: JSON.parse(snap) }); commit(); } }] : [], ms: changed ? 7000 : 3500 });
  }
  return res;
}
