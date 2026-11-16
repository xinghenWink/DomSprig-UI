// Combobox：结构与 ARIA、输入过滤与高亮、键盘选择、鼠标选择、Esc/失焦关闭、清除、最少字符、datalist 动态更新
export default async ({ page, assert, sleep }) => {
  const panel = () => page.evaluate(() => {
    const p = document.querySelector('.nv-combobox-panel:not([data-state="closed"])');
    if (!p) return null;
    const opts = [...p.querySelectorAll('[role="option"]')];
    return {
      values: opts.map((o) => o.dataset.value),
      active: opts.findIndex((o) => o.hasAttribute('data-active')),
      empty: p.querySelector('.nv-combobox-empty:not([hidden])')?.textContent || '',
      marks: [...p.querySelectorAll('.nv-combobox-mark')].map((m) => m.textContent),
    };
  });
  const type = async (sel, text) => { await page.focus(sel); await page.keyboard.type(text); await sleep(200); };
  const clear = (sel) => page.$eval(sel, (el) => { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });

  // —— 结构 —— //
  const init = await page.evaluate(() => {
    const el = document.getElementById('cb-basic');
    return {
      wrapped: el.parentElement.classList.contains('nv-combobox-box'),
      list: el.hasAttribute('list'),
      role: el.getAttribute('role'),
      expanded: el.getAttribute('aria-expanded'),
      auto: el.getAttribute('autocomplete'),
    };
  });
  assert(init.wrapped, 'input 包进 .nv-combobox-box');
  assert(!init.list, '去掉 list，避免原生下拉');
  assert.equal(init.role, 'combobox', 'role=combobox');
  assert.equal(init.expanded, 'false', '初始收起');
  assert.equal(init.auto, 'off', 'autocomplete=off');

  // —— 输入过滤 —— //
  await page.evaluate(() => {
    window.__ev = [];
    const el = document.getElementById('cb-basic');
    ['input', 'change', 'nv:select'].forEach((t) => el.addEventListener(t, (e) => window.__ev.push(`${t}:${e.detail?.value ?? el.value}`)));
  });
  await type('#cb-basic', '海');
  let p = await panel();
  assert(p, '输入后弹出面板');
  assert.equal(p.values.join(','), '上海', '按包含匹配过滤');
  assert.equal(p.marks.join(','), '海', '匹配段加粗');
  assert.equal(p.active, -1, '输入时不自动高亮，回车不误选');
  assert.equal(await page.$eval('#cb-basic', (el) => el.getAttribute('aria-expanded')), 'true', 'aria-expanded=true');

  // —— 无匹配 —— //
  await page.keyboard.type('xyz');
  await sleep(200);
  p = await panel();
  assert(p && p.values.length === 0 && p.empty === '无匹配项', '无匹配时显示提示');

  // —— 键盘：清空后 ↓ 打开并移动、Enter 选中 —— //
  await clear('#cb-basic');
  await sleep(100);
  await page.keyboard.press('Escape');
  await sleep(250);
  assert.equal(await panel(), null, 'Esc 关闭');
  await page.keyboard.press('ArrowDown');
  await sleep(200);
  p = await panel();
  assert(p && p.values.length === 8, '↓ 打开全部建议');
  assert.equal(p.active, 0, '↓ 打开后高亮第一项');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await sleep(50);
  assert.equal((await panel()).active, 2, '↓ 移动高亮');
  const ad = await page.$eval('#cb-basic', (el) => document.getElementById(el.getAttribute('aria-activedescendant'))?.dataset.value);
  assert.equal(ad, '广州', 'aria-activedescendant 指向高亮项');
  await page.evaluate(() => { window.__ev = []; });
  await page.keyboard.press('Enter');
  await sleep(250);
  assert.equal(await page.$eval('#cb-basic', (el) => el.value), '广州', 'Enter 写回值');
  assert.equal(await panel(), null, '选中后收起');
  const ev = await page.evaluate(() => window.__ev.join('|'));
  assert(ev.includes('input:广州') && ev.includes('change:广州') && ev.includes('nv:select:广州'), `派发 input/change/nv:select（${ev}）`);
  assert.equal(await page.$eval('#cb-log', (el) => el.textContent), '选中：广州', '示例日志更新');

  // —— 再次 ↓ 打开时高亮当前值 —— //
  await page.keyboard.press('ArrowDown');
  await sleep(200);
  p = await panel();
  assert.equal(p.values[p.active], '广州', '已有值时 ↓ 高亮当前值');
  await page.keyboard.press('Escape');
  await sleep(250);

  // —— 鼠标：点击输入框打开，点击选项选中，面板里 mousedown 不让输入框失焦 —— //
  await clear('#cb-basic');
  await page.click('body', { offset: { x: 5, y: 5 } });
  await sleep(250);
  await page.click('#cb-basic');
  await sleep(250);
  assert(await panel(), '点击输入框打开');
  await page.click('.nv-combobox-panel [data-value="杭州"]');
  await sleep(250);
  const afterClick = await page.evaluate(() => ({ v: document.getElementById('cb-basic').value, focus: document.activeElement.id }));
  assert.equal(afterClick.v, '杭州', '点击选项选中');
  assert.equal(afterClick.focus, 'cb-basic', '选中后焦点留在输入框');
  assert.equal(await panel(), null, '点击选中后收起');

  // —— 点外部 / 失焦关闭 —— //
  await page.click('#cb-basic');
  await sleep(200);
  assert(await panel(), '再次打开');
  await page.click('body', { offset: { x: 5, y: 5 } });
  await sleep(300);
  assert.equal(await panel(), null, '失焦后关闭');

  // —— 点外框（箭头）切换 —— //
  const arrowBox = await page.$eval('#cb-basic', (el) => { const r = el.parentElement.querySelector('.nv-combobox-arrow').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(arrowBox.x, arrowBox.y);
  await sleep(250);
  assert(await panel(), '点箭头打开');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'cb-basic', '点箭头聚焦输入框');
  await page.mouse.click(arrowBox.x, arrowBox.y);
  await sleep(300);
  assert.equal(await panel(), null, '再点箭头收起');

  // —— 图标与说明 —— //
  await page.focus('input[aria-label="命令"]');
  await page.keyboard.press('ArrowDown');
  await sleep(250);
  const rich = await page.evaluate(() => {
    const o = document.querySelector('.nv-combobox-panel [data-value="新建文件"]');
    return { icon: !!o.querySelector('.nv-item-icon svg'), desc: o.querySelector('.nv-item-desc')?.textContent, noDesc: !document.querySelector('.nv-combobox-panel [data-value="用户"] .nv-item-desc') };
  });
  assert(rich.icon, 'data-icon 显示图标');
  assert.equal(rich.desc, 'Ctrl N', 'option 文字作为说明');
  assert(rich.noDesc, '没有说明时不渲染');
  await page.keyboard.press('Escape');
  await sleep(250);

  // —— 清除按钮 —— //
  const clr = await page.evaluate(() => {
    const lg = document.querySelector('input[aria-label="大号城市"]');
    const sm = document.querySelector('input[aria-label="小号城市"]');
    return {
      lgVisible: !lg.parentElement.querySelector('.nv-combobox-clear').hidden,
      smHidden: sm.parentElement.querySelector('.nv-combobox-clear').hidden,
      smDisplay: getComputedStyle(sm.parentElement.querySelector('.nv-combobox-clear')).display,
      size: lg.parentElement.dataset.size,
    };
  });
  assert(clr.lgVisible, '有值时显示清除按钮');
  assert(clr.smHidden && clr.smDisplay === 'none', '无值时清除按钮隐藏');
  assert.equal(clr.size, 'lg', 'data-size 转到外框');
  await page.evaluate(() => { window.__clr = []; document.querySelector('input[aria-label="大号城市"]').addEventListener('change', (e) => window.__clr.push(e.target.value)); });
  await page.click('input[aria-label="大号城市"] ~ .nv-combobox-clear');
  await sleep(200);
  const cleared = await page.evaluate(() => {
    const lg = document.querySelector('input[aria-label="大号城市"]');
    return { v: lg.value, ev: window.__clr.join(','), focus: document.activeElement === lg, hidden: lg.parentElement.querySelector('.nv-combobox-clear').hidden };
  });
  assert.equal(cleared.v, '', '清除后为空');
  assert.equal(cleared.ev, '', '清除派发 change');
  assert(cleared.focus, '清除后聚焦输入框');
  assert(cleared.hidden, '清除后按钮隐藏');
  await page.keyboard.press('Escape');
  await page.click('body', { offset: { x: 5, y: 5 } });
  await sleep(250);

  // —— 最少字符 —— //
  await page.click('input[aria-label="城市搜索"]');
  await sleep(200);
  assert.equal(await panel(), null, 'min-length=1 时空值不弹出');
  await page.keyboard.type('州');
  await sleep(200);
  p = await panel();
  assert(p && p.values.join(',') === '广州,杭州', '达到字符数后弹出');
  await page.keyboard.press('Backspace');
  await sleep(250);
  assert.equal(await panel(), null, '删到不足字符数时收起');
  await page.click('body', { offset: { x: 5, y: 5 } });
  await sleep(250);

  // —— datalist 动态更新：输入后异步填充会自动弹出 —— //
  await page.evaluate(() => {
    const dl = document.createElement('datalist');
    dl.id = 'cb-remote';
    document.body.append(dl);
    const input = document.createElement('input');
    input.className = 'nv-combobox';
    input.id = 'cb-remote-input';
    input.setAttribute('list', 'cb-remote');
    input.setAttribute('aria-label', '远程');
    document.querySelector('.doc-preview').append(input);
    Nova.init(input.parentElement);
    input.addEventListener('input', () => {
      const q = input.value;
      setTimeout(() => { dl.replaceChildren(...['a', 'b', 'c'].map((x) => Object.assign(document.createElement('option'), { value: `${q}-${x}` }))); }, 50);
    });
  });
  await page.focus('#cb-remote-input');
  await page.keyboard.type('k');
  await sleep(300);
  p = await panel();
  assert(p && p.values.join(',') === 'k-a,k-b,k-c', `异步填充后自动弹出（${p && p.values}）`);

  // —— destroy 还原 —— //
  const restored = await page.evaluate(() => {
    const el = document.getElementById('cb-remote-input');
    Nova.get(el, 'combobox').destroy();
    return { list: el.getAttribute('list'), wrapped: el.parentElement.classList.contains('nv-combobox-box'), panels: document.querySelectorAll('.nv-combobox-panel:not([data-state="closed"])').length };
  });
  assert.equal(restored.list, 'cb-remote', 'destroy 还原 list');
  assert(!restored.wrapped, 'destroy 去掉外框');
  assert.equal(restored.panels, 0, 'destroy 关闭面板');
};
