// Accordion：单开/多开、高度动画、键盘、禁用、事件取消、方法、外部修改 open、减少动态
export const components = ['accordion'];

export default async ({ page, assert, sleep }) => {
  const state = (sel) => page.evaluate((s) =>
    [...document.querySelector(s).querySelectorAll(':scope > .nv-accordion-item')].map((i) => (i.open ? 1 : 0)).join(''), sel);
  const first = '.nv-accordion.doc-mid';

  // 结构与 ARIA
  const aria = await page.evaluate((s) => {
    const item = document.querySelector(s).querySelector('.nv-accordion-item');
    const sum = item.querySelector('summary');
    const content = item.querySelector('.nv-accordion-content');
    return {
      chevron: !!sum.querySelector('.nv-accordion-chevron'),
      label: sum.querySelector('.nv-accordion-label')?.textContent,
      controls: sum.getAttribute('aria-controls') === content.id,
      region: content.getAttribute('role'),
      labelled: content.getAttribute('aria-labelledby') === sum.id,
      state: item.dataset.state,
    };
  }, first);
  assert(aria.chevron, '插入箭头');
  assert.equal(aria.label, 'Nova UI 需要构建工具吗？', '标题包进 label');
  assert(aria.controls && aria.labelled, 'aria-controls / aria-labelledby');
  assert.equal(aria.region, 'region', 'region 角色');
  assert.equal(aria.state, 'open', 'data-state');
  assert.equal(await state(first), '100', '初始第一项展开');

  // 点击：单开模式自动收起旧项，带高度动画
  await page.evaluate(() => { window.__tog = []; document.addEventListener('nv:toggle', (e) => window.__tog.push(`${e.detail.index}:${e.detail.open}`)); });
  await page.click(`${first} .nv-accordion-item:nth-child(2) > summary`);
  const mid = await page.evaluate((s) => {
    const items = document.querySelector(s).querySelectorAll('.nv-accordion-item');
    return { anim: items[1].getAnimations().length, overflow: items[1].style.overflow, chev: items[0].dataset.state };
  }, first);
  assert(mid.anim > 0, '展开时有高度动画');
  assert.equal(mid.overflow, 'hidden', '动画期间裁切');
  assert.equal(mid.chev, 'closed', '旧项箭头立即回转');
  await sleep(500);
  assert.equal(await state(first), '010', '单开：只保留新项');
  const after = await page.evaluate((s) => {
    const item = document.querySelector(s).querySelectorAll('.nv-accordion-item')[1];
    return { overflow: item.style.overflow, anims: item.getAnimations().length, h: item.style.height, ev: window.__tog.join() };
  }, first);
  assert.equal(after.overflow, '', '动画结束恢复 overflow');
  assert.equal(after.anims, 0, '动画结束');
  assert.equal(after.h, '', '不残留内联高度');
  assert.equal(after.ev, '1:true,0:false', `nv:toggle 顺序（${after.ev}）`);

  // 再点同一项收起
  await page.click(`${first} .nv-accordion-item:nth-child(2) > summary`);
  await sleep(500);
  assert.equal(await state(first), '000', '再次点击收起');

  // 快速连点：动画中途反转不出错，最终状态正确
  await page.click(`${first} .nv-accordion-item:nth-child(3) > summary`);
  await sleep(60);
  await page.click(`${first} .nv-accordion-item:nth-child(3) > summary`);
  await sleep(60);
  await page.click(`${first} .nv-accordion-item:nth-child(3) > summary`);
  await sleep(550);
  assert.equal(await state(first), '001', '连点后最终展开');

  // 键盘：Enter / 空格切换，↑ ↓ Home End 移动焦点
  await page.focus(`${first} .nv-accordion-item:nth-child(1) > summary`);
  await page.keyboard.press('Enter');
  await sleep(500);
  assert.equal(await state(first), '100', 'Enter 展开');
  await page.keyboard.press('ArrowDown');
  let f = await page.evaluate(() => document.activeElement.textContent.trim());
  assert.equal(f, '支持哪些浏览器？', '↓ 下一个标题');
  await page.keyboard.press('Space');
  await sleep(500);
  assert.equal(await state(first), '010', '空格展开');
  await page.keyboard.press('End');
  f = await page.evaluate(() => document.activeElement.textContent.trim());
  assert.equal(f, '如何切换暗色主题？', 'End');
  await page.keyboard.press('ArrowDown');
  f = await page.evaluate(() => document.activeElement.textContent.trim());
  assert.equal(f, 'Nova UI 需要构建工具吗？', '↓ 循环');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Home');
  f = await page.evaluate(() => document.activeElement.textContent.trim());
  assert.equal(f, 'Nova UI 需要构建工具吗？', 'Home');

  // 多开
  const multi = '#accordion-api';
  await page.click(`${multi} .nv-accordion-item:nth-child(1) > summary`);
  await page.click(`${multi} .nv-accordion-item:nth-child(3) > summary`);
  await sleep(500);
  assert.equal(await state(multi), '101', '多开：互不影响');

  // 方法
  await page.click('#accordion-api-open');
  await sleep(500);
  assert.equal(await state(multi), '111', 'openAll');
  await page.click('#accordion-api-second');
  await sleep(500);
  assert.equal(await state(multi), '010', 'closeAll + open(1)');
  const val = await page.evaluate(() => Nova.get(document.getElementById('accordion-api'), 'accordion').value.join());
  assert.equal(val, '1', 'value 返回展开项');
  const byValue = await page.evaluate(async () => {
    const r = Nova.accordion.open('#accordion-faq', 'refund', { animate: false });
    return [r, document.querySelector('#accordion-faq [data-value="refund"]').open, Nova.accordion.open('#accordion-faq', 'refund')];
  });
  assert.equal(byValue.join(), 'true,true,false', '按 data-value 打开、无动画；重复打开返回 false');

  // 禁用
  const dis = await page.evaluate(() => {
    const item = document.querySelector('.nv-accordion-item[data-disabled]');
    const s = item.querySelector('summary');
    s.click();
    return { open: item.open, aria: s.getAttribute('aria-disabled'), tab: s.tabIndex, api: Nova.accordion.open(item.parentElement, item) };
  });
  await sleep(400);
  assert.equal(dis.open, false, '禁用项点击不展开');
  assert.equal(dis.aria, 'true', 'aria-disabled');
  assert.equal(dis.tab, -1, '禁用项不可聚焦');
  assert.equal(dis.api, false, '禁用项方法也不展开');
  // 键盘跳过禁用项
  await page.focus('.nv-accordion-item[data-disabled] ~ .nv-accordion-item, .nv-accordion[data-variant="separated"]:has([data-disabled]) .nv-accordion-item:nth-child(2) > summary');
  await page.keyboard.press('ArrowDown');
  f = await page.evaluate(() => document.activeElement.textContent.trim());
  assert.equal(f, '第一章 · 快速开始', '↓ 跳过禁用项并循环');

  // 事件可取消
  const cancel = await page.evaluate(async () => {
    const acc = document.getElementById('accordion-faq');
    const stop = (e) => e.preventDefault();
    acc.addEventListener('nv:toggle', stop);
    acc.querySelector('[data-value="team"] > summary').click();
    await new Promise((r) => setTimeout(r, 400));
    const blocked = acc.querySelector('[data-value="team"]').open;
    acc.removeEventListener('nv:toggle', stop);
    return blocked;
  });
  assert.equal(cancel, false, 'preventDefault 阻止展开');

  // summary 内的按钮/链接不触发切换；内容区按钮照常可用
  const log = await page.evaluate(() => document.getElementById('accordion-faq-log').textContent);
  assert(log.includes('nv:toggle'), '示例日志收到事件');

  // 外部直接改 open（如页内查找）：同步 data-state 并维持单开
  const ext = await page.evaluate(async () => {
    const acc = document.getElementById('accordion-faq');
    const items = acc.querySelectorAll('.nv-accordion-item');
    items[0].open = true;
    await new Promise((r) => setTimeout(r, 450));
    return { state: items[0].dataset.state, refund: items[1].open, open: [...items].map((i) => (i.open ? 1 : 0)).join('') };
  });
  assert.equal(ext.state, 'open', '外部 open 同步 data-state');
  assert.equal(ext.open, '1000', `外部展开后仍单开（${ext.open}）`);

  // 动态插入项
  const dyn = await page.evaluate(async () => {
    const acc = document.getElementById('accordion-faq');
    const d = Nova.h('details', { class: 'nv-accordion-item', 'data-value': 'new' }, Nova.h('summary', null, '新问题'), Nova.h('div', { class: 'nv-accordion-content' }, '答案'));
    acc.append(d);
    await new Promise((r) => setTimeout(r, 30));
    return !!d.querySelector('.nv-accordion-chevron') && Nova.accordion.open(acc, 'new', { animate: false }) && d.open;
  });
  assert(dyn, '动态项被接管');

  // 减少动态：不创建动画
  const rm = await page.evaluate(() => {
    const orig = Nova.reducedMotion;
    Nova.reducedMotion = () => true;
    const acc = document.getElementById('accordion-api');
    Nova.accordion.open(acc, 2);
    const item = acc.querySelectorAll('.nv-accordion-item')[2];
    const r = [item.open, item.getAnimations().length];
    Nova.reducedMotion = orig;
    return r;
  });
  assert.equal(rm.join(), 'true,0', '减少动态时直接切换');
};
