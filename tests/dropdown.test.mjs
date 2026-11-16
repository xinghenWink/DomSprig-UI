// Dropdown：ARIA、键盘（APG Menu Button）、勾选/单选、子菜单、右键菜单、滚动关闭、位置
export default async ({ page, assert, sleep }) => {
  const open = (id) => page.evaluate((i) => { const m = window.__menus[i]; return m.isConnected && !m.hidden && m.dataset.state !== 'closed'; }, id);
  const activeText = () => page.evaluate(() => document.activeElement.textContent.trim());
  const activeIs = (sel) => page.evaluate((s) => document.activeElement.matches(s), sel);
  await page.evaluate(() => {
    window.__ev = [];
    // 关闭的菜单会从文档中移出（与 popover 一致），测试自己持有引用
    window.__menus = Object.fromEntries([...document.querySelectorAll('.nv-menu')].map((m) => [m.id, m]));
    for (const t of document.querySelectorAll('[data-nv-dropdown], [data-nv-context-menu]')) {
      for (const n of ['nv:open', 'nv:close', 'nv:select']) t.addEventListener(n, (e) => window.__ev.push([n, e.detail.reason || e.detail.value || '']));
    }
  });
  const ev = () => page.evaluate(() => window.__ev.splice(0));
  const T = (id) => `[data-nv-dropdown="#${id}"]`;
  const scrollTo = (sel) => page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);

  // 1. ARIA 与鼠标打开
  await scrollTo(T('dropdown-basic'));
  const aria = await page.evaluate((s) => { const t = document.querySelector(s); return [t.getAttribute('aria-haspopup'), t.getAttribute('aria-expanded'), t.getAttribute('aria-controls')]; }, T('dropdown-basic'));
  assert.equal(aria.join(','), 'menu,false,dropdown-basic', '触发器 ARIA');
  await page.click(T('dropdown-basic'));
  await sleep(250);
  assert(await open('dropdown-basic'), '点击打开');
  const m = await page.evaluate(() => { const m = document.getElementById('dropdown-basic'); return [m.getAttribute('role'), m.getAttribute('aria-labelledby') === document.querySelector('[data-nv-dropdown="#dropdown-basic"]').id]; });
  assert.equal(m[0], 'menu', 'role=menu');
  assert(m[1], 'aria-labelledby 指向触发器');
  assert.equal((await ev())[0][0], 'nv:open', '派发 nv:open');

  // 2. 键盘：方向键、Home/End、类型前缀、回车选择、焦点回到触发器
  await page.keyboard.press('ArrowDown');
  assert.equal(await activeText(), '新建文档Ctrl N', '鼠标打开后 ↓ 到首项');
  await page.keyboard.press('End');
  assert((await activeText()).startsWith('移到回收站'), 'End 到末项');
  await page.keyboard.press('ArrowDown');
  assert((await activeText()).startsWith('新建文档'), '循环回首项');
  await page.keyboard.press('Home');
  // 中文字符 puppeteer 走 insertText 不产生 keydown：直接派发等价的 keydown
  await page.evaluate(() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: '下', bubbles: true, cancelable: true })));
  assert.equal(await activeText(), '下载', '类型前缀跳转');
  await page.keyboard.press('Enter');
  await sleep(300);
  assert(!(await open('dropdown-basic')), '回车选择后关闭');
  assert(await activeIs(T('dropdown-basic')), '焦点回到触发器');
  let e = await ev();
  assert.equal(JSON.stringify(e), JSON.stringify([['nv:close', 'select'], ['nv:select', 'download']]), '先 close 再 select');
  assert.equal(await page.$eval('#dropdown-basic-log', (n) => n.textContent), 'nv:select · value = download', '示例日志');

  // 3. ↑ 打开聚焦末项，Esc 关闭；Tab 关闭
  await page.keyboard.press('ArrowUp');
  await sleep(50);
  assert((await activeText()).startsWith('移到回收站'), '↑ 打开聚焦末项');
  await page.keyboard.press('Escape');
  await sleep(300);
  assert(!(await open('dropdown-basic')), 'Esc 关闭');
  assert(await activeIs(T('dropdown-basic')), 'Esc 后还焦');
  await page.keyboard.press('Enter');
  await sleep(50);
  assert((await activeText()).startsWith('新建文档'), '回车打开聚焦首项');
  await page.keyboard.press('Tab');
  await sleep(300);
  assert(!(await open('dropdown-basic')), 'Tab 关闭');
  e = await ev();
  assert(e.some((x) => x[1] === 'escape') && e.some((x) => x[1] === 'tab'), 'close reason escape / tab');

  // 4. 外部点击关闭
  await page.click(T('dropdown-basic'));
  await sleep(200);
  await page.mouse.click(5, 5);
  await sleep(300);
  assert(!(await open('dropdown-basic')), '外部点击关闭');
  assert((await ev()).some((x) => x[1] === 'outside'), 'reason outside');

  // 5. 勾选与单选：空格保持打开、回车关闭；禁用项跳过
  await scrollTo(T('dropdown-view'));
  await page.focus(T('dropdown-view'));
  await page.keyboard.press('ArrowDown');
  await sleep(50);
  assert((await activeText()).startsWith('网格'), '首项');
  const chk = (v) => page.evaluate((x) => window.__menus['dropdown-view'].querySelector(`[data-value="${x}"]`).getAttribute('aria-checked'), v);
  await page.keyboard.press(' ');
  await sleep(50);
  assert.equal(await chk('grid'), 'false', '空格切换复选');
  assert(await open('dropdown-view'), '空格后仍打开');
  await page.keyboard.press(' ');
  await sleep(50);
  assert.equal(await chk('grid'), 'true', '空格只切换一次（keyup 不重复）');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  assert.equal(await activeText(), '50%', '跳过禁用项');
  await page.keyboard.press('Enter');
  await sleep(300);
  assert.equal(await chk('50%'), 'true', '回车选中单选');
  assert.equal(await chk('100%'), 'false', '单选互斥');
  assert(!(await open('dropdown-view')), '回车后关闭');
  assert((await page.$eval('#dropdown-view-log', (n) => n.textContent)).includes('50%'), '示例日志更新');
  await page.click(T('dropdown-view'));
  await sleep(200);
  await page.click('#dropdown-view [data-value="ruler"]');
  await sleep(100);
  assert.equal(await chk('ruler'), 'true', '点击切换');
  assert(await open('dropdown-view'), '点击复选后保持打开');
  await page.click('#dropdown-view [data-value="snap"]');
  assert.equal(await chk('snap'), 'true', '禁用项点击无效');
  await page.keyboard.press('Escape');
  await sleep(300);
  await ev();

  // 6. 子菜单：→ 打开、← 回到父项、Esc 只关一层、悬停打开
  await scrollTo(T('dropdown-share'));
  await page.focus(T('dropdown-share'));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  assert.equal(await activeText(), '导出为', '子菜单父项');
  const exp = () => page.$eval('#dropdown-share [data-nv-submenu]', (n) => n.getAttribute('aria-expanded'));
  assert.equal(await exp(), 'false', 'aria-expanded=false');
  await page.keyboard.press('ArrowRight');
  await sleep(200);
  assert(await open('dropdown-share-export'), '→ 打开子菜单');
  assert.equal(await exp(), 'true', 'aria-expanded=true');
  assert.equal(await activeText(), 'PDF 文档', '聚焦子菜单首项');
  const pos = await page.evaluate(() => {
    const a = document.querySelector('#dropdown-share [data-nv-submenu]').getBoundingClientRect();
    const s = document.getElementById('dropdown-share-export').getBoundingClientRect();
    return { right: s.left >= a.right - 2, top: Math.abs(s.top - a.top) };
  });
  assert(pos.right, '子菜单在右侧');
  assert(pos.top < 12, `子菜单与父项顶部对齐（差 ${pos.top}px）`);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await sleep(200);
  assert(await open('dropdown-share-code'), '回车打开三级菜单');
  await page.keyboard.press('Escape');
  await sleep(300);
  assert(!(await open('dropdown-share-code')), 'Esc 关闭三级');
  assert(await open('dropdown-share-export'), 'Esc 只关一层');
  assert.equal(await activeText(), '代码', '焦点回到父项');
  await page.keyboard.press('ArrowLeft');
  await sleep(300);
  assert(!(await open('dropdown-share-export')), '← 关闭子菜单');
  assert.equal(await activeText(), '导出为', '← 回到父项');
  await page.keyboard.press('ArrowRight');
  await sleep(200);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await sleep(300);
  assert(!(await open('dropdown-share-export')), '键盘移走时收起子菜单');
  await page.hover('#dropdown-share [data-nv-submenu]');
  await sleep(400);
  assert(await open('dropdown-share-export'), '悬停打开子菜单');
  await page.click('#dropdown-share-export .nv-item');
  await sleep(300);
  assert(!(await open('dropdown-share')) && !(await open('dropdown-share-export')), '选择子项后整体关闭');
  e = await ev();
  assert(e.some((x) => x[0] === 'nv:select' && x[1] === 'PDF 文档'), '无 data-value 时 value 为标签文本');

  // 7. 右键菜单：指针位置、Shift+F10、滚动关闭、openContext
  await scrollTo('.nv-menu-zone');
  const z = await page.$eval('.nv-menu-zone', (n) => { const r = n.getBoundingClientRect(); return { x: r.left + 40, y: r.top + 30 }; });
  await page.mouse.click(z.x, z.y, { button: 'right' });
  await sleep(250);
  assert(await open('dropdown-context'), '右键打开');
  const cp = await page.$eval('#dropdown-context', (n) => { const r = n.getBoundingClientRect(); return { x: r.left, y: r.top }; });
  assert(Math.abs(cp.x - z.x) < 4 && Math.abs(cp.y - z.y) < 6, `在指针处打开（${cp.x},${cp.y} vs ${z.x},${z.y}）`);
  await page.evaluate(() => window.scrollBy(0, 40));
  await sleep(300);
  assert(!(await open('dropdown-context')), '页面滚动关闭');
  assert((await ev()).some((x) => x[1] === 'scroll'), 'reason scroll');
  await page.focus('.nv-menu-zone');
  await page.keyboard.down('Shift');
  await page.keyboard.press('F10');
  await page.keyboard.up('Shift');
  await sleep(250);
  assert(await open('dropdown-context'), '键盘打开右键菜单');
  assert.equal(await activeText(), '返回Alt ←', '键盘打开聚焦首项');
  await page.keyboard.press('Escape');
  await sleep(300);
  assert(await activeIs('.nv-menu-zone'), '关闭后焦点回到区域');
  await page.evaluate(() => { const r = document.querySelector('.nv-menu-zone').getBoundingClientRect(); Nova.dropdown.openContext('.nv-menu-zone', r.left + 10, r.top + 10); });
  await sleep(200);
  assert(await open('dropdown-context'), 'openContext');
  await page.mouse.click(5, 5);
  await sleep(300);

  // 8. 多个触发器共用菜单、禁用触发器、API
  await scrollTo('[data-nv-dropdown="#dropdown-pos"]');
  const pt = await page.$$('[data-nv-dropdown="#dropdown-pos"]');
  await pt[1].click();
  await sleep(250);
  const up = await page.evaluate(() => {
    const t = document.querySelectorAll('[data-nv-dropdown="#dropdown-pos"]')[1].getBoundingClientRect();
    return document.getElementById('dropdown-pos').getBoundingClientRect().bottom <= t.top;
  });
  assert(up, 'top-start 在上方');
  await pt[0].click();
  await sleep(300);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('[data-nv-dropdown="#dropdown-pos"]')].map((t) => t.getAttribute('aria-expanded')).join()), 'true,false,false,false', '共用菜单时只有一个触发器展开');
  await page.keyboard.press('Escape');
  await sleep(300);
  await pt[3].evaluate((b) => b.click());
  await sleep(200);
  assert(!(await open('dropdown-pos')), '禁用触发器不打开');
  await page.evaluate(() => Nova.dropdown.open('[data-nv-dropdown="#dropdown-basic"]'));
  await sleep(200);
  assert(await page.evaluate(() => Nova.dropdown.isOpen('[data-nv-dropdown="#dropdown-basic"]')), 'Nova.dropdown.open / isOpen');
  await page.evaluate(() => Nova.dropdown.close('[data-nv-dropdown="#dropdown-basic"]'));
  await sleep(300);
  assert(!(await open('dropdown-basic')), 'Nova.dropdown.close');
  assert.equal(await page.$$eval('.nv-menu', (ms) => ms.filter((m) => !m.hidden).length), 0, '最后没有残留菜单');
};
