/* Eommu logic: pure data rules, no DOM. Loaded in the browser and in Node tests. */
const L = (() => {
  'use strict';
  const L = {};

  /* ---------- clock (overridable in tests) ---------- */
  L.clock = { now: () => new Date() };

  /* ---------- ids ---------- */
  let seq = 0;
  L.uid = (p = 'e') =>
    p + Date.now().toString(36).slice(-5) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6);

  /* ---------- dates: all calendar dates are local 'YYYY-MM-DD' strings ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  L.pad = pad;
  L.fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  L.parseDate = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  };
  L.isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(L.parseDate(s));
  L.isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  L.today = () => L.fmtDate(L.clock.now());
  L.nowHM = () => {
    const d = L.clock.now();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  L.addDays = (s, n) => {
    const d = L.parseDate(s);
    d.setDate(d.getDate() + n);
    return L.fmtDate(d);
  };
  L.diffDays = (a, b) => Math.round((L.parseDate(a) - L.parseDate(b)) / 86400000);
  L.weekday = (s) => L.parseDate(s).getDay(); // 0 = Sunday
  const monIdx = (s) => (L.weekday(s) + 6) % 7; // Monday = 0
  L.monIdx = monIdx;
  L.startOfWeek = (s) => L.addDays(s, -monIdx(s)); // weeks run Monday to Sunday
  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  L.addMonths = (s, n, anchorDay) => {
    const d = L.parseDate(s);
    const day = anchorDay || d.getDate();
    const total = d.getFullYear() * 12 + d.getMonth() + n;
    const y = Math.floor(total / 12), m = total % 12;
    return L.fmtDate(new Date(y, m, Math.min(day, daysInMonth(y, m)), 12));
  };
  L.addYears = (s, n, anchorDay) => L.addMonths(s, n * 12, anchorDay);
  L.timeToMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  /* ---------- state shape ---------- */
  const LIST_COLORS = 6; // index into a muted pigment palette in CSS
  const SORTS = ['manual', 'due', 'starred', 'title'];
  L.SORTS = SORTS;

  L.blankState = () => ({
    v: 1,
    lists: [],
    tasks: [],
    presets: [],
    settings: {
      theme: 'system', view: 'board', calMode: 'week', compact: false,
      lastPresetId: null, reminders: true,
    },
  });

  const str = (v, max = 4000) => (typeof v === 'string' ? v.slice(0, max) : '');

  L.newList = (state, name, isDefault = false) => {
    const list = {
      id: L.uid('l'), name: name || 'Untitled list', isDefault, sort: 'manual', visible: true,
      completedOpen: false, color: state.lists.length % LIST_COLORS,
      order: state.lists.reduce((m, l) => Math.max(m, l.order || 0), -1) + 1,
    };
    state.lists.push(list);
    return list;
  };

  L.defaultList = (state) => state.lists.find((l) => l.isDefault) || state.lists[0];
  L.getList = (state, id) => state.lists.find((l) => l.id === id);
  L.getTask = (state, id) => state.tasks.find((t) => t.id === id);
  L.getPreset = (state, id) => state.presets.find((p) => p.id === id);

  L.newTask = (state, props) => {
    const t = Object.assign({
      id: L.uid('t'), listId: null, parentId: null, title: '', notes: '',
      isCompleted: false, completedAt: null, isStarred: false, starredAt: null,
      dueDate: null, dueTime: null, source: null, recur: null, order: 0, createdAt: Date.now(),
      presetId: null, presetItemId: null, spawnedNextId: null,
    }, props);
    state.tasks.push(t);
    return t;
  };

  /* ---------- sibling ordering (shared by tasks and preset items) ---------- */
  const bySiblingOrder = (a, b) => a.order - b.order;

  /** Children of a record, in manual order. */
  L.childrenOf = (records, id) => records.filter((r) => r.parentId === id).sort(bySiblingOrder);

  /** Top-level records in a scope (a list, or a whole preset) in manual order. */
  L.topLevel = (records, scope = () => true) =>
    records.filter((r) => !r.parentId && scope(r)).sort(bySiblingOrder);

  const renumber = (siblings) => siblings.forEach((r, i) => { r.order = i + 1; });

  /**
   * Place `rec` under `parentId` (null = top level), before `beforeId` or at the end.
   * `scope` limits which top-level records count as siblings (the task's list).
   */
  L.place = (records, rec, { parentId = null, beforeId = null, scope = () => true } = {}) => {
    rec.parentId = parentId;
    const sibs = records
      .filter((r) => r !== rec && r.parentId === parentId && (parentId ? true : scope(r)))
      .sort(bySiblingOrder);
    let idx = beforeId ? sibs.findIndex((r) => r.id === beforeId) : -1;
    if (idx < 0) idx = sibs.length;
    sibs.splice(idx, 0, rec);
    renumber(sibs);
  };

  /** Move a record up (-1) or down (+1) among its siblings. */
  L.nudge = (records, rec, dir, scope = () => true) => {
    const sibs = records
      .filter((r) => r.parentId === rec.parentId && (rec.parentId ? true : scope(r)))
      .sort(bySiblingOrder);
    const i = sibs.indexOf(rec), j = i + dir;
    if (j < 0 || j >= sibs.length) return false;
    sibs.splice(i, 1);
    sibs.splice(j, 0, rec);
    renumber(sibs);
    return true;
  };

  /**
   * Demote a top-level record into a subtask of the top-level record directly above it.
   * `orderedTopIds` is the order the person sees. Any subtasks it owned are flattened
   * under the new parent so the tree never exceeds two levels.
   * Returns { ok, reason, flattened }.
   */
  L.indent = (records, rec, orderedTopIds) => {
    if (rec.parentId) return { ok: false, reason: 'already-sub' };
    const i = orderedTopIds.indexOf(rec.id);
    if (i <= 0) return { ok: false, reason: 'no-parent-above' };
    const parent = records.find((r) => r.id === orderedTopIds[i - 1]);
    const kids = L.childrenOf(records, rec.id);
    L.place(records, rec, { parentId: parent.id });
    kids.forEach((k) => L.place(records, k, { parentId: parent.id }));
    if ('recur' in rec) rec.recur = null; // only top-level tasks repeat
    if ('listId' in rec) { rec.listId = parent.listId; kids.forEach((k) => { k.listId = parent.listId; }); }
    return { ok: true, flattened: kids.length };
  };

  /** Promote a subtask to a top-level record, directly below its former parent unit. */
  L.unindent = (records, rec, scope = () => true) => {
    if (!rec.parentId) return { ok: false, reason: 'already-top' };
    const parent = records.find((r) => r.id === rec.parentId);
    const tops = L.topLevel(records, scope).filter((r) => r !== rec);
    const pi = tops.findIndex((r) => r === parent);
    const next = tops[pi + 1];
    L.place(records, rec, { parentId: null, beforeId: next ? next.id : null, scope });
    return { ok: true };
  };

  /* ---------- completion, cascade, recurrence ---------- */
  const STEP = (recur, base) => {
    const n = Math.max(1, parseInt(recur.n, 10) || 1);
    switch (recur.freq) {
      case 'day': return L.addDays(base, n);
      case 'week': {
        const set = (recur.weekdays && recur.weekdays.length ? recur.weekdays : [L.weekday(base)])
          .map((d) => (d + 6) % 7).sort((a, b) => a - b);
        const bi = monIdx(base);
        const later = set.find((d) => d > bi);
        if (later !== undefined) return L.addDays(base, later - bi);
        return L.addDays(base, -bi + 7 * n + set[0]);
      }
      case 'month': return L.addMonths(base, n, recur.anchorDay);
      case 'year': return L.addYears(base, n, recur.anchorDay);
      default: return null;
    }
  };

  /** Next valid date for a repeating task, or null when it has ended. */
  L.nextOccurrence = (task, today = L.today()) => {
    const r = task.recur;
    if (!r || !r.freq || r.freq === 'none') return null;
    let next = STEP(r, task.dueDate || today);
    for (let i = 0; next && next < today && i < 4000; i++) next = STEP(r, next);
    if (!next) return null;
    const end = r.end || { type: 'never' };
    if (end.type === 'date' && end.date && next > end.date) return null;
    if (end.type === 'count' && (r.occ || 1) >= (parseInt(end.count, 10) || 1)) return null;
    return next;
  };

  const cloneTaskBase = (t) => ({
    notes: t.notes, isStarred: t.isStarred, starredAt: t.starredAt, dueTime: t.dueTime,
    source: t.source ? { ...t.source } : null,
  });

  /** Create the next occurrence (with fresh copies of its subtasks). Returns the new task or null. */
  L.spawnNext = (state, task, today = L.today()) => {
    const next = L.nextOccurrence(task, today);
    if (!next) return null;
    const delta = task.dueDate ? L.diffDays(next, task.dueDate) : 0;
    const recur = JSON.parse(JSON.stringify(task.recur));
    recur.occ = (recur.occ || 1) + 1;
    const nt = L.newTask(state, {
      ...cloneTaskBase(task), listId: task.listId, title: task.title, dueDate: next,
      recur, presetId: task.presetId, presetItemId: task.presetItemId,
    });
    L.place(state.tasks, nt, { scope: (r) => r.listId === task.listId });
    // sit right after the original in manual order
    const sibs = L.topLevel(state.tasks, (r) => r.listId === task.listId).filter((r) => r !== nt);
    const at = sibs.findIndex((r) => r.id === task.id);
    sibs.splice(at + 1, 0, nt);
    renumber(sibs);
    L.childrenOf(state.tasks, task.id).forEach((k, i) => {
      const nk = L.newTask(state, {
        ...cloneTaskBase(k), listId: task.listId, parentId: nt.id, title: k.title, order: i + 1,
        dueDate: k.dueDate ? L.addDays(k.dueDate, delta) : null,
        presetId: k.presetId, presetItemId: k.presetItemId,
      });
      void nk;
    });
    task.spawnedNextId = nt.id;
    return nt;
  };

  L.deleteTask = (state, id) => {
    const ids = new Set([id]);
    state.tasks.forEach((t) => { if (t.parentId === id) ids.add(t.id); });
    state.tasks = state.tasks.filter((t) => !ids.has(t.id));
  };

  /**
   * Check or uncheck a task. Returns { spawned } for UI feedback.
   * - Completing a parent completes all subtasks.
   * - Unchecking a subtask re-opens its parent.
   * - Completing a repeating parent spawns the next occurrence; unchecking removes it again
   *   if it has not been touched.
   */
  L.setCompleted = (state, id, done, now = Date.now()) => {
    const t = L.getTask(state, id);
    if (!t || t.isCompleted === done) return { spawned: null };
    const out = { spawned: null };
    if (done) {
      t.isCompleted = true; t.completedAt = now;
      if (!t.parentId) {
        L.childrenOf(state.tasks, t.id).forEach((k) => {
          if (!k.isCompleted) { k.isCompleted = true; k.completedAt = now; }
        });
        if (t.recur && !t.spawnedNextId) out.spawned = L.spawnNext(state, t);
      }
    } else {
      t.isCompleted = false; t.completedAt = null;
      if (t.parentId) {
        const p = L.getTask(state, t.parentId);
        if (p && p.isCompleted) {
          p.isCompleted = false; p.completedAt = null;
          if (p.spawnedNextId) dropSpawned(state, p);
        }
      } else if (t.spawnedNextId) {
        dropSpawned(state, t);
      }
    }
    return out;
  };

  function dropSpawned(state, t) {
    const n = L.getTask(state, t.spawnedNextId);
    if (n && !n.isCompleted) L.deleteTask(state, n.id);
    t.spawnedNextId = null;
  }

  L.setStarred = (state, id, on, now = Date.now()) => {
    const t = L.getTask(state, id);
    if (!t) return;
    t.isStarred = on;
    t.starredAt = on ? now : null;
  };

  /* ---------- views and sorting ---------- */
  const timeKey = (t) => (t.dueTime ? t.dueTime : '');
  const dueCmp = (a, b) => {
    const da = a.dueDate || '9999-99-99', db = b.dueDate || '9999-99-99';
    if (da !== db) return da < db ? -1 : 1;
    // all-day first, then clock times
    const ta = timeKey(a), tb = timeKey(b);
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.order - b.order;
  };

  const effectiveDue = (parent, kids) => {
    if (parent.dueDate) return parent;
    const dated = kids.filter((k) => k.dueDate).sort(dueCmp);
    return dated[0] || parent;
  };

  L.dueBucket = (date, today = L.today()) => {
    if (!date) return 'none';
    if (date < today) return 'past';
    if (date === today) return 'today';
    if (date === L.addDays(today, 1)) return 'tomorrow';
    return 'upcoming';
  };
  const BUCKETS = [['past', 'Past due'], ['today', 'Today'], ['tomorrow', 'Tomorrow'],
    ['upcoming', 'Upcoming'], ['none', 'No due date']];
  L.BUCKETS = BUCKETS;

  /**
   * Everything one list column needs.
   * sections: [{ key, label|null, units: [{ task, kids: [] }] }]
   * completed: [{ task, kids, crumb }]  (completed parents carry their subtasks;
   * a completed subtask of an open parent stands alone with a crumb naming the parent)
   */
  L.listView = (state, list, today = L.today()) => {
    const mine = state.tasks.filter((t) => t.listId === list.id);
    const parents = mine.filter((t) => !t.parentId);
    const kidsOf = (id) => mine.filter((t) => t.parentId === id);
    const active = parents.filter((p) => !p.isCompleted);

    const unit = (p) => {
      let kids = kidsOf(p.id).filter((k) => !k.isCompleted).sort(bySiblingOrder);
      if (list.sort === 'starred') {
        kids = kids.slice().sort((a, b) => (b.isStarred - a.isStarred) || ((b.starredAt || 0) - (a.starredAt || 0)) || a.order - b.order);
      }
      return { task: p, kids };
    };

    let sections;
    const units = active.map(unit);
    switch (list.sort) {
      case 'due': {
        const map = new Map(BUCKETS.map(([k]) => [k, []]));
        units.forEach((u) => {
          const eff = effectiveDue(u.task, u.kids);
          map.get(L.dueBucket(eff.dueDate, today)).push({ u, eff });
        });
        sections = BUCKETS.map(([key, label]) => ({
          key, label,
          units: map.get(key).sort((a, b) => dueCmp(a.eff, b.eff)).map((x) => x.u),
        })).filter((s) => s.units.length);
        break;
      }
      case 'starred':
        sections = [{ key: 'all', label: null, units: units.sort((a, b) =>
          (b.task.isStarred - a.task.isStarred) || ((b.task.starredAt || 0) - (a.task.starredAt || 0)) ||
          a.task.order - b.task.order) }];
        break;
      case 'title':
        sections = [{ key: 'all', label: null, units: units.sort((a, b) =>
          a.task.title.localeCompare(b.task.title, undefined, { sensitivity: 'base', numeric: true }) ||
          a.task.order - b.task.order) }];
        break;
      default:
        sections = [{ key: 'all', label: null, units: units.sort((a, b) => a.task.order - b.task.order) }];
    }

    const completed = [];
    parents.filter((p) => p.isCompleted).forEach((p) =>
      completed.push({ task: p, kids: kidsOf(p.id).sort(bySiblingOrder), crumb: null }));
    parents.filter((p) => !p.isCompleted).forEach((p) =>
      kidsOf(p.id).filter((k) => k.isCompleted).forEach((k) =>
        completed.push({ task: k, kids: [], crumb: p.title })));
    completed.sort((a, b) => (b.task.completedAt || 0) - (a.task.completedAt || 0));

    return { sections, completed, count: active.length };
  };

  /** Uncompleted tasks and subtasks due today or earlier, across every list. */
  L.todayView = (state, today = L.today()) => {
    const hit = state.tasks.filter((t) => !t.isCompleted && t.dueDate && t.dueDate <= today);
    const sorted = hit.sort(dueCmp);
    return {
      past: sorted.filter((t) => t.dueDate < today),
      today: sorted.filter((t) => t.dueDate === today),
      count: sorted.length,
    };
  };

  /** Starred tasks and subtasks across lists, most recently starred first. */
  L.starredView = (state) => {
    const s = state.tasks.filter((t) => t.isStarred);
    const byStar = (a, b) => (b.starredAt || 0) - (a.starredAt || 0);
    return {
      active: s.filter((t) => !t.isCompleted).sort(byStar),
      completed: s.filter((t) => t.isCompleted).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)),
    };
  };

  /** Progress for the quick widget: today's tasks plus anything overdue. */
  L.todayStats = (state, today = L.today()) => {
    const dueToday = state.tasks.filter((t) => t.dueDate === today);
    const overdue = state.tasks.filter((t) => !t.isCompleted && t.dueDate && t.dueDate < today);
    const done = dueToday.filter((t) => t.isCompleted).length;
    const total = dueToday.length + overdue.length;
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0, overdue: overdue.length };
  };

  /** Reminders whose clock time has been reached today and are still open. */
  L.dueReminders = (state, date = L.today(), hm = L.nowHM()) =>
    state.tasks.filter((t) => !t.isCompleted && t.dueDate === date && t.dueTime && t.dueTime <= hm);

  /* ---------- presets ---------- */
  L.newPreset = (state, name) => {
    const p = {
      id: L.uid('p'), name: name || 'New preset', targetListId: (L.defaultList(state) || {}).id || null,
      items: [], conflictMode: 'skip',
      auto: { enabled: false, time: '06:00', days: [0, 1, 2, 3, 4, 5, 6] }, lastCopiedDate: null,
    };
    state.presets.push(p);
    return p;
  };

  L.newPresetItem = (preset, props) => {
    const it = Object.assign({
      id: L.uid('i'), parentId: null, title: '', notes: '', isStarred: false, time: null, order: 0,
    }, props);
    preset.items.push(it);
    return it;
  };

  L.clonePreset = (state, preset, name) => {
    const copy = JSON.parse(JSON.stringify(preset));
    copy.id = L.uid('p');
    copy.name = name || `${preset.name} copy`;
    copy.auto.enabled = false;
    copy.lastCopiedDate = null;
    const map = new Map();
    copy.items.forEach((it) => { const nid = L.uid('i'); map.set(it.id, nid); it.id = nid; });
    copy.items.forEach((it) => { if (it.parentId) it.parentId = map.get(it.parentId) || null; });
    state.presets.push(copy);
    return copy;
  };

  /** Snapshot a list's open tasks, subtasks, notes, stars and clock times as a new preset. */
  L.presetFromList = (state, list, name) => {
    const p = L.newPreset(state, name || `${list.name} preset`);
    p.targetListId = list.id;
    const mine = state.tasks.filter((t) => t.listId === list.id && !t.isCompleted);
    const idMap = new Map();
    L.topLevel(mine).forEach((t, i) => {
      const it = L.newPresetItem(p, { title: t.title, notes: t.notes, isStarred: t.isStarred, time: t.dueTime, order: i + 1 });
      idMap.set(t.id, it.id);
    });
    L.topLevel(mine).forEach((t) => {
      L.childrenOf(mine, t.id).forEach((k, j) => {
        L.newPresetItem(p, { parentId: idMap.get(t.id), title: k.title, notes: k.notes, isStarred: k.isStarred, time: k.dueTime, order: j + 1 });
      });
    });
    return p;
  };

  /**
   * Copy a preset into a list on a date. Every created task is an independent record:
   * nothing in the preset is ever referenced, completed or changed by it.
   * opts: { date, listId, mode: 'skip'|'fresh'|'append', skip: Set<itemId> }
   */
  L.copyPreset = (state, presetId, opts = {}) => {
    const preset = L.getPreset(state, presetId);
    if (!preset) throw new Error('Preset not found');
    const date = opts.date || L.today();
    const listId = opts.listId || preset.targetListId || (L.defaultList(state) || {}).id;
    const mode = opts.mode || preset.conflictMode || 'skip';
    const skip = opts.skip || new Set();
    const res = { created: 0, updated: 0, removed: 0, listId, date };
    const now = Date.now();

    if (mode === 'fresh') {
      const gone = new Set(state.tasks
        .filter((t) => t.listId === listId && t.presetId === preset.id && !t.isCompleted)
        .map((t) => t.id));
      state.tasks.forEach((t) => { if (t.parentId && gone.has(t.parentId) && !t.isCompleted) gone.add(t.id); });
      res.removed = gone.size;
      state.tasks = state.tasks.filter((t) => !gone.has(t.id));
    }

    const tops = L.topLevel(preset.items).filter((it) => !skip.has(it.id));
    const mkProps = (it) => ({
      listId, title: it.title, notes: it.notes, isStarred: it.isStarred,
      starredAt: it.isStarred ? now : null, dueDate: date, dueTime: it.time || null,
      presetId: preset.id, presetItemId: it.id,
    });
    const nextOrder = (parentId) => state.tasks
      .filter((t) => t.parentId === parentId && (parentId ? true : t.listId === listId))
      .reduce((m, t) => Math.max(m, t.order), 0) + 1;

    tops.forEach((it) => {
      const kids = L.childrenOf(preset.items, it.id).filter((k) => !skip.has(k.id));
      let parent = null;
      if (mode === 'skip') {
        parent = state.tasks.find((t) => t.listId === listId && !t.parentId && !t.isCompleted &&
          t.presetId === preset.id && t.presetItemId === it.id) || null;
      }
      if (parent) {
        if (parent.dueDate !== date) { parent.dueDate = date; res.updated++; }
      } else {
        parent = L.newTask(state, { ...mkProps(it), order: nextOrder(null) });
        res.created++;
      }
      kids.forEach((k) => {
        let child = null;
        if (mode === 'skip') {
          child = state.tasks.find((t) => t.parentId === parent.id && !t.isCompleted &&
            t.presetId === preset.id && t.presetItemId === k.id) || null;
        }
        if (child) {
          if (child.dueDate !== date) { child.dueDate = date; res.updated++; }
        } else {
          L.newTask(state, { ...mkProps(k), parentId: parent.id, order: nextOrder(parent.id) });
          res.created++;
        }
      });
    });

    if (date === L.today()) preset.lastCopiedDate = date;
    return res;
  };

  /** Presets whose auto-copy time has arrived today and have not yet run. */
  L.autoCopyDue = (state, date = L.today(), hm = L.nowHM()) => {
    const wd = L.weekday(date);
    return state.presets.filter((p) => p.auto && p.auto.enabled && (p.auto.days || []).includes(wd) &&
      p.auto.time <= hm && p.lastCopiedDate !== date);
  };

  /* ---------- load, normalise, validate ---------- */
  /** Repair anything that would break the app: missing lists, orphans, depth over two, bad fields. */
  L.normalize = (state) => {
    if (!state.lists.length) L.newList(state, 'My tasks', true);
    if (!state.lists.some((l) => l.isDefault)) state.lists[0].isDefault = true;
    const def = L.defaultList(state);
    const listIds = new Set(state.lists.map((l) => l.id));
    const ids = new Set();
    state.tasks = state.tasks.filter((t) => t && typeof t.id === 'string' && !ids.has(t.id) && ids.add(t.id));
    state.tasks.forEach((t) => {
      if (!listIds.has(t.listId)) t.listId = def.id;
      t.title = str(t.title, 500); t.notes = str(t.notes);
      if (!L.isDate(t.dueDate)) t.dueDate = null;
      if (!L.isTime(t.dueTime) || !t.dueDate) t.dueTime = null;
      t.isCompleted = !!t.isCompleted; t.isStarred = !!t.isStarred;
      if (!t.isCompleted) t.completedAt = null;
      if (!t.isStarred) t.starredAt = null;
      if (typeof t.order !== 'number' || isNaN(t.order)) t.order = 0;
      if (t.source && !(typeof t.source.url === 'string' && t.source.url)) t.source = null;
    });
    const byId = new Map(state.tasks.map((t) => [t.id, t]));
    state.tasks.forEach((t) => {
      if (!t.parentId) return;
      const p = byId.get(t.parentId);
      if (!p || p.parentId || p === t) t.parentId = null; // orphan or third level: promote
      else { t.listId = p.listId; t.recur = null; }
    });
    state.lists.forEach((l) => {
      if (!SORTS.includes(l.sort)) l.sort = 'manual';
      l.name = str(l.name, 120) || 'Untitled list';
      if (typeof l.color !== 'number') l.color = 0;
      renumber(L.topLevel(state.tasks, (t) => t.listId === l.id));
    });
    state.tasks.filter((t) => !t.parentId).forEach((p) => renumber(L.childrenOf(state.tasks, p.id)));
    state.presets.forEach((p) => {
      p.name = str(p.name, 120) || 'Untitled preset';
      if (!listIds.has(p.targetListId)) p.targetListId = def.id;
      if (!['skip', 'fresh', 'append'].includes(p.conflictMode)) p.conflictMode = 'skip';
      p.auto = Object.assign({ enabled: false, time: '06:00', days: [0, 1, 2, 3, 4, 5, 6] }, p.auto);
      if (!L.isTime(p.auto.time)) p.auto.time = '06:00';
      p.auto.days = (p.auto.days || []).filter((d) => d >= 0 && d <= 6);
      p.items = (p.items || []).filter((i) => i && typeof i.id === 'string');
      const pm = new Map(p.items.map((i) => [i.id, i]));
      p.items.forEach((i) => {
        i.title = str(i.title, 500); i.notes = str(i.notes);
        if (!L.isTime(i.time)) i.time = null;
        const par = i.parentId && pm.get(i.parentId);
        if (!par || par.parentId) i.parentId = null;
      });
      renumber(L.topLevel(p.items));
      p.items.filter((i) => !i.parentId).forEach((i) => renumber(L.childrenOf(p.items, i.id)));
    });
    state.settings = Object.assign(L.blankState().settings, state.settings);
    return state;
  };

  /** Validate a parsed backup file. Throws a readable Error when it is not an Eommu backup. */
  L.validateImport = (obj) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('This file is not an Eommu backup.');
    const data = obj.data && typeof obj.data === 'object' ? obj.data : obj;
    if (!Array.isArray(data.lists) || !Array.isArray(data.tasks)) {
      throw new Error('This file is missing lists or tasks, so it is not an Eommu backup.');
    }
    const s = L.blankState();
    s.lists = data.lists.filter((l) => l && typeof l.id === 'string').map((l) => ({
      id: l.id, name: l.name, isDefault: !!l.isDefault, sort: l.sort, visible: l.visible !== false,
      completedOpen: !!l.completedOpen, color: l.color, order: l.order || 0,
    }));
    s.tasks = data.tasks.filter((t) => t && typeof t.id === 'string').map((t) => ({
      id: t.id, listId: t.listId, parentId: t.parentId || null, title: t.title, notes: t.notes,
      isCompleted: t.isCompleted, completedAt: typeof t.completedAt === 'number' ? t.completedAt : null,
      isStarred: t.isStarred, starredAt: typeof t.starredAt === 'number' ? t.starredAt : null,
      dueDate: t.dueDate, dueTime: t.dueTime,
      source: t.source && typeof t.source.url === 'string'
        ? { label: str(t.source.label, 120), url: str(t.source.url, 2000) } : null,
      recur: t.recur && typeof t.recur === 'object' ? t.recur : null,
      order: t.order, createdAt: t.createdAt || Date.now(), presetId: t.presetId || null,
      presetItemId: t.presetItemId || null, spawnedNextId: t.spawnedNextId || null,
    }));
    s.presets = Array.isArray(data.presets) ? data.presets.filter((p) => p && typeof p.id === 'string') : [];
    s.settings = Object.assign(s.settings, data.settings || {});
    return L.normalize(s);
  };

  /* ---------- sample content, dated relative to the day of first launch ---------- */
  L.sampleState = (today = L.today()) => {
    const s = L.blankState();
    const my = L.newList(s, 'My tasks', true);
    const sched = L.newList(s, 'Today’s schedule');
    const work = L.newList(s, 'Work');
    const home = L.newList(s, 'Home');
    const T = (list, title, extra = {}, kids = []) => {
      const top = L.topLevel(s.tasks, (t) => t.listId === list.id);
      const t = L.newTask(s, { listId: list.id, title, order: top.length + 1, ...extra });
      if (t.isStarred && !t.starredAt) t.starredAt = Date.now() - Math.random() * 1e6;
      kids.forEach((k, i) => L.newTask(s, { listId: list.id, parentId: t.id, order: i + 1, ...(typeof k === 'string' ? { title: k } : k) }));
      return t;
    };
    T(my, 'Pay the electricity bill', {
      dueDate: L.addDays(today, -1), isStarred: true,
      source: { label: 'Email from the power company', url: 'https://example.com/billing' },
    });
    T(my, 'Renew library card', { dueDate: L.addDays(today, 2) });
    T(my, 'Plan the weekend trip', { dueDate: L.addDays(today, 3), notes: 'Ideas and train times: https://example.com/trip-notes' },
      ['Book train tickets', { title: 'Reserve the guesthouse', dueDate: L.addDays(today, 2) }, 'Write a packing list']);
    T(my, 'Water the plants', {
      dueDate: today, dueTime: '18:00',
      recur: { freq: 'week', n: 1, weekdays: [1, 4], end: { type: 'never' }, occ: 1 },
    });
    T(work, 'Draft the project outline', {
      dueDate: today, dueTime: '15:00', isStarred: true,
      notes: 'Start from the brief at https://example.com/brief and keep it to one page.',
    }, ['List the three goals', 'Sketch the timeline']);
    T(work, 'Send the weekly update', {
      dueDate: L.addDays(today, 1), dueTime: '16:00',
      recur: { freq: 'week', n: 1, weekdays: [5], end: { type: 'never' }, occ: 1 },
    });
    T(work, 'Reply to design feedback', {
      dueDate: today, source: { label: 'Slack thread', url: 'https://example.com/thread' },
    });
    T(home, 'Fix the loose cabinet hinge', {});
    T(home, 'Order printer ink', { dueDate: L.addDays(today, 6) });
    T(home, 'Clear the hall closet', { dueDate: L.addDays(today, 10) }, ['Donate old coats', 'Recycle boxes']);
    T(home, 'Back up family photos', { notes: 'External drive is in the desk drawer.' });
    L.normalize(s);

    const P = (name, items) => {
      const p = L.newPreset(s, name);
      p.targetListId = sched.id;
      items.forEach(([time, title, kids = [], extra = {}], i) => {
        const it = L.newPresetItem(p, { title, time, order: i + 1, ...extra });
        kids.forEach((k, j) => L.newPresetItem(p, {
          parentId: it.id, order: j + 1, ...(typeof k === 'string' ? { title: k } : k),
        }));
      });
      return p;
    };
    P('Morning routine', [
      ['06:30', 'Wake up and drink water'],
      ['06:45', 'Stretch', ['Neck and shoulders', 'Hips and hamstrings']],
      ['07:15', 'Breakfast'],
      ['07:45', 'Plan the day', ['Check the calendar', { title: 'Pick the three that matter', isStarred: true }], { isStarred: true }],
    ]);
    const wk = P('Weekday study and work', [
      ['09:00', 'Deep work block', ['Close chat and email', 'Work on the top task'], { isStarred: true }],
      ['11:00', 'Email and messages'],
      ['13:00', 'Lunch away from the screen'],
      ['14:00', 'Study session', ['Review yesterday’s notes', 'New material', 'Write three questions']],
      ['17:30', 'Shut down and write tomorrow’s list'],
    ]);
    wk.auto.days = [1, 2, 3, 4, 5]; wk.auto.time = '08:30';
    P('Evening reset', [
      ['20:00', 'Tidy the living space'],
      ['20:30', 'Pack the bag for tomorrow'],
      ['21:30', 'Write down what is on your mind'],
      ['22:00', 'Phone on the charger, away from the bed'],
    ]);
    L.normalize(s);
    s.settings.lastPresetId = s.presets[0].id;
    return s;
  };

  return L;
})();

if (typeof module !== 'undefined' && module.exports) module.exports = L;
