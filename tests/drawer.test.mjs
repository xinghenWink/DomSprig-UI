// Drawer：四个方向贴边、尺寸、焦点与还焦、Esc/遮罩/关闭、静态遮罩、列表项关闭、窄屏宽度、与 Modal 嵌套
export default async ({ page, assert, sleep }) => {
  await page.evaluate(() => {
    window.__ev = [];
    for (const d of document.querySelectorAll('.nv-drawer')) {
      for (const n of ['nv:open', 'nv:close']) d.addEventListener(n, (e) => { if (e.target === d) window.__ev.push([d.id, n, (e.detail && e.detail.reason) || '']); });
    }
  });
  const ev = () => page.evaluate(() => window.__ev.splice(0));
  const isOpen = (id) => page.evaluate((i) => { const d = document.getElementById(i); return !d.hidden && d.dataset.state === 'open'; }, id);
  const gone = (id) => page.evaluate((i) => document.getElementById(i).hidden, id);
  const activeIs = (sel) => page.evaluate((s) => document.activeElement.matches(s), sel);
  const rect = (id) => page.evaluate((i) => {
    const p = document.querySelector(`#${i} > .nv-drawer-panel`);
    return { l: Math.round(p.offsetLeft), t: Math.round(p.offsetTop), r: Math.round(innerWidth - p.offsetLeft - p.offsetWidth), b: Math.round(innerHeight - p.offsetTop - p.offsetHeight), w: p.offsetWidth, h: p.offsetHeight };
  }, id);
  const scrollTo = (sel) => page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);

  // 1. 四个方向：贴对应边缘；ARIA；Esc 关闭并还焦
  await scrollTo('[data-demo-side="left"]');
  for (const side of ['left', 'top', 'bottom', 'right']) {
    await page.click(`[data-demo-side="${side}"]`);
    await sleep(450);
    assert(await isOpen('drawer-side'), `${side} 打开`);
    const r = await rect('drawer-side');
    const edge = { left: r.l === 0 && r.t === 0 && r.b <= 1, right: r.r <= 1 && r.t === 0 && r.b <= 1, top: r.t === 0 && r.l === 0 && r.r <= 1, bottom: r.b <= 1 && r.l === 0 && r.r <= 1 }[side];
    assert(edge, `${side} 贴边（${JSON.stringify(r)}）`);
    if (side === 'left') {
      const a = await page.$eval('#drawer-side', (d) => [d.getAttribute('role'), d.getAttribute('aria-modal'), !!document.getElementById(d.getAttribute('aria-labelledby'))].join());
      assert.equal(a, 'dialog,true,true', 'role / aria-modal / labelledby');
    }
    await page.keyboard.press('Escape');
    await sleep(450);
    assert(await gone('drawer-side'), `${side} Esc 关闭`);
    assert(await activeIs(`[data-demo-side="${side}"]`), `${side} 还焦`);
  }

  // 2. 设置抽屉：初始焦点、Tab 循环、正文滚动、遮罩关闭
  await scrollTo('[data-nv-drawer-open="#drawer-settings"]');
  await page.click('[data-nv-drawer-open="#drawer-settings"]');
  await sleep(450);
  assert(await activeIs('#drawer-settings-name'), '焦点进入第一个输入框');
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
  assert(await page.evaluate(() => document.getElementById('drawer-settings').contains(document.activeElement)), 'Tab 在抽屉内循环');
  const locked = await page.evaluate(() => getComputedStyle(document.documentElement).overflow === 'hidden' || getComputedStyle(document.body).overflow === 'hidden');
  assert(locked, '锁定页面滚动');
  await page.mouse.click(10, 300);
  await sleep(450);
  assert(await gone('drawer-settings'), '点击遮罩关闭');
  assert(await activeIs('[data-nv-drawer-open="#drawer-settings"]'), '遮罩关闭后还焦');

  // 3. 尺寸
  await scrollTo('[data-demo-drawer-size="sm"]');
  for (const [size, w] of [['sm', 320], ['lg', 560], ['xl', 720]]) {
    await page.click(`[data-demo-drawer-size="${size}"]`);
    await sleep(450);
    assert.equal((await rect('drawer-size')).w, w, `data-size=${size} 宽 ${w}`);
    await page.keyboard.press('Escape');
    await sleep(450);
  }
  await page.click('[data-demo-drawer-size="full"]');
  await sleep(450);
  assert.equal((await rect('drawer-size')).w, 1280, 'full 铺满');
  await page.keyboard.press('Escape');
  await sleep(450);

  // 4. 底部操作面板：列表项 data-nv-drawer-close 关闭
  await scrollTo('[data-nv-drawer-open="#drawer-share"]');
  await page.click('[data-nv-drawer-open="#drawer-share"]');
  await sleep(450);
  assert((await rect('drawer-share')).b <= 1, '底部抽屉贴底');
  await page.click('#drawer-share .nv-drawer-body .nv-item');
  await sleep(450);
  assert(await gone('drawer-share'), '选择列表项后关闭');

  // 5. 导航抽屉：关闭按钮、aria-label
  await scrollTo('[data-nv-drawer-open="#drawer-nav"]');
  await page.click('[data-nv-drawer-open="#drawer-nav"]');
  await sleep(450);
  assert.equal((await rect('drawer-nav')).l, 0, '左侧导航贴左');
  assert.equal(await page.$eval('#drawer-nav', (d) => d.getAttribute('aria-label')), '主导航', '保留自定义 aria-label');
  await page.click('#drawer-nav .nv-drawer-close');
  await sleep(450);
  assert(await gone('drawer-nav'), '关闭按钮');
  let r = (await ev()).filter((x) => x[1] === 'nv:close').map((x) => x[2]);
  assert(r.includes('outside') && r.includes('close-button') && r.includes('escape'), `close reason（${r}）`);

  // 6. 静态遮罩 + API
  await scrollTo('#drawer-api-btn');
  await page.click('#drawer-api-btn');
  await sleep(450);
  await page.mouse.click(10, 300);
  await sleep(100);
  assert(await isOpen('drawer-api'), 'data-static 点遮罩不关闭');
  await page.evaluate(() => Nova.drawer.close('#drawer-api'));
  await sleep(450);
  assert(await gone('drawer-api'), 'Nova.drawer.close');
  assert.equal(await page.$eval('#drawer-api-log', (n) => n.textContent), 'nv:close · reason = api', '示例日志');
  await page.evaluate(() => Nova.drawer.toggle('#drawer-api'));
  await sleep(400);
  assert(await page.evaluate(() => Nova.drawer.isOpen('#drawer-api')), 'toggle / isOpen');
  await page.evaluate(() => Nova.drawer.toggle('#drawer-api'));
  await sleep(450);

  // 7. 抽屉里打开 confirm：Esc 只关 confirm，抽屉保持打开
  await page.evaluate(() => Nova.drawer.open('#drawer-settings'));
  await sleep(450);
  await page.evaluate(() => { window.__c = Nova.confirm({ title: '放弃修改？' }); });
  await sleep(350);
  await page.keyboard.press('Escape');
  await sleep(450);
  assert.equal(await page.evaluate(() => window.__c), false, 'confirm resolve(false)');
  assert(await isOpen('drawer-settings'), '抽屉保持打开');
  assert(await page.evaluate(() => document.getElementById('drawer-settings').contains(document.activeElement)), '焦点回到抽屉内');
  await page.keyboard.press('Escape');
  await sleep(450);
  assert(await gone('drawer-settings'), '再按 Esc 关闭抽屉');

  // 8. 窄屏：左右抽屉宽度不超过视口 - 48px
  await page.setViewport({ width: 390, height: 760 });
  await page.evaluate(() => Nova.drawer.open('#drawer-settings'));
  await sleep(450);
  assert.equal((await rect('drawer-settings')).w, 342, '窄屏宽 390 - 48');
  await page.keyboard.press('Escape');
  await sleep(450);
  assert.equal(await page.$$eval('.nv-drawer:not([hidden]), .nv-modal:not([hidden])', (n) => n.length), 0, '没有残留浮层');
};
