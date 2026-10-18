const assert = require('assert');
const L = require('../src/logic.js');

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.log('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; }
};
const fixed = (iso) => { L.clock.now = () => new Date(iso); };
fixed('2026-10-15T09:00:00');

const mk = () => { const s = L.blankState(); const l = L.newList(s, 'A', true); return { s, l }; };
const task = (s, l, title, extra = {}) => {
  const n = L.topLevel(s.tasks, (t) => t.listId === l.id).length;
  return L.newTask(s, { listId: l.id, title, order: n + 1, ...extra });
};

console.log('dates');
test('addMonths clamps to month end and keeps the anchor day', () => {
  assert.equal(L.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(L.addMonths('2026-02-28', 1, 31), '2026-03-31');
  assert.equal(L.addMonths('2026-12-15', 2), '2027-02-15');
});
test('addYears handles Feb 29', () => {
  assert.equal(L.addYears('2024-02-29', 1), '2025-02-28');
  assert.equal(L.addYears('2024-02-29', 4, 29), '2028-02-29');
});
test('weeks start on Monday', () => {
  assert.equal(L.startOfWeek('2026-10-15'), '2026-10-12'); // Thursday
  assert.equal(L.startOfWeek('2026-10-18'), '2026-10-12'); // Sunday
});

console.log('recurrence');
test('every 2 days', () => {
  const t = { dueDate: '2026-10-15', recur: { freq: 'day', n: 2 } };
  assert.equal(L.nextOccurrence(t, '2026-10-15'), '2026-10-17');
});
test('weekly on Mon and Thu: Thursday goes to Monday', () => {
  const t = { dueDate: '2026-10-15', recur: { freq: 'week', n: 1, weekdays: [1, 4] } };
  assert.equal(L.nextOccurrence(t, '2026-10-15'), '2026-10-19');
});
test('weekly on Mon and Thu: Monday goes to Thursday of the same week', () => {
  const t = { dueDate: '2026-10-12', recur: { freq: 'week', n: 1, weekdays: [1, 4] } };
  assert.equal(L.nextOccurrence(t, '2026-10-12'), '2026-10-15');
});
test('every 2 weeks skips a week', () => {
  const t = { dueDate: '2026-10-15', recur: { freq: 'week', n: 2, weekdays: [4] } };
  assert.equal(L.nextOccurrence(t, '2026-10-15'), '2026-10-29');
});
test('Sunday counts as the end of the week', () => {
  const t = { dueDate: '2026-10-18', recur: { freq: 'week', n: 1, weekdays: [0, 1] } };
  assert.equal(L.nextOccurrence(t, '2026-10-18'), '2026-10-19');
});
test('monthly from the 31st', () => {
  const t = { dueDate: '2026-01-31', recur: { freq: 'month', n: 1, anchorDay: 31 } };
  assert.equal(L.nextOccurrence(t, '2026-01-31'), '2026-02-28');
});
test('overdue repeating task lands on today or later, never in the past', () => {
  const t = { dueDate: '2026-10-10', recur: { freq: 'day', n: 1 } };
  assert.equal(L.nextOccurrence(t, '2026-10-15'), '2026-10-15');
});
test('ends on a date', () => {
  const t = { dueDate: '2026-10-15', recur: { freq: 'day', n: 1, end: { type: 'date', date: '2026-10-15' } } };
  assert.equal(L.nextOccurrence(t, '2026-10-15'), null);
});
test('ends after N occurrences', () => {
  const t = { dueDate: '2026-10-15', recur: { freq: 'day', n: 1, occ: 3, end: { type: 'count', count: 3 } } };
  assert.equal(L.nextOccurrence(t, '2026-10-15'), null);
  t.recur.occ = 2;
  assert.equal(L.nextOccurrence(t, '2026-10-15'), '2026-10-16');
});
test('completing a repeating task spawns the next one with fresh subtasks', () => {
  const { s, l } = mk();
  const t = task(s, l, 'Water plants', { dueDate: '2026-10-15', dueTime: '18:00', recur: { freq: 'day', n: 1, occ: 1 } });
  L.newTask(s, { listId: l.id, parentId: t.id, title: 'Fern', order: 1, dueDate: '2026-10-15' });
  const r = L.setCompleted(s, t.id, true);
  assert.ok(r.spawned);
  assert.equal(r.spawned.dueDate, '2026-10-16');
  assert.equal(r.spawned.dueTime, '18:00');
  assert.equal(r.spawned.recur.occ, 2);
  const kids = L.childrenOf(s.tasks, r.spawned.id);
  assert.equal(kids.length, 1);
  assert.equal(kids[0].isCompleted, false);
  assert.equal(kids[0].dueDate, '2026-10-16');
});
test('unchecking removes the untouched spawned occurrence and re-checking does not double up', () => {
  const { s, l } = mk();
  const t = task(s, l, 'Repeat', { dueDate: '2026-10-15', recur: { freq: 'day', n: 1 } });
  L.setCompleted(s, t.id, true);
  assert.equal(s.tasks.filter((x) => x.title === 'Repeat').length, 2);
  L.setCompleted(s, t.id, false);
  assert.equal(s.tasks.filter((x) => x.title === 'Repeat').length, 1);
  L.setCompleted(s, t.id, true);
  assert.equal(s.tasks.filter((x) => x.title === 'Repeat').length, 2);
});

console.log('completion and hierarchy');
test('completing a parent completes its subtasks and stamps completedAt', () => {
  const { s, l } = mk();
  const p = task(s, l, 'P');
  const k = L.newTask(s, { listId: l.id, parentId: p.id, title: 'K', order: 1 });
  L.setCompleted(s, p.id, true, 1234);
  assert.equal(k.isCompleted, true);
  assert.equal(p.completedAt, 1234);
});
test('unchecking a subtask re-opens the completed parent', () => {
  const { s, l } = mk();
  const p = task(s, l, 'P');
  const k = L.newTask(s, { listId: l.id, parentId: p.id, title: 'K', order: 1 });
  L.setCompleted(s, p.id, true);
  L.setCompleted(s, k.id, false);
  assert.equal(p.isCompleted, false);
  assert.equal(p.completedAt, null);
});
test('indent demotes under the task above and clears recurrence', () => {
  const { s, l } = mk();
  const a = task(s, l, 'A'); const b = task(s, l, 'B', { recur: { freq: 'day', n: 1 } });
  const res = L.indent(s.tasks, b, [a.id, b.id]);
  assert.ok(res.ok);
  assert.equal(b.parentId, a.id);
  assert.equal(b.recur, null);
});
test('indent refuses when nothing is above', () => {
  const { s, l } = mk();
  const a = task(s, l, 'A');
  assert.equal(L.indent(s.tasks, a, [a.id]).ok, false);
});
test('indent flattens existing subtasks so depth never exceeds two', () => {
  const { s, l } = mk();
  const a = task(s, l, 'A'); const b = task(s, l, 'B');
  const bk = L.newTask(s, { listId: l.id, parentId: b.id, title: 'BK', order: 1 });
  const res = L.indent(s.tasks, b, [a.id, b.id]);
  assert.equal(res.flattened, 1);
  assert.equal(bk.parentId, a.id);
  assert.equal(b.parentId, a.id);
});
test('unindent puts the task right below its former parent', () => {
  const { s, l } = mk();
  const a = task(s, l, 'A'); const c = task(s, l, 'C');
  const k = L.newTask(s, { listId: l.id, parentId: a.id, title: 'K', order: 1 });
  L.unindent(s.tasks, k, (t) => t.listId === l.id);
  assert.equal(k.parentId, null);
  assert.deepEqual(L.topLevel(s.tasks).map((t) => t.title), ['A', 'K', 'C']);
});
test('deleting a parent removes its subtasks', () => {
  const { s, l } = mk();
  const a = task(s, l, 'A');
  L.newTask(s, { listId: l.id, parentId: a.id, title: 'K', order: 1 });
  L.deleteTask(s, a.id);
  assert.equal(s.tasks.length, 0);
});
test('place keeps a group order stable when moving a parent', () => {
  const { s, l } = mk();
  const a = task(s, l, 'A'); const b = task(s, l, 'B'); const c = task(s, l, 'C');
  L.place(s.tasks, c, { beforeId: a.id, scope: (t) => t.listId === l.id });
  assert.deepEqual(L.topLevel(s.tasks).map((t) => t.title), ['C', 'A', 'B']);
});

console.log('sorting and views');
const sortFixture = () => {
  const { s, l } = mk();
  task(s, l, 'zebra', { dueDate: '2026-10-20', order: 1 });
  task(s, l, 'apple', { dueDate: '2026-10-14', order: 2 });
  task(s, l, 'mango', { dueDate: '2026-10-15', dueTime: '10:00', order: 3 });
  task(s, l, 'kiwi', { dueDate: '2026-10-16', order: 4 });
  task(s, l, 'none', { order: 5 });
  const star = task(s, l, 'old star', { isStarred: true, starredAt: 100, order: 6 });
  task(s, l, 'new star', { isStarred: true, starredAt: 900, order: 7 });
  void star;
  return { s, l };
};
test('due date groups: past, today, tomorrow, upcoming, none', () => {
  const { s, l } = sortFixture(); l.sort = 'due';
  const v = L.listView(s, l, '2026-10-15');
  assert.deepEqual(v.sections.map((x) => x.key), ['past', 'today', 'tomorrow', 'upcoming', 'none']);
  assert.deepEqual(v.sections[0].units.map((u) => u.task.title), ['apple']);
  assert.deepEqual(v.sections[1].units.map((u) => u.task.title), ['mango']);
});
test('starred recently floats newest star first', () => {
  const { s, l } = sortFixture(); l.sort = 'starred';
  const v = L.listView(s, l, '2026-10-15');
  assert.deepEqual(v.sections[0].units.slice(0, 2).map((u) => u.task.title), ['new star', 'old star']);
});
test('title sorts parents A to Z and keeps subtasks nested', () => {
  const { s, l } = sortFixture(); l.sort = 'title';
  const z = s.tasks.find((t) => t.title === 'zebra');
  L.newTask(s, { listId: l.id, parentId: z.id, title: 'aaa child', order: 1 });
  const v = L.listView(s, l, '2026-10-15');
  const titles = v.sections[0].units.map((u) => u.task.title);
  assert.equal(titles[0], 'apple');
  assert.equal(titles[titles.length - 1], 'zebra');
  assert.equal(v.sections[0].units.at(-1).kids[0].title, 'aaa child');
});
test('completed drawer sorted by completion time, subtasks of open parents get a crumb', () => {
  const { s, l } = mk();
  const a = task(s, l, 'A'); const b = task(s, l, 'B');
  const k = L.newTask(s, { listId: l.id, parentId: b.id, title: 'K', order: 1 });
  L.setCompleted(s, a.id, true, 100);
  L.setCompleted(s, k.id, true, 200);
  const v = L.listView(s, l);
  assert.deepEqual(v.completed.map((c) => c.task.title), ['K', 'A']);
  assert.equal(v.completed[0].crumb, 'B');
  assert.equal(v.count, 1);
});
test('today view collects overdue and today across lists and subtasks', () => {
  const { s, l } = mk();
  const l2 = L.newList(s, 'B');
  task(s, l, 'late', { dueDate: '2026-10-13' });
  const p = task(s, l2, 'parent', { dueDate: '2026-10-30' });
  L.newTask(s, { listId: l2.id, parentId: p.id, title: 'sub today', order: 1, dueDate: '2026-10-15' });
  task(s, l, 'future', { dueDate: '2026-10-20' });
  task(s, l, 'done', { dueDate: '2026-10-15', isCompleted: true, completedAt: 1 });
  const v = L.todayView(s, '2026-10-15');
  assert.deepEqual(v.past.map((t) => t.title), ['late']);
  assert.deepEqual(v.today.map((t) => t.title), ['sub today']);
});
test('starred view spans lists and subtasks', () => {
  const { s, l } = mk();
  const l2 = L.newList(s, 'B');
  task(s, l, 'x', { isStarred: true, starredAt: 5 });
  const p = task(s, l2, 'p');
  L.newTask(s, { listId: l2.id, parentId: p.id, title: 'sub', order: 1, isStarred: true, starredAt: 9 });
  assert.deepEqual(L.starredView(s).active.map((t) => t.title), ['sub', 'x']);
});
test('widget stats count today plus overdue', () => {
  const { s, l } = mk();
  task(s, l, 'a', { dueDate: '2026-10-15', isCompleted: true, completedAt: 1 });
  task(s, l, 'b', { dueDate: '2026-10-15' });
  task(s, l, 'late', { dueDate: '2026-10-10' });
  const st = L.todayStats(s, '2026-10-15');
  assert.deepEqual([st.done, st.total, st.pct, st.overdue], [1, 3, 33, 1]);
});
test('reminders fire for open tasks whose time has arrived today', () => {
  const { s, l } = mk();
  task(s, l, 'due', { dueDate: '2026-10-15', dueTime: '09:00' });
  task(s, l, 'later', { dueDate: '2026-10-15', dueTime: '09:01' });
  task(s, l, 'done', { dueDate: '2026-10-15', dueTime: '08:00', isCompleted: true, completedAt: 1 });
  assert.deepEqual(L.dueReminders(s, '2026-10-15', '09:00').map((t) => t.title), ['due']);
});

console.log('presets');
const presetFixture = () => {
  const s = L.sampleState('2026-10-15');
  const p = s.presets.find((x) => x.name === 'Morning routine');
  return { s, p };
};
test('sample data has lists, presets with subtasks and valid structure', () => {
  const { s } = presetFixture();
  assert.equal(s.lists.filter((l) => l.isDefault).length, 1);
  assert.ok(s.presets.length >= 3);
  assert.ok(s.tasks.some((t) => t.parentId));
});
test('copy to today clones tasks, subtasks, notes, stars and relative times', () => {
  const { s, p } = presetFixture();
  const before = s.tasks.length;
  const r = L.copyPreset(s, p.id, { date: '2026-10-15' });
  assert.equal(r.created, p.items.length);
  assert.equal(s.tasks.length, before + p.items.length);
  const made = s.tasks.filter((t) => t.presetId === p.id);
  assert.ok(made.every((t) => t.dueDate === '2026-10-15'));
  assert.ok(made.find((t) => t.title === 'Wake up and drink water').dueTime === '06:30');
  assert.ok(made.find((t) => t.title === 'Plan the day').isStarred);
  const plan = made.find((t) => t.title === 'Plan the day');
  assert.equal(made.filter((t) => t.parentId === plan.id).length, 2);
});
test('copy to another date binds the same clock times to that date', () => {
  const { s, p } = presetFixture();
  L.copyPreset(s, p.id, { date: '2026-10-20' });
  const t = s.tasks.find((x) => x.presetId === p.id && x.title === 'Breakfast');
  assert.equal(t.dueDate, '2026-10-20');
  assert.equal(t.dueTime, '07:15');
});
test('master preset isolation: changing copies never touches the template', () => {
  const { s, p } = presetFixture();
  const snapshot = JSON.stringify(p.items);
  L.copyPreset(s, p.id, { date: '2026-10-15' });
  const made = s.tasks.filter((t) => t.presetId === p.id);
  made.forEach((t) => { t.title += '!'; t.dueDate = '2030-01-01'; L.setStarred(s, t.id, true); });
  L.setCompleted(s, made[0].id, true);
  made.slice(1).forEach((t) => L.deleteTask(s, t.id));
  assert.equal(JSON.stringify(p.items), snapshot);
});
test('selective copy skips unchecked items and their subtasks', () => {
  const { s, p } = presetFixture();
  const plan = p.items.find((i) => i.title === 'Plan the day');
  const skip = new Set([plan.id, ...L.childrenOf(p.items, plan.id).map((k) => k.id)]);
  L.copyPreset(s, p.id, { date: '2026-10-15', skip });
  assert.equal(s.tasks.filter((t) => t.presetId === p.id && t.title === 'Plan the day').length, 0);
  assert.equal(s.tasks.filter((t) => t.presetId === p.id && t.title === 'Check the calendar').length, 0);
  assert.equal(p.items.length, 8);
});
test('skip mode: leftovers from yesterday move to today instead of duplicating', () => {
  const { s, p } = presetFixture();
  L.copyPreset(s, p.id, { date: '2026-10-14', mode: 'skip' });
  const n = s.tasks.length;
  const done = s.tasks.find((t) => t.presetId === p.id && t.title === 'Breakfast');
  L.setCompleted(s, done.id, true);
  const r = L.copyPreset(s, p.id, { date: '2026-10-15', mode: 'skip' });
  assert.equal(r.created, 1, 'only the completed item is created fresh');
  assert.equal(s.tasks.length, n + 1);
  const left = s.tasks.find((t) => t.presetId === p.id && t.title === 'Wake up and drink water');
  assert.equal(left.dueDate, '2026-10-15');
});
test('skip mode is idempotent on the same day', () => {
  const { s, p } = presetFixture();
  L.copyPreset(s, p.id, { date: '2026-10-15', mode: 'skip' });
  const n = s.tasks.length;
  const r = L.copyPreset(s, p.id, { date: '2026-10-15', mode: 'skip' });
  assert.equal(r.created, 0);
  assert.equal(s.tasks.length, n);
});
test('skip mode adds a missing subtask under an existing parent', () => {
  const { s, p } = presetFixture();
  L.copyPreset(s, p.id, { date: '2026-10-14' });
  const sub = s.tasks.find((t) => t.title === 'Hips and hamstrings');
  L.deleteTask(s, sub.id);
  const r = L.copyPreset(s, p.id, { date: '2026-10-15' });
  assert.equal(r.created, 1);
  assert.equal(s.tasks.filter((t) => t.title === 'Stretch').length, 1);
});
test('fresh mode removes leftover open copies first, keeps completed ones', () => {
  const { s, p } = presetFixture();
  L.copyPreset(s, p.id, { date: '2026-10-14', mode: 'append' });
  const done = s.tasks.find((t) => t.presetId === p.id && t.title === 'Breakfast');
  L.setCompleted(s, done.id, true);
  const r = L.copyPreset(s, p.id, { date: '2026-10-15', mode: 'fresh' });
  assert.ok(r.removed > 0);
  assert.equal(s.tasks.filter((t) => t.presetId === p.id && !t.isCompleted && t.dueDate === '2026-10-14').length, 0);
  assert.equal(s.tasks.filter((t) => t.presetId === p.id && t.title === 'Breakfast').length, 2);
});
test('append mode always adds a full fresh copy', () => {
  const { s, p } = presetFixture();
  L.copyPreset(s, p.id, { date: '2026-10-15', mode: 'append' });
  const n = s.tasks.length;
  L.copyPreset(s, p.id, { date: '2026-10-15', mode: 'append' });
  assert.equal(s.tasks.length, n + p.items.length);
});
test('copy lands in an overridden list', () => {
  const { s, p } = presetFixture();
  const work = s.lists.find((l) => l.name === 'Work');
  L.copyPreset(s, p.id, { date: '2026-10-15', listId: work.id });
  assert.ok(s.tasks.filter((t) => t.presetId === p.id).every((t) => t.listId === work.id));
});
test('save list as preset snapshots open tasks, subtasks, notes, stars and times', () => {
  const { s } = presetFixture();
  const work = s.lists.find((l) => l.name === 'Work');
  const p = L.presetFromList(s, work, 'Work snapshot');
  assert.equal(p.targetListId, work.id);
  const outline = p.items.find((i) => i.title === 'Draft the project outline');
  assert.equal(outline.time, '15:00');
  assert.ok(outline.isStarred);
  assert.ok(outline.notes.includes('example.com'));
  assert.equal(L.childrenOf(p.items, outline.id).length, 2);
});
test('duplicate preset creates independent ids', () => {
  const { s, p } = presetFixture();
  const c = L.clonePreset(s, p);
  assert.notEqual(c.id, p.id);
  assert.ok(c.items.every((i) => !p.items.some((o) => o.id === i.id)));
  const kid = c.items.find((i) => i.parentId);
  assert.ok(c.items.some((i) => i.id === kid.parentId));
});
test('auto-copy fires once per day, on matching weekdays, after the rollover time', () => {
  const { s } = presetFixture();
  const wk = s.presets.find((x) => x.name === 'Weekday study and work');
  wk.auto.enabled = true; // Mon-Fri 08:30
  assert.equal(L.autoCopyDue(s, '2026-10-15', '08:29').length, 0);
  assert.equal(L.autoCopyDue(s, '2026-10-15', '08:30').length, 1);
  assert.equal(L.autoCopyDue(s, '2026-10-17', '09:00').length, 0, 'Saturday');
  L.copyPreset(s, wk.id, { date: '2026-10-15' });
  assert.equal(L.autoCopyDue(s, '2026-10-15', '23:00').length, 0, 'already copied today');
  assert.equal(L.autoCopyDue(s, '2026-10-16', '08:30').length, 1, 'next day');
});

console.log('import and repair');
test('round trip through JSON keeps data intact', () => {
  const s = L.sampleState('2026-10-15');
  const back = L.validateImport(JSON.parse(JSON.stringify({ app: 'eommu', data: s })));
  assert.equal(back.tasks.length, s.tasks.length);
  assert.equal(back.presets.length, s.presets.length);
});
test('rejects files that are not backups', () => {
  assert.throws(() => L.validateImport({ hello: 1 }), /not an Eommu backup/);
  assert.throws(() => L.validateImport([]), /not an Eommu backup/);
  assert.throws(() => L.validateImport(null), /not an Eommu backup/);
});
test('repairs orphans, third level nesting, bad dates and missing lists', () => {
  const s = L.validateImport({
    lists: [{ id: 'l1', name: 'x' }],
    tasks: [
      { id: 'a', listId: 'l1', title: 'A', order: 1 },
      { id: 'b', listId: 'l1', parentId: 'a', title: 'B', order: 1 },
      { id: 'c', listId: 'l1', parentId: 'b', title: 'C', order: 1 },
      { id: 'd', listId: 'gone', parentId: 'nope', title: 'D', dueDate: 'garbage', dueTime: '99:99' },
    ],
  });
  const byId = Object.fromEntries(s.tasks.map((t) => [t.id, t]));
  assert.equal(byId.c.parentId, null);
  assert.equal(byId.d.parentId, null);
  assert.equal(byId.d.listId, 'l1');
  assert.equal(byId.d.dueDate, null);
  assert.equal(byId.d.dueTime, null);
  assert.equal(s.lists.filter((l) => l.isDefault).length, 1);
});
test('markup in titles survives as plain strings (the UI never uses innerHTML)', () => {
  const s = L.validateImport({ lists: [{ id: 'l' }], tasks: [{ id: 't', listId: 'l', title: '<img src=x onerror=alert(1)>' }] });
  assert.equal(s.tasks[0].title, '<img src=x onerror=alert(1)>');
});

console.log('list dates and ordering');
test('a dated list gives its undated tasks that day; a task date wins', () => {
  const { s } = mk();
  const day = L.newList(s, 'Friday plan', false, '2026-10-16');
  const a = L.newTask(s, { listId: day.id, title: 'a', order: 1 });
  const b = L.newTask(s, { listId: day.id, title: 'b', order: 2, dueDate: '2026-10-20' });
  const E = L.dueMap(s);
  assert.equal(E(a), '2026-10-16');
  assert.equal(E(b), '2026-10-20');
  assert.equal(L.dueOf(s, a), '2026-10-16');
});
test('subtasks follow the list date too', () => {
  const { s } = mk();
  const day = L.newList(s, 'Day', false, '2026-10-15');
  const p = L.newTask(s, { listId: day.id, title: 'p', order: 1 });
  L.newTask(s, { listId: day.id, parentId: p.id, title: 'k', order: 1 });
  assert.equal(L.todayView(s).count, 2);
});
test('Today & overdue and the widget count a dated list (late, today, future)', () => {
  const { s } = mk();
  const past = L.newList(s, 'Past', false, '2026-10-10');
  const now = L.newList(s, 'Now', false, '2026-10-15');
  const later = L.newList(s, 'Later', false, '2026-10-30');
  L.newTask(s, { listId: past.id, title: 'x', order: 1 });
  L.newTask(s, { listId: now.id, title: 'y', order: 1 });
  L.newTask(s, { listId: later.id, title: 'z', order: 1 });
  const v = L.todayView(s);
  assert.equal(v.past.length, 1); assert.equal(v.today.length, 1); assert.equal(v.count, 2);
  const st = L.todayStats(s);
  assert.equal(st.total, 2); assert.equal(st.overdue, 1);
});
test('completed tasks of a dated list do not stay overdue', () => {
  const { s } = mk();
  const past = L.newList(s, 'Past', false, '2026-10-10');
  const t = L.newTask(s, { listId: past.id, title: 'x', order: 1 });
  L.setCompleted(s, t.id, true);
  assert.equal(L.todayView(s).count, 0);
});
test('due sort buckets use the list date', () => {
  const { s } = mk();
  const day = L.newList(s, 'Tomorrow', false, '2026-10-16'); day.sort = 'due';
  L.newTask(s, { listId: day.id, title: 'x', order: 1 });
  const v = L.listView(s, day);
  assert.equal(v.sections.length, 1); assert.equal(v.sections[0].key, 'tomorrow');
});
test('an invalid list date is dropped, a valid one survives an export round trip', () => {
  const { s } = mk();
  const a = L.newList(s, 'A', false, '2026-11-02');
  const b = L.newList(s, 'B'); b.dueDate = 'not-a-date';
  const back = L.validateImport(JSON.parse(JSON.stringify(s)));
  assert.equal(back.lists.find((l) => l.id === a.id).dueDate, '2026-11-02');
  assert.equal(back.lists.find((l) => l.id === b.id).dueDate, null);
});
test('a bad date passed to newList is ignored', () => {
  const { s } = mk();
  assert.equal(L.newList(s, 'X', false, '31/12/2026').dueDate, null);
});
test('placing at the end keeps every existing task where it was', () => {
  const { s, l } = mk();
  const scope = (t) => t.listId === l.id;
  ['a', 'b', 'c'].forEach((x) => task(s, l, x));
  const before = L.topLevel(s.tasks, scope).map((t) => t.title);
  const n = L.newTask(s, { listId: l.id, title: 'd' });
  L.place(s.tasks, n, { scope });
  assert.deepEqual(L.topLevel(s.tasks, scope).map((t) => t.title), [...before, 'd']);
  L.normalize(s);
  assert.deepEqual(L.topLevel(s.tasks, scope).map((t) => t.title), ['a', 'b', 'c', 'd']);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
