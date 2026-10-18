/* ===== Eommu calendar: Day and 7-day grids with an all-day row and hourly slots ===== */
'use strict';

const CAL_FIRST = 6, CAL_LAST = 22; // 06:00 to 22:00

function calChip(t, today, E) {
  const l = L.getList(S, t.listId);
  const late = !t.isCompleted && E(t) < today;
  const chip = h('div', {
    class: `chip c${(l ? l.color : 0) % 6}${t.isCompleted ? ' done' : ''}${late ? ' late' : ''}${t.parentId ? ' sub' : ''}${t.dueDate ? '' : ' inh'}`,
    dataset: { id: t.id, drag: 'chip' }, tabIndex: 0, role: 'button',
    title: `${t.title}${l ? ' – ' + l.name : ''}${t.dueDate ? '' : ' (date from the list)'}`,
    onclick: (e) => { if (!e.target.closest('.check')) openTaskSheet(t.id); },
    onkeydown: (e) => { if (e.key === 'Enter' && e.target === chip) { e.preventDefault(); openTaskSheet(t.id); } },
  },
  h('button', {
    class: 'check mini', type: 'button', role: 'checkbox',
    a: { 'aria-checked': String(t.isCompleted), 'aria-label': t.isCompleted ? 'Mark as not done' : 'Mark as done' },
    onclick: (e) => { e.stopPropagation(); toggleDone(t.id); },
  }, icon('check')),
  h('span', { class: 'ct' }, t.title || 'Untitled'),
  t.dueTime ? h('span', { class: 'cm' }, timeLabel(t.dueTime)) : null,
  t.isStarred ? icon('star', 'smallstar') : null);
  return chip;
}

function calRangeLabel(days, mode) {
  const a = L.parseDate(days[0]), b = L.parseDate(days[days.length - 1]);
  if (mode === 'day') return a.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  const first = a.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const last = sameMonth ? String(b.getDate()) : b.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${first}–${last}, ${b.getFullYear()}`;
}

function calendarView() {
  const today = L.today();
  if (!UI.cal.date) UI.cal.date = today;
  const mode = S.settings.calMode === 'day' ? 'day' : 'week';
  const start = mode === 'week' ? L.startOfWeek(UI.cal.date) : UI.cal.date;
  const days = Array.from({ length: mode === 'week' ? 7 : 1 }, (_, i) => L.addDays(start, i));
  const step = mode === 'week' ? 7 : 1;
  const go = (d) => { UI.cal.date = d; render(); };

  const E = L.dueMap(S); // a task's own date, else the date of its list
  const dated = S.tasks.filter((t) => E(t) && days.includes(E(t)));
  const cmp = (a, b) => (a.dueTime || '').localeCompare(b.dueTime || '') || a.order - b.order;

  const dayHead = days.map((d) => {
    const dt = L.parseDate(d);
    return h('button', {
      class: `day-h${d === today ? ' today' : ''}`, type: 'button', title: mode === 'week' ? 'Open this day' : '',
      onclick: () => { if (mode === 'week') { S.settings.calMode = 'day'; UI.cal.date = d; save(); render(); } },
    }, h('span', { class: 'dn' }, dt.toLocaleDateString([], { weekday: 'short' })), h('span', { class: 'dd' }, dt.getDate()));
  });

  const cols = `56px repeat(${days.length}, minmax(${mode === 'week' ? 124 : 200}px, 1fr))`;
  const minW = 56 + days.length * (mode === 'week' ? 124 : 200);

  const head = h('div', { class: 'cal-head', style: { gridTemplateColumns: cols } },
    h('div', { class: 'gut corner' }),
    dayHead,
    h('div', { class: 'gut ad-label' }, 'All day'),
    days.map((d) => h('div', { class: `allday${d === today ? ' today' : ''}`, dataset: { date: d } },
      dated.filter((t) => E(t) === d && !t.dueTime).sort(cmp).map((t) => calChip(t, today, E)))));

  const body = h('div', { class: 'cal-body', style: { gridTemplateColumns: cols } });
  const nowHM = L.nowHM();
  for (let hr = CAL_FIRST; hr <= CAL_LAST; hr++) {
    body.append(h('div', { class: 'gut hr', dataset: { hour: hr } }, h('span', {}, `${L.pad(hr)}:00`)));
    days.forEach((d) => {
      const inHour = dated.filter((t) => E(t) === d && t.dueTime && Math.min(CAL_LAST, Math.max(CAL_FIRST, parseInt(t.dueTime, 10))) === hr).sort(cmp);
      const slot = h('div', { class: `slot${d === today ? ' today' : ''}`, dataset: { date: d, hour: hr } }, inHour.map((t) => calChip(t, today, E)));
      if (d === today && parseInt(nowHM, 10) === hr) {
        slot.append(h('div', { class: 'nowline', style: { top: `${(parseInt(nowHM.slice(3), 10) / 60) * 100}%` }, title: `Now, ${timeLabel(nowHM)}` }));
      }
      body.append(slot);
    });
  }

  const scroll = h('div', { class: 'cal-scroll' }, h('div', { class: 'cal-inner', style: { minWidth: minW + 'px' } }, head, body));

  const bar = h('div', { class: 'cal-bar' },
    h('div', { class: 'cal-nav' },
      iconBtn('chevL', mode === 'week' ? 'Previous week' : 'Previous day', () => go(L.addDays(UI.cal.date, -step))),
      h('button', { class: 'key small', type: 'button', onclick: () => go(today) }, 'Today'),
      iconBtn('chevR', mode === 'week' ? 'Next week' : 'Next day', () => go(L.addDays(UI.cal.date, step)))),
    h('h3', { class: 'cal-label', a: { 'aria-live': 'polite' } }, calRangeLabel(days, mode)),
    segmented([['day', 'Day'], ['week', '7 days']], mode, (m) => { S.settings.calMode = m; save(); render(); }, 'Calendar range'));

  requestAnimationFrame(() => {
    if (UI.calInit) return;
    UI.calInit = true;
    const target = Math.min(CAL_LAST, Math.max(CAL_FIRST, new Date().getHours() - 1));
    const el = $(`.cal-body .gut.hr[data-hour="${target}"]`);
    const sc = $('.cal-scroll');
    if (el && sc) sc.scrollTop = Math.max(0, el.offsetTop - $('.cal-head').offsetHeight);
  });

  return h('div', { class: 'cal' }, bar, scroll);
}
