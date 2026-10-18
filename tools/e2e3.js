// Swipe-to-delete, ordering, list dates. Run: node tools/e2e3.js
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('FAIL  ' + m); } };
const errs = [];
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Calcutta', permissions: ['notifications'] });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.goto('http://localhost:8765/'); await page.waitForSelector('.col');
  const cdp = await ctx.newCDPSession(page);
  const T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const swipe = async (x0, y0, dx, dy, steps = 12) => {
    await T('touchStart', x0, y0);
    for (let i = 1; i <= steps; i++) { await T('touchMove', x0 + (dx * i) / steps, y0 + (dy * i) / steps); await page.waitForTimeout(12); }
    await T('touchEnd');
    await page.waitForTimeout(260);
  };
  const st = () => page.evaluate(() => JSON.parse(localStorage.getItem('eommu.v1')));
  const firstCol = () => page.locator('.col').first();
  const tasks = async () => (await st()).tasks.filter((t) => !t.parentId).length;
  const rect = async (sel) => page.locator(sel).first().evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });

  console.log('swipe to delete (touch)');
  const unitSel = '.col:first-child .col-body .unit';
  const r0 = await rect(unitSel);
  const n0 = await tasks();
  const sl0 = await page.locator('.board').evaluate((b) => b.scrollLeft);

  // 1 vertical-ish gesture never deletes
  await swipe(r0.x + r0.w * 0.5, r0.y + r0.h / 2, -10, 60);
  ok(await tasks() === n0, 'a vertical drag does not delete');
  ok(await page.locator('.swipe-bg').count() === 0, 'no delete key is left behind after a vertical drag');

  // 2 sideways swipe on a task does not scroll the board to the next list
  await swipe(r0.x + r0.w * 0.7, r0.y + r0.h / 2, -120, 4);
  const sl1 = await page.locator('.board').evaluate((b) => b.scrollLeft);
  ok(sl1 === sl0, `board did not move to another list (scrollLeft ${sl0} -> ${sl1})`);
  ok(await tasks() === n0, 'a short swipe does not delete');
  ok(await page.locator('.swipe-bg').count() === 1, 'a short swipe leaves the Delete key open');
  const tr = await page.locator(unitSel).first().evaluate((e) => getComputedStyle(e).transform);
  ok(/matrix/.test(tr) && !/none/.test(tr), 'the task slid left to show Delete');

  // 3 tapping an open row elsewhere closes it
  await page.mouse.click(5, 5).catch(() => {});
  await T('touchStart', 195, 10); await T('touchEnd'); await page.waitForTimeout(300);
  ok(await page.locator('.swipe-bg').count() === 0, 'tapping elsewhere closes the open Delete key');
  ok(await tasks() === n0, 'closing does not delete');

  // 4 open then tap Delete
  await swipe(r0.x + r0.w * 0.7, r0.y + r0.h / 2, -120, 4);
  const del = await rect('.swipe-del');
  await T('touchStart', del.x + del.w / 2, del.y + del.h / 2); await T('touchEnd'); await page.waitForTimeout(500);
  ok(await tasks() === n0 - 1, 'tapping the open Delete key deletes the task');
  ok(await page.locator('.toast').filter({ hasText: /deleted/i }).count() > 0, 'an Undo toast appears');
  await page.locator('.toast button', { hasText: 'Undo' }).first().click();
  await page.waitForTimeout(200);
  ok(await tasks() === n0, 'Undo brings it back');

  // 5 full swipe deletes
  const r1 = await rect(unitSel);
  await swipe(r1.x + r1.w * 0.68, r1.y + r1.h / 2, -(r1.w * 0.6), 3, 16);
  await page.waitForTimeout(300);
  ok(await tasks() === n0 - 1, 'a full swipe deletes the task');
  await page.locator('.toast button', { hasText: 'Undo' }).first().click();
  await page.waitForTimeout(200);
  ok(await tasks() === n0, 'and Undo restores it');

  // 6 swiping a parent takes its subtasks along; sub row alone only deletes itself
  const s = await st();
  const parent = s.tasks.find((t) => !t.parentId && s.tasks.some((k) => k.parentId === t.id));
  if (parent) {
    const kids = s.tasks.filter((k) => k.parentId === parent.id).length;
    const sub = page.locator(`.task.sub`).first();
    const sid = await sub.getAttribute('data-id');
    const sr = await sub.evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    const total = (await st()).tasks.length;
    await swipe(sr.x + sr.w * 0.68, sr.y + sr.h / 2, -(sr.w * 0.6), 3, 16);
    await page.waitForTimeout(300);
    const after = await st();
    ok(after.tasks.length === total - 1 && !after.tasks.some((t) => t.id === sid), 'swiping a subtask deletes only that subtask');
    await page.locator('.toast button', { hasText: 'Undo' }).first().click(); await page.waitForTimeout(200);
  } else ok(true, '(no sample parent with subtasks)');

  // 7 sideways swipe on the list header still moves between lists
  const hd = await rect('.col:first-child .col-head');
  await swipe(hd.x + hd.w * 0.8, hd.y + hd.h / 2, -260, 2);
  const sl2 = await page.locator('.board').evaluate((b) => b.scrollLeft);
  ok(sl2 > sl0, 'swiping the list header still changes list');

  console.log('ordering');
  await page.goto('http://localhost:8765/'); await page.waitForSelector('.col');
  const lid = (await st()).lists.find((l) => l.name === 'My tasks').id;
  const col = page.locator(`.col[data-list="${lid}"]`);
  const names = () => col.locator('.col-body > .unit > .task .title').evaluateAll((a) => a.map((t) => t.value));
  const before = await names();
  await col.locator('.add-row').click(); await page.keyboard.type('One'); await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
  await col.locator('.add-row').click(); await page.keyboard.type('Two'); await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
  await col.locator('.add-row').click(); await page.keyboard.type('Three'); await page.keyboard.press('Enter'); await page.keyboard.type('Four'); await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
  const after = await names();
  ok(JSON.stringify(after) === JSON.stringify([...before, 'One', 'Two', 'Three', 'Four']), 'new tasks always land at the end, in the order they were added');
  await page.reload(); await page.waitForSelector('.col');
  ok(JSON.stringify(await names()) === JSON.stringify(after), 'the order is identical after a reload');
  ok(await col.locator('.add-holder').evaluate((e) => getComputedStyle(e).position) === 'sticky', 'the add box stays pinned in view');

  console.log('list dates and the calendar');
  const dctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, timezoneId: 'Asia/Calcutta', permissions: ['notifications'] });
  const dp = await dctx.newPage();
  dp.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await dp.goto('http://localhost:8765/'); await dp.waitForSelector('.col');
  const dst = () => dp.evaluate(() => JSON.parse(localStorage.getItem('eommu.v1')));
  const today = await dp.evaluate(() => L.today());
  const tomorrow = await dp.evaluate(() => L.addDays(L.today(), 1));
  await dp.locator('.new-col').click();
  await dp.fill('dialog input[aria-label="List name"]', 'Friday plan');
  await dp.locator('dialog .quick-days button', { hasText: 'Tomorrow' }).click();
  await dp.locator('dialog button', { hasText: 'Create list' }).click();
  await dp.waitForTimeout(250);
  let state = await dst();
  const fl = state.lists.find((l) => l.name === 'Friday plan');
  ok(fl && fl.dueDate === tomorrow, 'new list can be created with a date');
  const fcol = dp.locator(`.col[data-list="${fl.id}"]`);
  ok(await fcol.locator('.date-chip').count() === 1, 'the list header shows its date');
  await fcol.locator('.add-row').click();
  await dp.keyboard.type('Pack the bag'); await dp.keyboard.press('Enter');
  await dp.keyboard.type('Charge laptop'); await dp.keyboard.press('Enter'); await dp.keyboard.press('Escape');
  await dp.waitForTimeout(200);
  state = await dst();
  ok(state.tasks.filter((t) => t.listId === fl.id).length === 2 && state.tasks.filter((t) => t.listId === fl.id).every((t) => !t.dueDate), 'tasks keep no date of their own');
  ok(await dp.locator('.list-row .ldate').count() === 1, 'the sidebar shows the list date');
  await dp.keyboard.press('Control+Shift+P');
  await dp.waitForSelector('dialog .copy-form');
  await dp.selectOption('dialog select[aria-label="Destination list"]', fl.id);
  ok(await dp.locator('dialog input[aria-label="Date"]').inputValue() === tomorrow, 'copy dialog suggests the date of a dated list');
  await dp.locator('dialog .seg button', { hasText: 'Today' }).click();
  await dp.selectOption('dialog select[aria-label="Destination list"]', state.lists[0].id);
  await dp.selectOption('dialog select[aria-label="Destination list"]', fl.id);
  ok(await dp.locator('dialog input[aria-label="Date"]').inputValue() === today, 'a day chosen by hand is not overridden by the list');
  await dp.locator('dialog button', { hasText: 'Cancel' }).click();
  await dp.locator('.nav-item', { hasText: 'Calendar' }).click();
  await dp.waitForSelector('.cal');
  // go to the week that holds tomorrow (it is always this week or next)
  const onCal = async () => dp.locator(`.allday[data-date="${tomorrow}"] .chip`).count();
  if (!(await onCal())) await dp.locator('.cal-nav .ibtn').last().click();
  ok(await onCal() === 2, 'both tasks appear on the calendar on the list date');
  // dragging a chip gives that one task its own date; the other stays with the list
  const targetDay = await dp.evaluate((d) => [...document.querySelectorAll('.allday')].map((e) => e.dataset.date).find((x) => x !== d), tomorrow);
  const tgt = dp.locator(`.allday[data-date="${targetDay}"]`);
  const chip = dp.locator(`.allday[data-date="${tomorrow}"] .chip`).first();
  const cb = await chip.boundingBox(), tb = await tgt.boundingBox();
  if (cb && tb) {
    await dp.mouse.move(cb.x + 40, cb.y + cb.height / 2); await dp.mouse.down();
    await dp.mouse.move(cb.x + 60, cb.y + cb.height / 2 + 4, { steps: 3 });
    await dp.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 10 });
    await dp.mouse.up(); await dp.waitForTimeout(250);
    state = await dst();
    const mine = state.tasks.filter((t) => t.listId === fl.id);
    ok(mine.filter((t) => t.dueDate === targetDay).length === 1 && mine.filter((t) => !t.dueDate).length === 1, 'dragging a chip gives that task its own date, the other still follows the list');
  } else ok(false, 'chip and target day are both on screen');
  // Today view includes a list dated today
  await dp.evaluate((id) => setListDate(id, L.today()), fl.id);
  await dp.reload(); await dp.waitForSelector('.side');
  await dp.locator('.nav-item', { hasText: 'Today' }).click();
  await dp.waitForTimeout(200);
  const undated = (await dst()).tasks.find((t) => t.listId === fl.id && !t.dueDate);
  ok((await dp.locator('.main .task .title').evaluateAll((a) => a.map((t) => t.value))).includes(undated.title), 'a list dated today shows its undated task in Today & overdue');
  // list menu can change and clear the date
  await dp.locator('.nav-item', { hasText: 'All selected lists' }).click();
  await dp.waitForTimeout(150);
  const col2 = dp.locator(`.col[data-list="${fl.id}"]`);
  await col2.locator('.date-chip').click();
  await dp.locator('dialog button', { hasText: 'Clear date' }).click();
  await dp.waitForTimeout(200);
  state = await dst();
  ok(state.lists.find((l) => l.id === fl.id).dueDate === null, 'the list date can be cleared');
  ok(await col2.locator('.date-chip').count() === 0, 'and the chip goes away');
  await col2.locator('button[aria-label^="Actions for"]').click();
  ok(await dp.locator('.menu-item', { hasText: 'Set list date' }).count() === 1, 'the list menu offers Set list date');

  console.log(errs.length ? 'console errors:\n' + errs.join('\n') : 'no console errors');
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
