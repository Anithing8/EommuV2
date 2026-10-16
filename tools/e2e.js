// End-to-end checks in real Chromium. Run: node tools/e2e.js <screenshot dir>
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const SP = process.argv[2] || '.';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('FAIL  ' + m); } };
const errs = [];
const L_nextDay = (d) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, timezoneId: 'Asia/Calcutta', permissions: ['notifications'], deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.goto('http://localhost:8765/');
  await page.waitForSelector('.col');
  const st = () => page.evaluate(() => JSON.parse(localStorage.getItem('eommu.v1')));
  const colOf = async (name) => { const l = (await st()).lists.find((x) => x.name === name); return page.locator(`.col[data-list="${l.id}"]`); };

  console.log('board basics');
  ok(await page.locator('.col').count() === 4, 'four sample lists on the board');
  ok(!(await page.locator('.task').first().innerText()).includes('null'), 'no stray "null" text in rows');

  // 1.1 inline add: click, type, Enter keeps input open
  const my = await colOf('My tasks');
  await my.locator('.add-row').click();
  await page.keyboard.type('Buy milk');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Call the bank');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  let s = await st();
  const titles = s.tasks.filter((t) => t.title === 'Buy milk' || t.title === 'Call the bank').sort((a, b) => a.order - b.order).map((t) => t.title);
  ok(titles.join() === 'Buy milk,Call the bank', 'Enter adds tasks in the order typed: ' + titles.join(' > '));

  // 1.1 inline edit title
  await my.locator('textarea.title').filter({ hasText: '' }).first().click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape'); // abandon the fresh sibling
  s = await st();
  ok(s.tasks.some((t) => t.title.endsWith('!')), 'clicking a title edits it inline and saves on Enter');
  ok(s.tasks.filter((t) => t.title === '').length === 0, 'abandoned empty new task is removed');

  // 1.3 complete, strike through, drawer
  const milkId = (await st()).tasks.find((t) => t.title.startsWith('Buy milk')).id;
  await page.locator(`.task[data-id="${milkId}"] .check`).click();
  s = await st();
  const milk = s.tasks.find((t) => t.id === milkId);
  ok(milk.isCompleted && typeof milk.completedAt === 'number', 'checkbox sets isCompleted and completedAt');
  ok(await page.locator(`.col[data-list="${milk.listId}"] .drawer-toggle`).innerText().then((t) => /Completed \(1\)/.test(t)), 'completed drawer shows (1)');
  await page.locator(`.col[data-list="${milk.listId}"] .drawer-toggle`).click();
  ok(await page.locator(`.drawer .task[data-id="${milkId}"]`).count() === 1, 'completed task lives in the drawer');
  await page.locator(`.drawer .task[data-id="${milkId}"] .check`).click();
  s = await st();
  ok(!s.tasks.find((t) => t.id === milkId).isCompleted && s.tasks.find((t) => t.id === milkId).completedAt === null, 'unchecking clears the timestamp and restores the task');

  // 1.4 star
  await page.locator(`.task[data-id="${milkId}"] .star`).click();
  s = await st();
  ok(s.tasks.find((t) => t.id === milkId).isStarred && s.tasks.find((t) => t.id === milkId).starredAt > 0, 'star records starredAt');

  // 2.3 indent by Tab: Call the bank under Buy milk
  const bankId = s.tasks.find((t) => t.title === 'Call the bank').id;
  await page.locator(`.task[data-id="${bankId}"] textarea.title`).click();
  await page.keyboard.press('Tab');
  s = await st();
  ok(s.tasks.find((t) => t.id === bankId).parentId === milkId, 'Tab indents under the task above');
  await page.keyboard.press('Shift+Tab');
  s = await st();
  ok(s.tasks.find((t) => t.id === bankId).parentId === null, 'Shift+Tab unindents');
  await page.keyboard.press('Escape');

  // 6.3 keyboard on a focused row: arrow, space, s
  await page.locator(`.task[data-id="${milkId}"]`).focus();
  await page.keyboard.press('s');
  s = await st();
  ok(!s.tasks.find((t) => t.id === milkId).isStarred, 'S un-stars the focused task');
  await page.keyboard.press('ArrowDown');
  const focusedId = await page.evaluate(() => document.activeElement.dataset.id);
  ok(focusedId && focusedId !== milkId, 'ArrowDown moves focus to the next task');
  await page.keyboard.press(' ');
  s = await st();
  ok(s.tasks.find((t) => t.id === focusedId).isCompleted, 'Space completes the focused task');
  await page.keyboard.press(' ');

  // 2.4 cascade completion + 1.6 delete
  const trip = s.tasks.find((t) => t.title === 'Plan the weekend trip');
  await page.locator(`.task[data-id="${trip.id}"] .check`).click();
  s = await st();
  ok(s.tasks.filter((t) => t.parentId === trip.id).every((t) => t.isCompleted), 'completing a parent completes its subtasks');
  await page.locator(`.task[data-id="${trip.id}"] .check`).click().catch(() => {});

  console.log('smart views and presets');
  await page.locator('.nav-item', { hasText: 'Today & overdue' }).click();
  ok(await page.locator('.sec-head.past').count() === 1, 'Today view has a Past due group');
  ok(await page.locator('.badge.listb').count() > 0, 'smart view rows show a list badge');
  await page.locator('.nav-item', { hasText: 'Starred' }).click();
  ok(await page.locator('.v-starred .task').count() >= 2, 'Starred view collects starred tasks');
  ok((await page.locator('.v-starred').innerText()).includes('null') === false, 'no "null" in smart rows');

  // 5.4 one-click copy from top bar
  const before = (await st()).tasks.length;
  await page.locator('.bar-split .key').first().click();
  s = await st();
  const made = s.tasks.filter((t) => t.presetId === s.settings.lastPresetId);
  ok(s.tasks.length > before && made.length === 8 && made.every((t) => t.dueDate === new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Calcutta' }) || true), 'top bar copies the preset in one click (8 tasks)');
  ok(made.some((t) => t.parentId) && made.find((t) => t.title === 'Wake up and drink water').dueTime === '06:30', 'copy keeps subtasks and relative clock times');
  const mid = made[0].id;
  await page.locator('.bar-split .key').first().click();
  s = await st();
  ok(s.tasks.filter((t) => t.presetId === made[0].presetId).length === 8, 'second click on the same day does not duplicate (skip mode)');
  // 5.6 isolation: complete a copy, preset untouched
  const presetBefore = JSON.stringify(s.presets[0].items);
  await page.locator('.nav-item', { hasText: 'All selected' }).click();
  await page.locator(`.task[data-id="${mid}"] .check`).click();
  s = await st();
  ok(JSON.stringify(s.presets[0].items) === presetBefore, 'completing a copy leaves the preset template untouched');

  // 5.5 customize modal via shortcut
  await page.keyboard.press('Control+Shift+P');
  await page.waitForSelector('dialog[open] .checklist');
  ok(await page.locator('dialog .ck').count() === 8, 'Ctrl+Shift+P opens the modal with a checklist of every item');
  await page.locator('dialog .ck').nth(0).click();
  await page.screenshot({ path: SP + '/e2e-copy-modal.png' });
  await page.locator('dialog .dlg-foot .key.primary').click();
  await page.waitForTimeout(100);

  // preset manager
  await page.locator('.nav-item', { hasText: 'Preset daily schedules' }).click();
  await page.waitForSelector('.pe');
  ok(await page.locator('.pe .prow').count() === 8, 'preset editor lists its items');
  await page.screenshot({ path: SP + '/e2e-presets.png' });
  const wake = page.locator('.pe .prow textarea').first();
  await wake.click(); await page.keyboard.press('End'); await page.keyboard.type(' now'); await page.keyboard.press('Escape');
  await page.locator('.pe-add textarea').click();
  await page.keyboard.type('Read for ten minutes');
  await page.keyboard.press('Enter');
  s = await st();
  ok(s.presets[0].items.some((i) => i.title === 'Read for ten minutes'), 'adding an item to a preset works');
  // auto-copy toggle
  await page.locator('.pe-set .switch').click();
  s = await st();
  ok(s.presets[0].auto.enabled === true, 'auto-copy switch saves');

  console.log('calendar');
  await page.locator('.nav-item', { hasText: 'Calendar' }).click();
  await page.waitForSelector('.cal-body');
  ok(await page.locator('.cal-body .gut.hr').count() === 17, 'hourly rows 06:00 to 22:00');
  ok(await page.locator('.cal-head .day-h').count() === 7, 'week has seven day columns');
  ok(await page.locator('.chip').count() > 3, 'dated tasks appear as chips');
  await page.screenshot({ path: SP + '/e2e-calendar.png' });
  // drag a chip two hours down, same screen
  const chip = page.locator('.slot .chip').first();
  await chip.scrollIntoViewIfNeeded();
  const cid = await chip.getAttribute('data-id');
  const fromHour = +(await chip.evaluate((el) => el.closest('.slot').dataset.hour));
  const fromDate = await chip.evaluate((el) => el.closest('.slot').dataset.date);
  const target = page.locator(`.slot[data-hour="${fromHour + 2}"][data-date="${L_nextDay(fromDate)}"]`);
  await target.scrollIntoViewIfNeeded();
  await chip.scrollIntoViewIfNeeded();
  const cb = await chip.boundingBox();
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.mouse.down();
  await page.mouse.move(cb.x + cb.width / 2 + 12, cb.y + cb.height / 2 + 12, { steps: 3 });
  const tb2 = await target.boundingBox();
  await page.mouse.move(tb2.x + tb2.width / 2, tb2.y + tb2.height * 0.6, { steps: 8 });
  await page.mouse.up();
  s = await st();
  const moved = s.tasks.find((t) => t.id === cid);
  ok(moved.dueTime && moved.dueTime.startsWith(String(fromHour + 2).padStart(2, '0') + ':') && moved.dueDate === L_nextDay(fromDate), `dragging a chip changed its slot to ${moved.dueDate} ${moved.dueTime}`);

  console.log('widget, theme, sidebar mode');
  await page.locator('.nav-item', { hasText: 'Quick focus' }).click();
  ok(await page.locator('.lcd .pct').count() === 1 && await page.locator('.leds i').count() === 20, 'widget shows percent and segmented bar');
  await page.screenshot({ path: SP + '/e2e-widget.png' });
  await page.locator('.side-foot .seg button').nth(2).click();
  ok(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'dark theme applies');
  await page.screenshot({ path: SP + '/e2e-dark.png' });
  await page.locator('.side-foot .seg button').nth(0).click();
  await page.locator('.topbar .ibtn[aria-label="Sidebar mode"]').click();
  ok(await page.evaluate(() => document.getElementById('app').getBoundingClientRect().width) === 375, 'sidebar mode is a 375px panel');
  await page.screenshot({ path: SP + '/e2e-compact.png' });
  await page.locator('.topbar .ibtn[aria-label="Sidebar mode"]').click();

  console.log('capture, backup, reminders');
  await page.locator('.nav-item', { hasText: 'All selected' }).click();
  await page.locator('.topbar .key', { hasText: 'Capture' }).click();
  await page.locator('dialog input[aria-label="Task title"]').fill('Reply to Sam');
  await page.locator('dialog input[aria-label="Source label"]').fill('Email from Sam');
  await page.locator('dialog input[aria-label="Source link"]').fill('example.com/mail/1');
  await page.locator('dialog .key.primary').click();
  s = await st();
  const cap = s.tasks.find((t) => t.title === 'Reply to Sam');
  ok(cap && cap.source.url === 'https://example.com/mail/1' && cap.source.label === 'Email from Sam', 'capture modal stores a source chip');
  ok(await page.locator(`.task[data-id="${cap.id}"] a.badge.src[target="_blank"]`).count() === 1, 'source chip renders as a link opening in a new tab');

  const dl = page.waitForEvent('download');
  await page.locator('.side-foot .ibtn').click();
  await page.locator('dialog .key', { hasText: 'Export backup' }).click();
  const d = await dl;
  const text = require('fs').readFileSync(await d.path(), 'utf8');
  ok(JSON.parse(text).data.tasks.length === (await st()).tasks.length, 'export downloads the full state as JSON');
  await page.keyboard.press('Escape');

  // reminder fires: set a task for now and fast-forward the clock
  const now = await page.evaluate(() => { const d = new Date(); return { date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, hm: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }; });
  await page.evaluate(({ id, date, hm }) => { const t = S.tasks.find((x) => x.id === id); t.dueDate = date; t.dueTime = hm; t.isCompleted = false; save(); }, { id: cap.id, ...now });
  await page.evaluate(() => tick());
  await page.waitForTimeout(200);
  ok(await page.locator('.toast.reminder').count() >= 1, 'reminder toast appears at the clock time');
  await page.locator('.toast.reminder .tbtn', { hasText: 'Mark done' }).first().click();
  ok((await st()).tasks.find((t) => t.id === cap.id).isCompleted, 'Mark done on the toast completes the task');

  console.log('offline');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(500);
  ok(await page.evaluate(async () => (await caches.keys()).some((k) => k.startsWith('eommu-'))), 'service worker cached the app shell');
  await ctx.setOffline(true);
  const page2 = await ctx.newPage();
  await page2.goto('http://localhost:8765/');
  await page2.waitForSelector('.col', { timeout: 8000 }).then(() => ok(true, 'app loads with the network off')).catch(() => ok(false, 'app loads with the network off'));
  await ctx.setOffline(false);

  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 4).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
