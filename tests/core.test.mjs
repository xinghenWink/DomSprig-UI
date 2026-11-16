// 运行时核心：注册与自动初始化、定位翻转、浮层栈、焦点陷阱、列表导航
export const components = ['button'];

export default async ({ page, assert, sleep }) => {
  // 自动初始化：动态插入的元素也会被 define 的 setup 处理
  const auto = await page.evaluate(async () => {
    let count = 0;
    Nova.define('t-auto', '[data-t-auto]', (el) => { count++; el.dataset.ok = '1'; return { hi: 1 }; });
    const a = Nova.h('div', { 'data-t-auto': '' });
    document.body.append(a);
    await new Promise((r) => setTimeout(r, 30));
    document.body.append(a); // 再次插入不应重复初始化
    await new Promise((r) => setTimeout(r, 30));
    return { count, ok: a.dataset.ok, inst: Nova.get(a, 't-auto') };
  });
  assert.equal(auto.count, 1, '只初始化一次');
  assert.equal(auto.ok, '1', '动态元素被初始化');
  assert.equal(auto.inst.hi, 1, 'Nova.get 返回实例');

  // 工具函数
  const util = await page.evaluate(() => {
    const el = Nova.h('div', { 'data-search': '', 'data-minute-step': '5', 'data-flag': 'false' });
    return {
      esc: Nova.esc('<img onerror=x>"'),
      opts: Nova.opts(el, { search: false, minuteStep: 1, flag: true, other: 'x' }),
      text: Nova.h('b', null, '<i>').innerHTML,
    };
  });
  assert.equal(util.esc, '&lt;img onerror=x&gt;&quot;', 'esc 转义');
  assert.equal(JSON.stringify(util.opts), JSON.stringify({ search: true, minuteStep: 5, flag: false, other: 'x' }), 'opts 类型转换');
  assert.equal(util.text, '&lt;i&gt;', 'h 子文本走 textContent');

  // 定位：底部空间不足时翻转到上方，并夹紧在视口内
  const pos = await page.evaluate(() => {
    const anchor = Nova.h('button', { style: { position: 'fixed', right: '0px', bottom: '10px', width: '40px', height: '30px' } }, 'a');
    const panel = Nova.h('div', { class: 'nv-panel', style: { width: '220px', height: '200px' } });
    document.body.append(anchor);
    const f = Nova.floating(panel, anchor, { placement: 'bottom-start' });
    const r = panel.getBoundingClientRect();
    const side = panel.dataset.side;
    const res = { side, right: r.right, top: r.top, vw: document.documentElement.clientWidth, layers: Nova.layer.size };
    return { res, closeFn: typeof f.close };
  });
  assert.equal(pos.res.side, 'top', '翻转到上方');
  assert(pos.res.right <= pos.res.vw - 8 + 0.5, `水平夹紧（right=${pos.res.right}）`);
  assert.equal(pos.res.layers, 1, '入栈');

  // Esc 关闭最上层
  await page.keyboard.press('Escape');
  await sleep(500);
  const afterEsc = await page.evaluate(() => ({ layers: Nova.layer.size, panels: document.querySelectorAll('.nv-panel').length }));
  assert.equal(afterEsc.layers, 0, 'Esc 后出栈');
  assert.equal(afterEsc.panels, 0, '退场后移除');

  // 点击外部：嵌套浮层只关闭不包含目标的层
  const nested = await page.evaluate(async () => {
    const outer = Nova.h('div', { class: 'nv-panel', style: { width: '200px', height: '100px' } }, Nova.h('button', { id: 'inner-anchor' }, 'x'));
    const btn = Nova.h('button', { style: { position: 'fixed', left: '10px', top: '10px' } }, 'o');
    document.body.append(btn);
    const f1 = Nova.floating(outer, btn);
    const inner = Nova.h('div', { class: 'nv-panel', style: { width: '120px', height: '60px' } });
    const f2 = Nova.floating(inner, document.getElementById('inner-anchor'));
    const r = outer.getBoundingClientRect();
    return { x: r.left + 5, y: r.bottom - 5, f1: !!f1, f2: !!f2 };
  });
  await page.mouse.click(nested.x, nested.y); // 点在外层面板里
  await sleep(300);
  assert.equal(await page.evaluate(() => Nova.layer.size), 1, '只关闭内层');
  await page.mouse.click(600, 600);
  await sleep(300);
  assert.equal(await page.evaluate(() => Nova.layer.size), 0, '点外部全部关闭');

  // 焦点陷阱
  const trap = await page.evaluate(async () => {
    const box = Nova.h('div', null, Nova.h('button', { id: 't1' }, '1'), Nova.h('button', { id: 't2' }, '2'));
    document.body.append(box);
    window.__release = Nova.trapFocus(box);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return document.activeElement.id;
  });
  assert.equal(trap, 't1', '初始焦点在第一个可聚焦元素');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 't1', 'Tab 循环回第一个');
  await page.keyboard.down('Shift');
  await page.keyboard.press('Tab');
  await page.keyboard.up('Shift');
  assert.equal(await page.evaluate(() => document.activeElement.id), 't2', 'Shift+Tab 到最后一个');
  await page.evaluate(() => window.__release());

  // 列表导航 + 首字母
  const nav = await page.evaluate(() => {
    const list = Nova.h('div', null, ['Apple', 'Banana', 'Blueberry', 'Cherry'].map((t, i) =>
      Nova.h('div', { role: 'option', 'aria-disabled': i === 1 ? 'true' : null }, t)));
    document.body.append(list);
    const r = Nova.roving(() => list.children);
    r.move(1); const a = r.active.textContent;
    r.move(1); const b = r.active.textContent; // 跳过禁用的 Banana
    r.move(-1); r.move(-1); const c = r.active.textContent; // 循环到末尾
    r.type('c'); const d = r.active.textContent;
    return [a, b, c, d];
  });
  assert.equal(nav.join(','), 'Apple,Blueberry,Cherry,Cherry', `roving 导航 ${nav}`);
};
