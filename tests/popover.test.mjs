// Popover：ARIA、焦点陷阱与还焦、Esc/外部点击、方向与箭头、表单、hover 卡片、API 与事件
export default async ({ page, assert, sleep }) => {
  await page.evaluate(() => {
    window.__p = Object.fromEntries([...document.querySelectorAll('.nv-popover')].map((p) => [p.id, p]));
    window.__ev = [];
    for (const t of document.querySelectorAll('[data-nv-popover]')) {
      for (const n of ['nv:open', 'nv:close']) t.addEventListener(n, (e) => window.__ev.push([n, e.detail.reason || '']));
    }
  });
  const open = (id) => page.evaluate((i) => { const p = window.__p[i]; return p.isConnected && !p.hidden && p.dataset.state === 'open'; }, id);
  const ev = () => page.evaluate(() => window.__ev.splice(0));
  const T = (id) => `[data-nv-popover="#${id}"]`;
  const inPanel = (id) => page.evaluate((i) => window.__p[i].contains(document.activeElement), id);
  const activeIs = (sel) => page.evaluate((s) => document.activeElement.matches(s), sel);
  const scrollTo = (sel) => page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);

  // 1. 基础：ARIA、点击打开、焦点进入面板、Tab 循环、Esc 关闭并还焦
  await scrollTo(T('popover-basic'));
  const aria = await page.$eval(T('popover-basic'), (t) => [t.getAttribute('aria-haspopup'), t.getAttribute('aria-expanded'), t.getAttribute('aria-controls')].join());
  assert.equal(aria, 'dialog,false,popover-basic', '触发器 ARIA');
  await page.click(T('popover-basic'));
  await sleep(250);
  assert(await open('popover-basic'), '点击打开');
  assert.equal(await page.evaluate(() => window.__p['popover-basic'].getAttribute('role')), 'dialog', 'role=dialog');
  assert.equal(await page.$eval(T('popover-basic'), (t) => t.getAttribute('aria-expanded')), 'true', 'aria-expanded=true');
  assert(await inPanel('popover-basic'), '焦点进入面板');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
  assert(await inPanel('popover-basic'), 'Tab 在面板内循环');
  await page.keyboard.press('Escape');
  await sleep(300);
  assert(!(await open('popover-basic')), 'Esc 关闭');
  assert(await activeIs(T('popover-basic')), 'Esc 后焦点回到触发器');
  assert.equal(JSON.stringify(await ev()), JSON.stringify([['nv:open', ''], ['nv:close', 'escape']]), '事件与 reason');

  // 2. 关闭按钮；再次点击触发器关闭；外部点击关闭且不抢焦点
  await page.click(T('popover-basic'));
  await sleep(250);
  await page.evaluate(() => window.__p['popover-basic'].querySelector('[data-nv-popover-close]').click());
  await sleep(300);
  assert(!(await open('popover-basic')), '关闭按钮');
  assert(await activeIs(T('popover-basic')), '关闭按钮后还焦');
  await page.click(T('popover-basic'));
  await sleep(250);
  await page.click(T('popover-basic'));
  await sleep(300);
  assert(!(await open('popover-basic')), '再次点击触发器关闭');
  await page.click(T('popover-basic'));
  await sleep(250);
  await page.mouse.click(5, 5);
  await sleep(300);
  assert(!(await open('popover-basic')), '外部点击关闭');
  assert(!(await activeIs(T('popover-basic'))), '外部点击不把焦点拉回触发器');
  const r = (await ev()).filter((x) => x[0] === 'nv:close').map((x) => x[1]).join();
  assert.equal(r, 'close-button,trigger,outside', `close reason（${r}）`);

  // 3. 方向与箭头
  await scrollTo(T('popover-top'));
  for (const [id, side] of [['popover-top', 'top'], ['popover-bottom', 'bottom'], ['popover-left', 'left'], ['popover-right', 'right']]) {
    await page.click(T(id));
    await sleep(250);
    const g = await page.evaluate(([i, s]) => {
      const p = window.__p[i]; const pr = p.getBoundingClientRect();
      const tr = document.querySelector(`[data-nv-popover="#${i}"]`).getBoundingClientRect();
      const ok = { top: pr.bottom <= tr.top, bottom: pr.top >= tr.bottom, left: pr.right <= tr.left, right: pr.left >= tr.right }[s];
      return { side: p.dataset.side, ok, arrow: !!p.querySelector(':scope > .nv-popover-arrow') };
    }, [id, side]);
    assert.equal(g.side, side, `${id} data-side`);
    assert(g.ok, `${id} 在 ${side} 侧`);
    assert(g.arrow, `${id} 带箭头`);
  }
  await page.keyboard.press('Escape');
  await sleep(300);
  await page.mouse.click(5, 5);
  await sleep(300);
  assert.equal(await page.evaluate(() => Object.values(window.__p).filter((p) => p.isConnected && !p.hidden && p.dataset.state === 'open').length), 0, '全部关闭');

  // 4. 表单：聚焦输入框、回车保存、Esc 放弃
  await scrollTo('#popover-rename-btn');
  await page.click('#popover-rename-btn');
  await sleep(300);
  assert(await activeIs('#popover-rename-input'), '焦点落到首个输入框');
  await page.evaluate(() => { const i = document.getElementById('popover-rename-input'); i.select(); });
  await page.keyboard.type('Q3 路线图');
  await page.keyboard.press('Enter');
  await sleep(300);
  assert(!(await open('popover-rename')), '回车提交后关闭');
  assert.equal(await page.$eval('#popover-rename-label', (n) => n.textContent), 'Q3 路线图', '保存新名称');
  await page.click('#popover-rename-btn');
  await sleep(300);
  await page.keyboard.type('xxx');
  await page.keyboard.press('Escape');
  await sleep(300);
  assert.equal(await page.$eval('#popover-rename-label', (n) => n.textContent), 'Q3 路线图', 'Esc 不保存');
  assert(await activeIs('#popover-rename-btn'), 'Esc 后回到触发器');

  // 5. hover 卡片：延迟打开、可移入面板、离开后关闭；键盘聚焦打开但不抢焦点
  await scrollTo(T('popover-card'));
  const tc = await page.$eval(T('popover-card'), (t) => { const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(tc.x, tc.y);
  await sleep(60);
  assert(!(await open('popover-card')), '60ms 时尚未打开');
  await sleep(250);
  assert(await open('popover-card'), 'hover 后打开');
  assert(!(await inPanel('popover-card')), 'hover 打开不抢焦点');
  const pc = await page.evaluate(() => { const r = window.__p['popover-card'].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(pc.x, pc.y, { steps: 4 });
  await sleep(400);
  assert(await open('popover-card'), '移入面板保持打开');
  await page.mouse.move(5, 5);
  await sleep(500);
  assert(!(await open('popover-card')), '离开后关闭');
  await ev();

  // 6. API：open / close / toggle / isOpen / update
  await page.evaluate(() => document.getElementById('popover-api-trigger').scrollIntoView({ block: 'center' }));
  await page.evaluate(() => Nova.popover.open('#popover-api-trigger'));
  await sleep(250);
  assert(await page.evaluate(() => Nova.popover.isOpen('#popover-api-trigger')), 'Nova.popover.open / isOpen');
  await page.evaluate(() => Nova.popover.update('#popover-api-trigger'));
  await page.evaluate(() => Nova.popover.toggle('#popover-api-trigger'));
  await sleep(300);
  assert(!(await page.evaluate(() => Nova.popover.isOpen('#popover-api-trigger'))), 'toggle 关闭');
  await page.evaluate(() => Nova.popover.toggle('#popover-api-trigger'));
  await sleep(250);
  await page.evaluate(() => Nova.popover.close('#popover-api-trigger'));
  await sleep(300);
  assert(!(await page.evaluate(() => Nova.popover.isOpen('#popover-api-trigger'))), 'Nova.popover.close');
  const e = (await ev()).filter((x) => x[0] === 'nv:close').map((x) => x[1]);
  assert(e.length >= 2 && e.every((x) => x === 'api'), `API 关闭 reason=api（${e}）`);
};
