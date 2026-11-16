// Modal：ARIA、焦点陷阱/还焦、滚动锁定、Esc/遮罩/关闭按钮、静态遮罩、嵌套、confirm/alert、窄屏底部弹出
export default async ({ page, assert, sleep }) => {
  await page.evaluate(() => {
    window.__ev = [];
    for (const m of document.querySelectorAll('.nv-modal')) {
      for (const n of ['nv:open', 'nv:close']) m.addEventListener(n, (e) => { if (e.target === m) window.__ev.push([m.id, n, (e.detail && e.detail.reason) || '']); });
    }
  });
  const ev = () => page.evaluate(() => window.__ev.splice(0));
  const isOpen = (id) => page.evaluate((i) => { const m = document.getElementById(i); return !m.hidden && m.dataset.state === 'open'; }, id);
  const gone = (id) => page.evaluate((i) => document.getElementById(i).hidden, id);
  const activeIs = (sel) => page.evaluate((s) => document.activeElement.matches(s), sel);
  const inside = (id) => page.evaluate((i) => document.getElementById(i).contains(document.activeElement), id);
  const locked = () => page.evaluate(() => getComputedStyle(document.documentElement).overflow === 'hidden' || getComputedStyle(document.body).overflow === 'hidden');
  const clickMask = async () => { await page.mouse.click(4, 400); };
  const scrollTo = (sel) => page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);

  // 1. 基础：ARIA、初始焦点、Tab 循环、滚动锁定、Esc 关闭还焦
  await scrollTo('[data-nv-modal-open="#modal-basic"]');
  const trig = await page.$eval('[data-nv-modal-open="#modal-basic"]', (b) => [b.getAttribute('aria-haspopup'), b.getAttribute('aria-controls')].join());
  assert.equal(trig, 'dialog,modal-basic', '触发器 ARIA');
  await page.click('[data-nv-modal-open="#modal-basic"]');
  await sleep(350);
  assert(await isOpen('modal-basic'), '点击打开');
  const a = await page.$eval('#modal-basic', (m) => [m.getAttribute('role'), m.getAttribute('aria-modal'), m.getAttribute('aria-labelledby')].join());
  assert.equal(a, 'dialog,true,modal-basic-title', 'role / aria-modal / labelledby');
  assert(await activeIs('#modal-basic-name'), '初始焦点在第一个输入框（跳过关闭按钮）');
  assert(await locked(), '打开时锁定页面滚动');
  for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
  assert(await inside('modal-basic'), 'Tab 在对话框内循环');
  await page.keyboard.down('Shift');
  for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
  await page.keyboard.up('Shift');
  assert(await inside('modal-basic'), 'Shift+Tab 在对话框内循环');
  await page.keyboard.press('Escape');
  await sleep(400);
  assert(await gone('modal-basic'), 'Esc 关闭并隐藏');
  assert(await activeIs('[data-nv-modal-open="#modal-basic"]'), '焦点回到触发按钮');
  assert(!(await locked()), '关闭后解除滚动锁定');

  // 2. 遮罩、关闭按钮、data-nv-modal-close
  await page.click('[data-nv-modal-open="#modal-basic"]');
  await sleep(350);
  await clickMask();
  await sleep(400);
  assert(await gone('modal-basic'), '点击遮罩关闭');
  await page.click('[data-nv-modal-open="#modal-basic"]');
  await sleep(350);
  await page.click('#modal-basic .nv-modal-close');
  await sleep(400);
  assert(await gone('modal-basic'), '右上角关闭按钮');
  await page.click('[data-nv-modal-open="#modal-basic"]');
  await sleep(350);
  await page.click('#modal-basic [data-nv-modal-close]');
  await sleep(400);
  assert(await gone('modal-basic'), 'data-nv-modal-close');
  const reasons = (await ev()).filter((x) => x[1] === 'nv:close').map((x) => x[2]).join();
  assert.equal(reasons, 'escape,outside,close-button,close-button', `close reason（${reasons}）`);

  // 3. 静态遮罩：点遮罩不关闭（有反馈），Esc 仍可关闭
  await scrollTo('[data-nv-modal-open="#modal-static"]');
  await page.click('[data-nv-modal-open="#modal-static"]');
  await sleep(350);
  await clickMask();
  await sleep(50);
  assert(await isOpen('modal-static'), 'data-static 点遮罩不关闭');
  assert(await page.$eval('#modal-static .nv-modal-panel', (p) => p.hasAttribute('data-bounce')), '缩放反馈');
  await page.keyboard.press('Escape');
  await sleep(400);
  assert(await gone('modal-static'), 'data-static 时 Esc 仍可关闭');

  // 4. 嵌套：上层打开时下层 data-behind；Esc / 遮罩只关上层；焦点回到下层按钮
  await scrollTo('[data-nv-modal-open="#modal-team"]');
  await page.click('[data-nv-modal-open="#modal-team"]');
  await sleep(350);
  await page.click('#modal-team [data-nv-modal-open="#modal-invite"]');
  await sleep(350);
  assert(await isOpen('modal-invite') && await isOpen('modal-team'), '两层都打开');
  assert(await page.$eval('#modal-team', (m) => m.hasAttribute('data-behind')), '下层 data-behind');
  assert(await page.evaluate(() => document.getElementById('modal-team').compareDocumentPosition(document.getElementById('modal-invite')) & 4), '上层移到 DOM 末尾');
  assert(await activeIs('#modal-invite-email'), '焦点进入上层');
  await page.keyboard.press('Escape');
  await sleep(400);
  assert(await gone('modal-invite'), 'Esc 关闭上层');
  assert(await isOpen('modal-team'), '下层保持打开');
  assert(!(await page.$eval('#modal-team', (m) => m.hasAttribute('data-behind'))), '下层移除 data-behind');
  assert(await activeIs('#modal-team [data-nv-modal-open="#modal-invite"]'), '焦点回到下层的触发按钮');
  assert(await locked(), '仍有对话框时保持滚动锁定');
  await page.click('#modal-team [data-nv-modal-open="#modal-invite"]');
  await sleep(350);
  await clickMask();
  await sleep(400);
  assert(await gone('modal-invite') && await isOpen('modal-team'), '遮罩只关闭上层');
  await page.keyboard.press('Escape');
  await sleep(400);
  assert(await gone('modal-team'), '再按 Esc 关闭下层');
  assert(!(await locked()), '全部关闭后解锁');
  await ev();

  // 5. Nova.confirm：危险操作聚焦取消、加载态、Esc 返回 false
  await scrollTo('#modal-delete-btn');
  await page.click('#modal-delete-btn');
  await sleep(350);
  const d = await page.evaluate(() => {
    const r = document.querySelector('[data-nv-dialog="confirm"]');
    return { role: r.getAttribute('role'), desc: !!document.getElementById(r.getAttribute('aria-describedby')), focus: document.activeElement.textContent, static: r.hasAttribute('data-static') };
  });
  assert.equal(d.role, 'alertdialog', 'role=alertdialog');
  assert(d.desc, 'aria-describedby 指向内容');
  assert.equal(d.focus, '取消', '危险操作默认聚焦取消');
  assert(d.static, '默认点遮罩不关闭');
  await page.keyboard.press('Escape');
  await sleep(400);
  assert.equal(await page.$eval('#modal-delete-log', (n) => n.textContent), '已取消删除', 'Esc → false');
  assert.equal(await page.$$eval('[data-nv-dialog]', (n) => n.length), 0, '关闭后移除节点');
  await page.click('#modal-delete-btn');
  await sleep(350);
  await page.evaluate(() => [...document.querySelectorAll('[data-nv-dialog] .nv-btn')].find((b) => b.textContent === '删除项目').click());
  await sleep(100);
  const busy = await page.evaluate(() => {
    const ok = [...document.querySelectorAll('[data-nv-dialog] .nv-btn')].find((b) => b.textContent === '删除项目');
    return { loading: ok.hasAttribute('data-loading'), cancelDisabled: [...document.querySelectorAll('[data-nv-dialog] .nv-btn')].find((b) => b.textContent === '取消').disabled };
  });
  assert(busy.loading && busy.cancelDisabled, '加载态：确认按钮 loading、取消禁用');
  await page.keyboard.press('Escape');
  await sleep(100);
  assert.equal(await page.$$eval('[data-nv-dialog]', (n) => n.length), 1, '加载中 Esc 不关闭');
  await sleep(1400);
  assert.equal(await page.$eval('#modal-delete-log', (n) => n.textContent), '✓ 项目已删除', '完成后 resolve(true)');
  assert(await activeIs('#modal-delete-btn'), '关闭后还焦');

  // 6. Nova.alert 与 onConfirm 返回 false；内容是 DOM / 字符串防注入；嵌套事件冒泡不误 resolve
  const r = await page.evaluate(async () => {
    const out = {};
    const p = Nova.alert({ title: '<b>x</b>', content: '<img src=x onerror="window.__xss=1">' });
    await new Promise((r) => setTimeout(r, 300));
    const root = document.querySelector('[data-nv-dialog="alert"]');
    out.text = root.querySelector('.nv-modal-title').textContent;
    out.btns = root.querySelectorAll('.nv-btn').length;
    // 内部元素冒泡上来的 nv:close 不应让 Promise 提前结束
    let settled = false;
    p.then(() => { settled = true; });
    root.querySelector('.nv-modal-desc').dispatchEvent(new CustomEvent('nv:close', { bubbles: true, detail: { reason: 'select' } }));
    await new Promise((r) => setTimeout(r, 50));
    out.early = settled;
    root.querySelector('.nv-btn').click();
    out.value = await p;
    out.xss = !!window.__xss;
    let n = 0;
    const p2 = Nova.confirm({ title: '再次确认', onConfirm: () => (++n < 2 ? false : undefined) });
    await new Promise((r) => setTimeout(r, 300));
    const ok = () => [...document.querySelectorAll('[data-nv-dialog="confirm"] .nv-btn')].pop();
    ok().click();
    await new Promise((r) => setTimeout(r, 50));
    out.stillOpen = !!document.querySelector('[data-nv-dialog="confirm"][data-state="open"]');
    ok().click();
    out.v2 = await p2;
    return out;
  });
  assert.equal(r.text, '<b>x</b>', '标题按文本渲染');
  assert.equal(r.btns, 1, 'alert 只有一个按钮');
  assert(!r.early, '子元素冒泡的 nv:close 不会结束 Promise');
  assert.equal(r.value, undefined, 'alert resolve undefined');
  assert(!r.xss, '内容不执行 HTML');
  assert(r.stillOpen, 'onConfirm 返回 false 时保持打开');
  assert.equal(r.v2, true, '第二次确认 resolve(true)');
  await sleep(400);

  // 7. API：open / close(reason) / toggle / isOpen；尺寸
  await page.evaluate(() => { document.getElementById('modal-size').dataset.size = 'lg'; Nova.modal.open('#modal-size'); });
  await sleep(350);
  assert(await page.evaluate(() => Nova.modal.isOpen('#modal-size')), 'Nova.modal.open / isOpen');
  const w = await page.$eval('#modal-size .nv-modal-panel', (p) => p.offsetWidth); // offsetWidth 不受入场弹性缩放影响
  assert.equal(w, 720, 'data-size=lg 宽 720');
  await page.evaluate(() => Nova.modal.close('#modal-size', 'saved'));
  await sleep(400);
  assert(!(await page.evaluate(() => Nova.modal.isOpen('#modal-size'))), 'Nova.modal.close');
  await page.evaluate(() => Nova.modal.toggle('#modal-size'));
  await sleep(350);
  assert(await isOpen('modal-size'), 'toggle 打开');
  await page.evaluate(() => Nova.modal.toggle('#modal-size'));
  await sleep(400);
  assert(await gone('modal-size'), 'toggle 关闭');
  const e = (await ev()).filter((x) => x[0] === 'modal-size' && x[1] === 'nv:close').map((x) => x[2]).join();
  assert.equal(e, 'saved,api', `自定义 reason（${e}）`);

  // 8. 窄屏：底部弹出
  await page.setViewport({ width: 390, height: 760 });
  await page.evaluate(() => Nova.modal.open('#modal-basic'));
  await sleep(400);
  const sheet = await page.$eval('#modal-basic .nv-modal-panel', (p) => { const r = p.getBoundingClientRect(); return { bottom: Math.round(innerHeight - r.bottom), width: Math.round(r.width) }; });
  assert(sheet.bottom <= 1, `窄屏贴底（距底 ${sheet.bottom}px）`);
  assert(sheet.width >= 388, `窄屏铺满宽度（${sheet.width}px）`);
  await page.keyboard.press('Escape');
  await sleep(400);
  assert(await gone('modal-basic'), '窄屏 Esc 关闭');
};
