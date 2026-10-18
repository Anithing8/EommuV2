const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const SP = process.argv[2] || '.';
let pass = 0, fail = 0; const errs = [];
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('FAIL  ' + m); } };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const mk = async (vp, touch) => {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, timezoneId: 'Asia/Calcutta', permissions: ['notifications'] });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
    await page.goto('http://localhost:8765/'); await page.waitForSelector('.col');
    return { ctx, page };
  };
  const { ctx, page } = await mk({ width: 1500, height: 900 }, false);
  const st = () => page.evaluate(() => JSON.parse(localStorage.getItem('eommu.v1')));
  const idOf = async (title) => (await st()).tasks.find((t) => t.title === title).id;
  const listId = async (name) => (await st()).lists.find((l) => l.name === name).id;
  const drag = async (fromSel, toSel, where = 0.5, mobile = false) => {
    const a = await page.locator(fromSel).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 8, a.y + a.height / 2 + 8, { steps: 3 });
    const b = await page.locator(toSel).boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height * where, { steps: 10 });
    await page.mouse.up(); await page.waitForTimeout(150);
    await page.waitForTimeout(80);
  };

  console.log('drag and drop');
  let id1 = await idOf('Renew library card'), id0 = await idOf('Pay the electricity bill');
  await drag(`.task[data-id="${id1}"] .grip`, `.task[data-id="${id0}"]`, 0.15);
  let s = await st();
  const my = await listId('My tasks');
  const order = s.tasks.filter((t) => t.listId === my && !t.parentId).sort((a, b) => a.order - b.order).map((t) => t.title);
  ok(order[0] === 'Renew library card' && order[1] === 'Pay the electricity bill', 'drag reorders within a list: ' + order.slice(0, 3).join(' > '));
  // parent moves with its subtasks across lists
  const tripId = await idOf('Plan the weekend trip');
  const work = await listId('Work');
  await drag(`.task[data-id="${tripId}"] .grip`, `.col[data-list="${work}"] .col-body .unit >> nth=0`, 0.2);
  s = await st();
  const kids = s.tasks.filter((t) => t.parentId === tripId);
  ok(s.tasks.find((t) => t.id === tripId).listId === work && kids.length === 3 && kids.every((k) => k.listId === work), 'dragging a parent to another column carries its 3 subtasks');
  // subtask reorder inside its parent
  const ks = kids.sort((a, b) => a.order - b.order);
  await drag(`.task[data-id="${ks[2].id}"] .grip`, `.task[data-id="${ks[0].id}"]`, 0.2);
  s = await st();
  const nk = s.tasks.filter((t) => t.parentId === tripId).sort((a, b) => a.order - b.order);
  ok(nk[0].id === ks[2].id && nk.every((k) => k.parentId === tripId), 'subtask reorders inside its parent');
  // dropping onto another column's empty area
  const home = await listId('Home');
  const hingeId = await idOf('Fix the loose cabinet hinge');
  const sched = await listId("Today’s schedule");
  await drag(`.task[data-id="${hingeId}"] .grip`, `.col[data-list="${sched}"] .empty`, 0.5);
  s = await st();
  ok(s.tasks.find((t) => t.id === hingeId).listId === sched, 'drop on an empty column moves the task there');

  console.log('sort modes');
  await page.locator(`.col[data-list="${work}"] .col-tools .key`).first().click();
  await page.locator('.menu-item', { hasText: 'Due date' }).click();
  const heads = await page.locator(`.col[data-list="${work}"] .sec-head span:first-child`).allInnerTexts();
  ok(heads.includes('Today') && heads.includes('Upcoming') || heads.length >= 2, 'Due date mode groups under headers: ' + heads.join(', '));
  ok((await st()).lists.find((l) => l.id === work).sort === 'due', 'sort mode is saved per list');
  // reordering in a non-manual list is refused with guidance
  const t0 = await page.locator(`.col[data-list="${work}"] .unit > .task .grip`).first().evaluate((el) => el.closest('.task').dataset.id);
  const sib = await page.locator(`.col[data-list="${work}"] .unit > .task .grip`).nth(2).evaluate((el) => el.closest('.task').dataset.id);
  await drag(`.task[data-id="${sib}"] .grip`, `.task[data-id="${t0}"]`, 0.1);
  ok(await page.locator('.toast', { hasText: 'My order' }).count() >= 1, 'dragging inside a sorted list explains how to rearrange');
  await page.locator(`.col[data-list="${work}"] .col-tools .key`).first().click();
  await page.locator('.menu-item', { hasText: 'Title' }).click();
  const titles = await page.locator(`.col[data-list="${work}"] .unit > .task textarea.title`).evaluateAll((els) => els.map((e) => e.value));
  const sorted = titles.slice().sort((a, b) => a.localeCompare(b));
  ok(JSON.stringify(titles) === JSON.stringify(sorted), 'Title mode sorts A to Z: ' + titles.join(' | '));
  await page.locator(`.col[data-list="${work}"] .col-tools .key`).first().click();
  await page.locator('.menu-item', { hasText: 'Starred recently' }).click();
  const firstStar = await page.locator(`.col[data-list="${work}"] .unit`).first().locator('.task').first().evaluate((e) => e.classList.contains('starred'));
  ok(firstStar, 'Starred recently puts a starred task first');
  await page.locator(`.col[data-list="${work}"] .col-tools .key`).first().click();
  await page.locator('.menu-item', { hasText: 'My order' }).click();

  console.log('task details, recurrence, notes');
  const waterId = await idOf('Water the plants');
  await page.locator(`.task[data-id="${waterId}"] .more, .task[data-id="${waterId}"] .ibtn[aria-label="More actions"]`).first().click();
  await page.locator('.menu-item', { hasText: 'Details' }).click();
  await page.waitForSelector('dialog[open] select[aria-label="Repeat"]');
  await page.locator('dialog select[aria-label="Repeat"]').selectOption('week');
  ok(await page.locator('dialog .rep-week .pill').count() === 7, 'weekly repeat shows Mon to Sun pills');
  await page.locator('dialog select[aria-label="Ends"]').selectOption('count');
  await page.locator('dialog input[aria-label="Number of occurrences"]').fill('2');
  await page.locator('dialog .dlg-foot .key.primary').click();
  s = await st();
  const w = s.tasks.find((t) => t.id === waterId);
  ok(w.recur.freq === 'week' && w.recur.end.type === 'count' && w.recur.end.count === 2, 'recurrence settings are saved');
  await page.locator(`.task[data-id="${waterId}"] .check`).click();
  s = await st();
  const nextW = s.tasks.find((t) => t.title === 'Water the plants' && !t.isCompleted);
  ok(nextW && nextW.dueDate > w.dueDate && nextW.recur.occ === 2, 'completing auto-spawns the next occurrence: ' + (nextW && nextW.dueDate));
  await page.locator(`.task[data-id="${nextW.id}"] .check`).click();
  s = await st();
  ok(s.tasks.filter((t) => t.title === 'Water the plants' && !t.isCompleted).length === 0, 'repeat ends after 2 occurrences');

  // notes with URL
  const reply = await idOf('Reply to design feedback');
  await page.locator(`.task[data-id="${reply}"] .ibtn[aria-label="More actions"]`).click();
  await page.locator('.menu-item', { hasText: 'Add notes' }).click();
  await page.keyboard.type('See https://example.com/spec, then reply.');
  await page.locator('.notes-in').blur();
  await page.waitForTimeout(500);
  const a = page.locator(`.task[data-id="${reply}"] .notes a`);
  ok(await a.count() === 1 && await a.getAttribute('target') === '_blank' && (await a.getAttribute('href')) === 'https://example.com/spec', 'URL in notes becomes a _blank link (trailing comma excluded)');

  // overdue badge turns red and the task is in Today & overdue
  ok(await page.locator('.badge.date.late').count() >= 1, 'overdue date badge is styled late (red)');

  console.log('lists');
  await page.locator('.grp header .ibtn[aria-label="New list"]').click();
  await page.locator('dialog input[aria-label="List name"]').fill('Errands');
  await page.locator('dialog .key.primary').click();
  s = await st();
  const errands = s.lists.find((l) => l.name === 'Errands');
  ok(!!errands, 'new list created');
  const ti = page.locator(`.col[data-list="${errands.id}"] .col-title`);
  await ti.click(); await ti.fill('Shopping'); await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  ok((await st()).lists.find((l) => l.id === errands.id).name === 'Shopping', 'list renamed inline');
  await page.locator(`.col[data-list="${errands.id}"] .ibtn[aria-label^="Actions for"]`).click();
  await page.locator('.menu-item', { hasText: 'Delete list' }).click();
  await page.locator('dialog .key.danger').click();
  ok(!(await st()).lists.find((l) => l.id === errands.id), 'custom list deleted');
  const defId = (await st()).lists.find((l) => l.isDefault).id;
  await page.locator(`.col[data-list="${defId}"] .ibtn[aria-label^="Actions for"]`).click();
  ok(await page.locator('.menu-item', { hasText: 'can’t be deleted' }).isDisabled(), 'default list cannot be deleted');
  await page.keyboard.press('Escape');
  // hide / show with sidebar checkbox
  await page.locator('.list-row', { hasText: 'Home' }).locator('input[type=checkbox]').uncheck();
  ok(await page.locator(`.col[data-list="${home}"]`).count() === 0, 'unticking a list hides its column');
  await page.locator('.list-row', { hasText: 'Home' }).locator('input[type=checkbox]').check();

  console.log('completed drawer purge, save list as preset');
  const mine = await listId('My tasks');
  await page.locator(`.col[data-list="${mine}"] .check`).first().click();
  await page.locator(`.col[data-list="${mine}"] .check`).first().click();
  await page.locator(`.col[data-list="${mine}"] .drawer-toggle`).click();
  ok(await page.locator(`.col[data-list="${mine}"] .drawer .task`).count() >= 2, 'finished tasks collect in the drawer');
  await page.locator(`.col[data-list="${mine}"] .drawer-head .key.danger`).click();
  await page.locator('dialog .key.danger').click();
  s = await st();
  ok(s.tasks.filter((t) => t.listId === mine && t.isCompleted).length === 0, 'Delete all completed purges the drawer');
  const presetsBefore = s.presets.length;
  await page.locator(`.col[data-list="${work}"] .col-tools .key`, { hasText: 'Save list as preset' }).click();
  await page.locator('dialog input').fill('Work snapshot');
  await page.locator('dialog .key.primary').click();
  s = await st();
  const snap = s.presets.find((p) => p.name === 'Work snapshot');
  ok(s.presets.length === presetsBefore + 1 && snap.items.length >= 3 && snap.items.some((i) => i.parentId), 'Save list as preset snapshots tasks and subtasks');

  console.log('auto-copy, import, print');
  await page.evaluate(() => { const p = S.presets.find((x) => x.name === 'Evening reset'); p.auto.enabled = true; p.auto.time = '00:00'; p.auto.days = [0, 1, 2, 3, 4, 5, 6]; p.lastCopiedDate = null; save(); });
  const evBefore = (await st()).tasks.length;
  await page.evaluate(() => tick());
  s = await st();
  const ev = s.presets.find((p) => p.name === 'Evening reset');
  ok(s.tasks.length === evBefore + 4 && ev.lastCopiedDate === iso(new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Calcutta' }))), 'auto-copy ran once the rollover time had passed');
  await page.evaluate(() => tick());
  ok((await st()).tasks.length === evBefore + 4, 'auto-copy does not run twice in a day');

  await page.locator('.side-foot .ibtn').click();
  require('fs').writeFileSync(SP + '/bad.json', '{"hello":1}');
  await page.locator('dialog input[type=file]').setInputFiles(SP + '/bad.json');
  await page.waitForTimeout(200);
  ok(await page.locator('.toast', { hasText: 'not an Eommu backup' }).count() === 1, 'invalid import is rejected with a clear message');
  const good = JSON.stringify({ app: 'eommu', data: await st() });
  require('fs').writeFileSync(SP + '/good.json', good);
  await page.locator('dialog input[type=file]').setInputFiles(SP + '/good.json');
  await page.waitForSelector('dialog.small');
  await page.locator('dialog.small .key.danger').click();
  await page.waitForTimeout(200);
  ok(await page.locator('.toast', { hasText: 'Backup restored' }).count() === 1, 'valid backup restores');
  await page.keyboard.press('Escape');

  await page.emulateMedia({ media: 'print' });
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('.side')).display) === 'none' && await page.evaluate(() => getComputedStyle(document.querySelector('.topbar .bar-actions')).display) === 'none', 'print stylesheet hides navigation and controls');
  await page.pdf({ path: SP + '/print.pdf', format: 'A4' });
  await page.emulateMedia({ media: 'screen' });
  await ctx.close();

  console.log('phone: touch');
  const m = await mk({ width: 390, height: 844 }, true);
  const mp = m.page;
  const mst = () => mp.evaluate(() => JSON.parse(localStorage.getItem('eommu.v1')));
  ok(await mp.evaluate(() => document.body.classList.contains('m')), 'phone layout is active');
  ok(await mp.locator('.tabbar button').count() === 5, 'bottom tab bar shows five views');
  await mp.locator('.menu-btn').tap();
  ok(await mp.evaluate(() => document.body.classList.contains('side-open')), 'menu opens the sidebar drawer');
  await mp.locator('.scrim').tap({ position: { x: 360, y: 400 } });
  // touch drag with the grip using CDP
  const cdp = await m.ctx.newCDPSession(mp);
  const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  let s2 = await mst();
  const myM = s2.lists.find((l) => l.name === 'My tasks').id;
  const tops = s2.tasks.filter((t) => t.listId === myM && !t.parentId).sort((a, b) => a.order - b.order);
  const lastId = tops[0].id, firstId = tops[0].id;
  await mp.locator(`.task[data-id="${lastId}"]`).scrollIntoViewIfNeeded();
  const gb = await mp.locator(`.task[data-id="${lastId}"] .grip`).boundingBox();
  await touch('touchStart', gb.x + gb.width / 2, gb.y + gb.height / 2);
  for (let i = 1; i <= 4; i++) await touch('touchMove', gb.x + gb.width / 2, gb.y + gb.height / 2 + i * 20);
  const t2 = await mp.locator(`.task[data-id="${tops[2].id}"]`).boundingBox();
  await touch('touchMove', t2.x + t2.width / 2, t2.y + t2.height * 0.8);
  await touch('touchMove', t2.x + t2.width / 2, t2.y + t2.height * 0.85);
  await touch('touchEnd');
  await mp.waitForTimeout(150);
  s2 = await mst();
  const after = s2.tasks.filter((t) => t.listId === myM && !t.parentId).sort((a, b) => a.order - b.order).map((t) => t.id);
  ok(after.indexOf(lastId) >= 1, `touch-dragging a grip reorders a task (moved from 0 to ${after.indexOf(lastId)})`);
  void firstId;
  // phone task sheet is a bottom sheet
  await mp.locator('.tabbar button', { hasText: 'Calendar' }).tap();
  await mp.waitForSelector('.cal-body');
  await mp.screenshot({ path: SP + '/phone-calendar.png' });
  await mp.locator('.tabbar button', { hasText: 'Presets' }).tap();
  await mp.waitForSelector('.pm');
  await mp.screenshot({ path: SP + '/phone-presets.png' });
  await mp.locator('.pcard .pc-main').first().tap();
  await mp.waitForSelector('.pe');
  await mp.screenshot({ path: SP + '/phone-preset-edit.png' });
  await mp.locator('.pe-actions .key', { hasText: 'Customize' }).tap();
  await mp.waitForSelector('dialog[open]');
  await mp.screenshot({ path: SP + '/phone-copy-modal.png' });
  await mp.keyboard.press('Escape');
  await m.ctx.close();

  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 4).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
