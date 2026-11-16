// Select：鼠标/键盘主流程、值同步与事件、搜索、多选、清除、禁用、Esc/点外部、表单重置、程序化 refresh
export default async ({ page, assert, sleep }) => {
  const panels = () => page.evaluate(() => document.querySelectorAll('.nv-select-panel:not([data-state="closed"])').length);
  const trig = (id) => `#${id} + .nv-select-trigger`;

  // —— 初始化：原生 select 隐藏，触发器 ARIA —— //
  const init = await page.evaluate(() => {
    const t = document.querySelector('#select-basic + .nv-select-trigger');
    return {
      role: t.getAttribute('role'),
      popup: t.getAttribute('aria-haspopup'),
      expanded: t.getAttribute('aria-expanded'),
      text: t.textContent.trim(),
      ph: !!t.querySelector('.nv-select-placeholder'),
      nativeTab: document.getElementById('select-basic').tabIndex,
      labelledby: t.getAttribute('aria-labelledby'),
    };
  });
  assert.equal(init.role, 'combobox', '触发器 role=combobox');
  assert.equal(init.popup, 'listbox', 'aria-haspopup=listbox');
  assert.equal(init.expanded, 'false', '初始收起');
  assert.equal(init.text, '选择模型', '占位文字取 value="" 的选项');
  assert(init.ph, '占位使用占位样式');
  assert.equal(init.nativeTab, -1, '原生 select 移出 Tab 序列');
  assert(init.labelledby.split(' ').length === 2, 'aria-labelledby = 标签 + 值');

  // —— 鼠标：点击展开、占位项不出现、点选后关闭并派发 change —— //
  await page.evaluate(() => {
    window.__ev = [];
    const el = document.getElementById('select-basic');
    el.addEventListener('input', () => window.__ev.push('input'));
    el.addEventListener('change', () => window.__ev.push(`change:${el.value}`));
  });
  await page.click(trig('select-basic'));
  await sleep(250);
  const opened = await page.evaluate(() => {
    const p = document.querySelector('.nv-select-panel');
    const t = document.querySelector('#select-basic + .nv-select-trigger');
    const list = p.querySelector('[role="listbox"]');
    return {
      expanded: t.getAttribute('aria-expanded'),
      controls: t.getAttribute('aria-controls') === list.id,
      count: list.querySelectorAll('[role="option"]').length,
      minW: Math.round(p.getBoundingClientRect().width) >= Math.round(t.getBoundingClientRect().width),
      below: p.getBoundingClientRect().top >= t.getBoundingClientRect().bottom,
      active: !!t.getAttribute('aria-activedescendant'),
    };
  });
  assert.equal(opened.expanded, 'true', '展开后 aria-expanded=true');
  assert(opened.controls, 'aria-controls 指向 listbox');
  assert.equal(opened.count, 3, '占位项不出现在菜单');
  assert(opened.minW, '面板最小宽度 = 触发器宽度');
  assert(opened.below, '默认在下方展开');
  assert(opened.active, '有 aria-activedescendant');
  await page.click('.nv-select-panel [role="option"]:nth-child(2)');
  await sleep(250);
  const picked = await page.evaluate(() => ({
    value: document.getElementById('select-basic').value,
    text: document.querySelector('#select-basic + .nv-select-trigger').textContent.trim(),
    ev: window.__ev.join(','),
    log: document.getElementById('select-basic-log').textContent,
    focus: document.activeElement === document.querySelector('#select-basic + .nv-select-trigger'),
  }));
  assert.equal(picked.value, 'nova-lite', '点选写回原生值');
  assert.equal(picked.text, 'Nova Lite', '触发器显示选中文字');
  assert.equal(picked.ev, 'input,change:nova-lite', '派发 input + change');
  assert(picked.log.includes('nova-lite'), '页面监听到 change');
  assert(picked.focus, '选中后焦点回到触发器');
  assert.equal(await panels(), 0, '选中后关闭');

  // 重复选中同一项不派发 change
  await page.click(trig('select-basic'));
  await sleep(200);
  await page.keyboard.press('Enter');
  await sleep(200);
  assert.equal(await page.evaluate(() => window.__ev.length), 2, '值未变化时不派发 change');

  // —— 键盘：↓ 展开、跳过禁用项、Home/End、首字母、Enter 选中、Esc 关闭 —— //
  await page.focus(trig('select-quality'));
  await page.keyboard.press('ArrowDown');
  await sleep(200);
  const act = () => page.evaluate(() => {
    const t = document.activeElement;
    const id = t.getAttribute('aria-activedescendant');
    return id ? document.getElementById(id).dataset.text : null;
  });
  assert.equal(await act(), '快速', '展开时高亮当前选中项');
  await page.keyboard.press('End');
  assert.equal(await act(), '精细', 'End 跳到最后一个可用项（跳过禁用的超清）');
  await page.keyboard.press('ArrowDown');
  assert.equal(await act(), '快速', '↓ 循环且跳过禁用项');
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  assert.equal(await act(), '标准', '↓ 移动');
  await page.keyboard.press('Escape');
  await sleep(250);
  assert.equal(await panels(), 0, 'Esc 关闭');
  assert.equal(await page.evaluate(() => document.getElementById('select-quality').value), 'fast', 'Esc 不改值');
  assert(await page.evaluate(() => document.activeElement.classList.contains('nv-select-trigger')), 'Esc 后焦点在触发器');

  await page.keyboard.press(' ');
  await sleep(200);
  assert.equal(await panels(), 1, '空格展开');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press(' ');
  await sleep(250);
  const q = await page.evaluate(() => ({
    v: document.getElementById('select-quality').value,
    icon: !!document.querySelector('#select-quality + .nv-select-trigger .nv-select-icon svg'),
  }));
  assert.equal(q.v, 'fine', '空格选中');
  assert(q.icon, '触发器显示选项图标');
  assert.equal(await panels(), 0, '空格选中后关闭（keyup 不会重新打开）');

  // 首字母跳转（无搜索）
  await page.focus(trig('select-city'));
  await page.keyboard.press('Enter');
  await sleep(200);
  await page.evaluate(() => {
    const s = document.getElementById('select-city');
    s.append(new Option('Beijing West', 'bjw'));
    s.append(new Option('Berlin', 'ber'));
  });
  await sleep(50);
  await page.keyboard.type('be');
  assert.equal(await act(), 'Beijing West', '连续输入累计匹配，新增选项自动同步');
  await page.keyboard.press('Tab');
  await sleep(250);
  assert.equal(await panels(), 0, 'Tab 关闭');

  // —— 搜索过滤与无匹配项 —— //
  await page.click(trig('select-tz'));
  await sleep(250);
  assert(await page.evaluate(() => document.activeElement.classList.contains('nv-select-search-input')), '可搜索时焦点进入搜索框');
  await page.keyboard.type('utc+08');
  await sleep(50);
  const filtered = await page.evaluate(() => [...document.querySelectorAll('.nv-select-panel [role="option"]')].filter((x) => !x.hidden).map((x) => x.dataset.text));
  assert.equal(filtered.join(','), '上海,新加坡', `按说明过滤：${filtered}`);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await sleep(250);
  assert.equal(await page.evaluate(() => document.getElementById('select-tz').value), 'Asia/Singapore', '搜索后 ↓ Enter 选中');
  await page.click(trig('select-tz'));
  await sleep(200);
  await page.keyboard.type('火星');
  await sleep(50);
  const none = await page.evaluate(() => {
    const e = document.querySelector('.nv-select-panel .nv-select-empty');
    return { shown: !e.hidden, text: e.textContent, groups: [...document.querySelectorAll('.nv-select-panel .nv-select-group')].every((g) => g.hidden) };
  });
  assert(none.shown && none.text === '无匹配项', '无结果显示「无匹配项」');
  assert(none.groups, '无结果时分组标题也隐藏');
  // 点外部关闭
  await page.mouse.click(5, 5);
  await sleep(250);
  assert.equal(await panels(), 0, '点击外部关闭');

  // —— 多选：胶囊、菜单保持打开、删除、Backspace、+N、清除 —— //
  const tags = () => page.evaluate(() => [...document.getElementById('select-tags').selectedOptions].map((o) => o.value).join(','));
  assert.equal(await tags(), 'design,frontend', '多选初始值');
  assert.equal(await page.evaluate(() => document.querySelectorAll('#select-tags + .nv-select-trigger .nv-select-tag').length), 2, '显示胶囊');
  await page.click(trig('select-tags'));
  await sleep(250);
  assert.equal(await page.evaluate(() => document.querySelector('.nv-select-panel [role="listbox"]').getAttribute('aria-multiselectable')), 'true', 'aria-multiselectable');
  await page.click('.nv-select-panel [role="option"]:nth-child(3)');
  await sleep(100);
  assert.equal(await panels(), 1, '多选点选后菜单保持打开');
  assert.equal(await tags(), 'design,frontend,a11y', '多选新增');
  await page.click('.nv-select-panel [role="option"]:nth-child(1)');
  await sleep(50);
  assert.equal(await tags(), 'frontend,a11y', '再次点击取消选中');
  await page.keyboard.press('Escape');
  await sleep(250);
  await page.click('#select-tags + .nv-select-trigger .nv-select-tag-remove');
  await sleep(50);
  assert.equal(await tags(), 'a11y', '胶囊删除按钮');
  assert.equal(await panels(), 0, '点胶囊删除不展开菜单');
  await page.focus(trig('select-tags'));
  await page.keyboard.press('Backspace');
  await sleep(50);
  assert.equal(await tags(), '', 'Backspace 删除最后一项');
  assert(await page.evaluate(() => !!document.querySelector('#select-tags + .nv-select-trigger .nv-select-placeholder')), '清空后显示占位');
  const more = await page.evaluate(() => [...document.querySelectorAll('#select-members + .nv-select-trigger .nv-select-tag')].map((t) => t.textContent.trim()).join('|'));
  assert.equal(more, '林一|周舟|+1', `data-max-tags 显示 +N：${more}`);
  // 清除按钮
  await page.click('#select-members + .nv-select-trigger');
  await sleep(200);
  await page.keyboard.press('Escape');
  await sleep(200);
  await page.evaluate(() => { document.getElementById('select-members').dataset.clearable = ''; });
  await sleep(50);
  await page.click('#select-members + .nv-select-trigger .nv-select-clear');
  await sleep(50);
  assert.equal(await page.evaluate(() => document.getElementById('select-members').selectedOptions.length), 0, '多选清除全部');

  // —— 禁用 —— //
  const dis = await page.evaluate(() => {
    const t = document.querySelector('select[disabled] + .nv-select-trigger');
    t.click();
    return { disabled: t.disabled, panels: document.querySelectorAll('.nv-select-panel').length };
  });
  assert(dis.disabled, '禁用同步到触发器');
  assert.equal(dis.panels, 0, '禁用不展开');
  const inv = await page.evaluate(() => document.querySelector('select[aria-invalid="true"] + .nv-select-trigger').getAttribute('aria-invalid'));
  assert.equal(inv, 'true', 'aria-invalid 同步');

  // —— 单选清除（data-clearable） —— //
  const clr = await page.evaluate(() => {
    const s = document.querySelector('select[data-clearable]:not([multiple])');
    const t = s.nextElementSibling;
    const shown = !t.querySelector('.nv-select-clear').hidden;
    t.querySelector('.nv-select-clear').click();
    return { shown, value: s.value, ph: t.textContent.trim(), hidden: t.querySelector('.nv-select-clear').hidden };
  });
  assert(clr.shown, '有值时显示清除按钮');
  assert.equal(clr.value, '', '清除回到占位');
  assert.equal(clr.ph, '优先级', '清除后显示占位');
  assert(clr.hidden, '无值时隐藏清除按钮');

  // —— 程序化改值 + refresh、表单 reset、超长文本截断 —— //
  const prog = await page.evaluate(async () => {
    const s = document.getElementById('select-city');
    s.value = 'gz';
    Nova.select.refresh(s);
    const a = s.nextElementSibling.textContent.trim();
    s.form.reset();
    await new Promise((r) => setTimeout(r, 30));
    const b = s.nextElementSibling.textContent.trim();
    s.append(new Option('一个非常非常非常非常非常非常非常非常长的城市名称用于测试截断效果', 'long'));
    s.value = 'long';
    Nova.select.refresh(s);
    const t = s.nextElementSibling;
    const label = t.querySelector('.nv-select-label');
    return { a, b, overflow: label.scrollWidth > label.clientWidth, sameH: t.offsetHeight <= 40 };
  });
  assert.equal(prog.a, '广州', 'refresh 同步程序化改值');
  assert.equal(prog.b, '选择城市', 'form reset 同步');
  assert(prog.overflow && prog.sameH, '超长文本省略，不撑高触发器');

  // —— 点击 label 聚焦触发器 —— //
  await page.click('label[for="select-basic"]');
  assert(await page.evaluate(() => document.activeElement === document.querySelector('#select-basic + .nv-select-trigger')), '点击 label 聚焦触发器');

  // —— 向上展开（固定 top）与空间不足自动翻转 —— //
  await page.evaluate(() => document.querySelector('select[data-placement="top-start"]').nextElementSibling.click());
  await sleep(250);
  const up = await page.evaluate(() => {
    const p = document.querySelector('.nv-select-panel');
    const t = document.querySelector('select[data-placement="top-start"]').nextElementSibling;
    return { side: p.dataset.side, ok: p.getBoundingClientRect().bottom <= t.getBoundingClientRect().top };
  });
  assert(up.side === 'top' && up.ok, 'data-placement=top-start 向上展开');
  await page.keyboard.press('Escape');
  await sleep(250);
  const flip = await page.evaluate(async () => {
    const s = document.getElementById('select-quality');
    const t = s.nextElementSibling;
    t.scrollIntoView({ block: 'end' });
    window.scrollBy(0, 0);
    await new Promise((r) => setTimeout(r, 50));
    t.click();
    await new Promise((r) => setTimeout(r, 50));
    const p = document.querySelector('.nv-select-panel');
    const side = p.dataset.side;
    const ok = p.getBoundingClientRect().bottom <= t.getBoundingClientRect().top;
    Nova.select.close(s);
    return { side, ok, near: innerHeight - t.getBoundingClientRect().bottom };
  });
  assert(flip.side === 'top' && flip.ok, `底部空间不足时向上展开（距底 ${flip.near}px）`);
  await sleep(250);

  // —— dialog 内：挂到 dialog，Esc 只关菜单 —— //
  await page.click('#select-dialog-open');
  await sleep(200);
  await page.click('#select-dialog-role + .nv-select-trigger');
  await sleep(250);
  const inDlg = await page.evaluate(() => !!document.querySelector('#select-dialog .nv-select-panel'));
  assert(inDlg, '在 dialog 内时面板挂载到 dialog');
  await page.keyboard.press('Escape');
  await sleep(250);
  const dlgState = await page.evaluate(() => ({ open: document.getElementById('select-dialog').open, panels: document.querySelectorAll('.nv-select-panel').length }));
  assert(dlgState.open && dlgState.panels === 0, 'Esc 先关闭菜单，dialog 保持打开');
  await page.click('#select-dialog-close');
  await sleep(100);

  // —— 同页只有一个菜单展开 —— //
  await page.click(trig('select-basic'));
  await sleep(150);
  await page.click(trig('select-quality'));
  await sleep(300);
  assert.equal(await panels(), 1, '打开另一个时前一个自动关闭');
  await page.keyboard.press('Escape');
  await sleep(250);

  // —— 空数据 + 动态插入 —— //
  const dyn = await page.evaluate(async () => {
    const s = Nova.h('select', { 'data-nv-select': '', 'aria-label': '空' });
    document.querySelector('.doc-main').append(s);
    await new Promise((r) => setTimeout(r, 30));
    const t = s.nextElementSibling;
    t.click();
    const e = document.querySelector('.nv-select-panel .nv-select-empty');
    const res = { inited: t && t.classList.contains('nv-select-trigger'), empty: e && !e.hidden && e.textContent };
    Nova.select.close(s);
    Nova.destroy(s);
    res.destroyed = !s.nextElementSibling || !s.nextElementSibling.classList.contains('nv-select-trigger');
    return res;
  });
  assert(dyn.inited, '动态插入自动初始化');
  assert.equal(dyn.empty, '暂无选项', '无选项时显示空状态');
  assert(dyn.destroyed, 'destroy 还原');

  // —— XSS：选项文字走 textContent —— //
  const xss = await page.evaluate(async () => {
    const s = Nova.h('select', { 'data-nv-select': '', 'aria-label': 'x' }, Nova.h('option', { 'data-desc': '<img src=x onerror=window.__x=1>' }, '<b>bold</b>'));
    document.querySelector('.doc-main').append(s);
    await new Promise((r) => setTimeout(r, 30));
    s.nextElementSibling.click();
    await new Promise((r) => setTimeout(r, 30));
    const ok = !document.querySelector('.nv-select-panel b, .nv-select-panel img') && !window.__x;
    Nova.select.close(s);
    return ok;
  });
  assert(xss, '用户文本不会被当作 HTML');
};
