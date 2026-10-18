/* ===== Eommu sheets: task details, capture external source, settings and backup ===== */
'use strict';

function listSelect(selected) {
  return h('select', { class: 'field', a: { 'aria-label': 'List' } },
    S.lists.slice().sort((a, b) => a.order - b.order).map((l) => h('option', { value: l.id, selected: l.id === selected }, l.name)));
}
function normalizeUrl(u) {
  u = (u || '').trim();
  if (!u) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
  return safeUrl(u) || '';
}

/* ----- task details ----- */
function openTaskSheet(id, { focus } = {}) {
  const t = L.getTask(S, id);
  if (!t) return;
  const sub = !!t.parentId;
  const today = L.today();

  const title = h('input', { class: 'field', type: 'text', value: t.title, maxLength: 500, a: { 'aria-label': 'Title' } });
  const notes = h('textarea', { class: 'field', rows: 3, value: t.notes, placeholder: 'Notes. Links become clickable.', a: { 'aria-label': 'Notes' } });
  const date = h('input', { class: 'field', type: 'date', value: t.dueDate || '', a: { 'aria-label': 'Due date' } });
  const time = h('input', { class: 'field', type: 'time', value: t.dueTime || '', a: { 'aria-label': 'Clock time' } });
  const dateHint = h('p', { class: 'help' });
  const syncHint = () => {
    const ld = (L.getList(S, listSel.value) || {}).dueDate;
    dateHint.hidden = !(ld && !date.value);
    dateHint.textContent = ld ? `No date of its own, so this task follows its list: ${dateLabel(ld)}.` : '';
  };
  const clear = h('button', { class: 'linkbtn', type: 'button', onclick: () => { date.value = ''; time.value = ''; syncRepeat(); syncHint(); } }, 'Clear date and time');
  const listSel = listSelect(t.listId);
  const dayFor = () => ((L.getList(S, listSel.value) || {}).dueDate) || today; // a dated list suggests its own day
  time.addEventListener('change', () => { if (time.value && !date.value) date.value = dayFor(); });
  const star = switchBtn(t.isStarred, () => {}, 'Priority star');
  const srcLabel = h('input', { class: 'field', type: 'text', value: t.source ? t.source.label : '', maxLength: 120, placeholder: 'Label, e.g. Email from Priya', a: { 'aria-label': 'Source label' } });
  const srcUrl = h('input', { class: 'field', type: 'text', value: t.source ? t.source.url : '', placeholder: 'https://', inputMode: 'url', a: { 'aria-label': 'Source link' } });

  /* repeat (top-level tasks only) */
  const r = t.recur || { freq: 'none', n: 1, weekdays: [], end: { type: 'never' } };
  const rs = { freq: r.freq || 'none', n: r.n || 1, weekdays: (r.weekdays || []).slice(), endType: (r.end && r.end.type) || 'never', endDate: (r.end && r.end.date) || '', endCount: (r.end && r.end.count) || 5 };
  const freq = h('select', { class: 'field', a: { 'aria-label': 'Repeat' } },
    [['none', 'Does not repeat'], ['day', 'Days'], ['week', 'Weeks'], ['month', 'Months'], ['year', 'Years']].map(([v, l]) => h('option', { value: v, selected: v === rs.freq }, l)));
  const every = h('input', { class: 'field num', type: 'number', min: 1, max: 365, value: rs.n, a: { 'aria-label': 'Repeat every' } });
  const wk = h('div', { class: 'rep-week' }, h('span', { class: 'fl' }, 'On'), dayPills(WEEK_MON_FIRST, rs.weekdays, (d) => { rs.weekdays = d; }, 'Repeat on weekdays'));
  const endSel = h('select', { class: 'field', a: { 'aria-label': 'Ends' } },
    [['never', 'Never ends'], ['date', 'Ends on a date'], ['count', 'Ends after a number of times']].map(([v, l]) => h('option', { value: v, selected: v === rs.endType }, l)));
  const endDate = h('input', { class: 'field', type: 'date', value: rs.endDate, a: { 'aria-label': 'End date' } });
  const endCount = h('input', { class: 'field num', type: 'number', min: 1, max: 999, value: rs.endCount, a: { 'aria-label': 'Number of occurrences' } });
  const repBox = h('div', { class: 'rep-box' });
  function syncRepeat() {
    const f = freq.value;
    every.parentElement && (every.parentElement.hidden = f === 'none');
    wk.hidden = f !== 'week';
    endSel.parentElement && (endSel.parentElement.hidden = f === 'none');
    endDate.hidden = f === 'none' || endSel.value !== 'date';
    endCount.hidden = f === 'none' || endSel.value !== 'count';
    unitEl.textContent = { day: 'day(s)', week: 'week(s)', month: 'month(s)', year: 'year(s)' }[f] || '';
  }
  const unitEl = h('span', {});
  freq.addEventListener('change', () => {
    if (freq.value !== 'none' && !date.value) date.value = dayFor();
    if (freq.value === 'week' && !rs.weekdays.length && date.value) rs.weekdays = [L.weekday(date.value)];
    if (freq.value === 'week') { wk.replaceChildren(h('span', { class: 'fl' }, 'On'), dayPills(WEEK_MON_FIRST, rs.weekdays, (d) => { rs.weekdays = d; }, 'Repeat on weekdays')); }
    syncRepeat();
  });
  endSel.addEventListener('change', syncRepeat);
  repBox.append(
    h('label', { class: 'fld' }, h('span', {}, 'Repeat'), freq),
    h('div', { class: 'fld inl-row' }, h('span', { class: 'fl' }, 'Every'), every, unitEl),
    wk,
    h('div', { class: 'fld' }, h('span', { class: 'fl' }, 'End'), endSel, endDate, endCount));
  if (rs.freq === 'week' && wk) { /* pills already reflect saved weekdays */ }

  const body = h('div', { class: 'form' },
    h('label', { class: 'fld' }, h('span', {}, 'Title'), title),
    h('label', { class: 'fld' }, h('span', {}, 'Notes'), notes),
    h('div', { class: 'fld' }, h('span', { class: 'fl' }, 'Due'),
      h('div', { class: 'two' }, date, time), clear, dateHint),
    sub ? h('p', { class: 'help' }, 'Subtasks follow their parent’s list and can’t repeat on their own.') : repBox,
    sub ? null : h('label', { class: 'fld' }, h('span', {}, 'List'), listSel),
    h('div', { class: 'fld row' }, h('span', { class: 'fl' }, 'Priority star'), star),
    h('div', { class: 'fld' }, h('span', { class: 'fl' }, 'Source link'),
      h('div', { class: 'two' }, srcLabel, srcUrl)));
  if (sub) repBox.hidden = true;
  syncRepeat();
  date.addEventListener('input', syncHint); date.addEventListener('change', syncHint); listSel.addEventListener('change', syncHint);
  syncHint();

  const dlg = openDialog({
    title: sub ? 'Subtask details' : 'Task details', body, cls: 'sheet',
    actions: [
      { label: 'Delete', kind: 'danger left', onClick: (close) => { close(); removeTask(id); return false; }, stay: true },
      { label: 'Cancel' },
      {
        label: 'Save changes', kind: 'primary',
        onClick: () => {
          const v = title.value.trim();
          if (!v) { toast('Give the task a title.'); title.focus(); return false; }
          if (srcUrl.value.trim() && !normalizeUrl(srcUrl.value)) { toast('That source link is not a web address.'); srcUrl.focus(); return false; }
          let dueDate = L.isDate(date.value) ? date.value : null;
          let dueTime = L.isTime(time.value) ? time.value : null;
          if (dueTime && !dueDate) dueDate = dayFor();
          if (!dueDate) dueTime = null;
          if (!sub && freq.value !== 'none' && !dueDate) dueDate = dayFor();
          let recur = null;
          if (!sub && freq.value !== 'none') {
            const n = Math.max(1, Math.min(365, parseInt(every.value, 10) || 1));
            const end = { type: endSel.value };
            if (end.type === 'date') {
              if (!L.isDate(endDate.value)) { toast('Pick an end date for the repeat.'); endDate.focus(); return false; }
              end.date = endDate.value;
            }
            if (end.type === 'count') end.count = Math.max(1, parseInt(endCount.value, 10) || 1);
            recur = {
              freq: freq.value, n, end, occ: (t.recur && t.recur.occ) || 1,
              weekdays: freq.value === 'week' ? (rs.weekdays.length ? rs.weekdays.slice() : [L.weekday(dueDate || today)]) : [],
              anchorDay: (freq.value === 'month' || freq.value === 'year') && dueDate ? L.parseDate(dueDate).getDate() : undefined,
            };
          }
          const src = srcUrl.value.trim() ? { label: srcLabel.value.trim(), url: normalizeUrl(srcUrl.value) } : null;
          t.title = v; t.notes = notes.value.slice(0, 4000); t.dueDate = dueDate; t.dueTime = dueTime; t.source = src;
          if (!sub) t.recur = recur;
          const wantStar = star.getAttribute('aria-checked') === 'true';
          if (wantStar !== t.isStarred) L.setStarred(S, id, wantStar);
          if (!sub && listSel.value !== t.listId) moveToList(id, listSel.value);
          commit();
          if (dueTime) nudgeNotifications();
        },
      },
    ],
  });
  const fe = { date, time, repeat: freq, title }[focus] || title;
  focusSoon(fe, fe === title);
  void dlg;
}

/* ----- capture external source ----- */
function openCapture(prefill = {}) {
  const today = L.today();
  const title = h('input', { class: 'field', type: 'text', value: prefill.title || '', maxLength: 500, placeholder: 'What needs doing?', a: { 'aria-label': 'Task title' } });
  const label = h('input', { class: 'field', type: 'text', value: prefill.label || '', maxLength: 120, placeholder: 'e.g. Email from Priya', a: { 'aria-label': 'Source label' } });
  const url = h('input', { class: 'field', type: 'text', value: prefill.url || '', placeholder: 'https://', inputMode: 'url', a: { 'aria-label': 'Source link' } });
  const listSel = listSelect((L.defaultList(S) || {}).id);
  const date = h('input', { class: 'field', type: 'date', value: prefill.date || '', a: { 'aria-label': 'Due date' } });
  const time = h('input', { class: 'field', type: 'time', value: '', a: { 'aria-label': 'Clock time' } });
  time.addEventListener('change', () => { if (time.value && !date.value) date.value = today; });
  const body = h('div', { class: 'form' },
    h('p', { class: 'help' }, 'Keep a link to the email, message or document this task came from. It shows on the task as a chip you can open in one click.'),
    h('label', { class: 'fld' }, h('span', {}, 'Task'), title),
    h('div', { class: 'fld' }, h('span', { class: 'fl' }, 'Source'), h('div', { class: 'two' }, label, url)),
    h('label', { class: 'fld' }, h('span', {}, 'List'), listSel),
    h('div', { class: 'fld' }, h('span', { class: 'fl' }, 'Due (optional)'), h('div', { class: 'two' }, date, time)));
  openDialog({
    title: 'Capture external source', body, cls: 'sheet',
    actions: [{ label: 'Cancel' }, {
      label: 'Add task', kind: 'primary',
      onClick: () => {
        const v = title.value.trim();
        if (!v) { toast('Give the task a title.'); title.focus(); return false; }
        if (url.value.trim() && !normalizeUrl(url.value)) { toast('That source link is not a web address.'); url.focus(); return false; }
        const dueDate = L.isDate(date.value) ? date.value : null;
        const t = addTask(listSel.value, v, { props: {
          dueDate, dueTime: dueDate && L.isTime(time.value) ? time.value : null,
          source: url.value.trim() ? { label: label.value.trim(), url: normalizeUrl(url.value) } : null,
        } });
        commit();
        toast(`Added to ${L.getList(S, t.listId).name}.`);
        if (t.dueTime) nudgeNotifications();
      },
    }],
  });
  focusSoon(title);
}

/* ----- backup ----- */
function exportBackup() {
  const payload = { app: 'eommu', version: 1, exportedAt: new Date().toISOString(), data: S };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `eommu-backup-${L.today()}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Backup downloaded.');
}
function importBackup(file) {
  const rd = new FileReader();
  rd.onerror = () => toast('That file could not be read.');
  rd.onload = async () => {
    let next;
    try { next = L.validateImport(JSON.parse(String(rd.result))); }
    catch (e) { toast(e instanceof SyntaxError ? 'That file is not valid JSON.' : e.message, { ms: 7000 }); return; }
    const ok = await confirmDialog(
      `This replaces everything in Eommu with the backup: ${next.lists.length} lists, ${next.tasks.length} tasks and ${next.presets.length} presets. Export first if you want to keep what is here now.`,
      { confirmLabel: 'Replace everything', danger: true, title: 'Restore this backup?' });
    if (!ok) return;
    S = next; commit(); toast('Backup restored.');
  };
  rd.readAsText(file);
}

/* ----- settings ----- */
function openSettings() {
  const themeSeg = () => segmented([['light', 'Light', 'sun'], ['system', 'System', 'sliders'], ['dark', 'Dark', 'moon']], S.settings.theme,
    (v) => { S.settings.theme = v; save(); applyTheme(); renderSidebar(); seg.replaceWith(seg = themeSeg()); }, 'Theme');
  let seg = themeSeg();

  const notifState = h('p', { class: 'help' });
  const notifBtn = h('button', { class: 'key', type: 'button' });
  const testBtn = h('button', { class: 'key', type: 'button', onclick: () => sendTestNotification() }, icon('bell'), 'Send a test');
  const drawNotif = () => {
    const supported = 'Notification' in window;
    const perm = supported ? Notification.permission : 'unsupported';
    notifState.textContent = !supported ? 'This browser does not support notifications. Reminders still show inside Eommu while it is open.'
      : perm === 'granted' ? 'Notifications are allowed. Reminders fire at the clock time you set on a task.'
      : perm === 'denied' ? 'Notifications are blocked for this site. Allow them in your browser or system settings to get alerts outside Eommu.'
      : 'Allow notifications to get a reminder at the clock time of a task, even when Eommu is in the background.';
    notifBtn.hidden = perm !== 'default'; testBtn.hidden = perm !== 'granted';
  };
  notifBtn.append(icon('bell'), 'Allow notifications');
  notifBtn.addEventListener('click', async () => { await requestNotifications(); drawNotif(); });
  drawNotif();

  const installBox = h('div', { class: 'fld' });
  const drawInstall = () => {
    installBox.replaceChildren(h('span', { class: 'fl' }, 'Install as an app'));
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (standalone) installBox.append(h('p', { class: 'help' }, 'Eommu is running as an installed app.'));
    else if (window.deferredInstall) installBox.append(h('button', { class: 'key', type: 'button', onclick: async () => { await promptInstall(); drawInstall(); } }, icon('plus'), 'Install Eommu'));
    else if (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
      installBox.append(h('p', { class: 'help' }, 'On iPhone and iPad: tap Share, then Add to Home Screen. Notifications work once it is installed this way.'));
    } else installBox.append(h('p', { class: 'help' }, 'Use your browser’s Install option in the address bar or menu to put Eommu on your home screen or desktop.'));
  };
  drawInstall();

  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: () => { if (file.files[0]) importBackup(file.files[0]); file.value = ''; } });
  const sc = (k, d) => h('li', {}, h('kbd', {}, k), h('span', {}, d));

  const body = h('div', { class: 'form settings' },
    h('div', { class: 'fld' }, h('span', { class: 'fl' }, 'Theme'), seg),
    h('div', { class: 'fld' }, h('span', { class: 'fl' }, 'Reminders'), notifState, h('div', { class: 'btn-row' }, notifBtn, testBtn)),
    installBox,
    h('div', { class: 'fld row' }, h('span', { class: 'fl' }, 'Sidebar mode'), switchBtn(!!S.settings.compact, (v) => { S.settings.compact = v; save(); render(); }, 'Sidebar mode')),
    h('p', { class: 'help' }, 'Sidebar mode folds Eommu into a narrow 375 px panel on the right, to sit beside other windows.'),
    h('div', { class: 'fld' }, h('span', { class: 'fl' }, 'Backup'),
      h('p', { class: 'help' }, 'Everything lives in this browser. Export a file now and then, and use it to move to another device.'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'key', type: 'button', onclick: exportBackup }, icon('dl'), 'Export backup'),
        h('button', { class: 'key', type: 'button', onclick: () => file.click() }, icon('ul'), 'Import backup'), file)),
    h('div', { class: 'fld' }, h('span', { class: 'fl' }, 'Keyboard shortcuts'),
      h('ul', { class: 'keys' },
        sc('↑ ↓', 'Move between tasks'), sc('Space', 'Complete the focused task'), sc('S', 'Star the focused task'),
        sc('Enter', 'Edit the focused task’s title'), sc('Tab', 'Indent under the task above'), sc('Shift+Tab', 'Unindent to a top-level task'),
        sc('Esc', 'Leave a field and return to the task'), sc('Ctrl+Shift+P', 'Copy a preset to a date'))),
    h('div', { class: 'fld' }, h('span', { class: 'fl' }, 'Data'),
      h('button', {
        class: 'key danger', type: 'button', onclick: async () => {
          const ok = await confirmDialog('All lists, tasks and presets on this device will be removed. Export a backup first if you might want them back.', { confirmLabel: 'Erase everything', danger: true, title: 'Erase all data?' });
          if (!ok) return;
          const keep = S.settings; S = L.blankState(); S.settings = Object.assign(S.settings, keep, { lastPresetId: null });
          UI.presetId = null; commit(); toast('Everything was erased.');
        },
      }, icon('trash'), 'Erase everything')),
    h('p', { class: 'help about' }, 'Eommu 1.0. No account and no server: your data never leaves this device.'));
  openDialog({ title: 'Settings', body, cls: 'sheet', actions: [{ label: 'Done', kind: 'primary' }] });
}
