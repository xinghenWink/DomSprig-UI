// Tabs：ARIA 关系、点击/键盘切换、禁用跳过、手动激活、事件、方法、隐藏容器初始化、溢出渐隐
export const components = ['tabs'];

export default async ({ page, assert, sleep }) => {
  // 结构与 ARIA
  const aria = await page.evaluate(() => {
    const root = document.querySelector('.nv-tabs');
    const list = root.querySelector('.nv-tabs-list');
    const tabs = [...list.querySelectorAll('.nv-tab')];
    const panels = [...root.querySelectorAll(':scope > .nv-tab-panel')];
    return {
      listRole: list.getAttribute('role'),
      orient: list.getAttribute('aria-orientation'),
      roles: tabs.map((t) => t.getAttribute('role')).join(),
      controls: tabs.every((t, i) => t.getAttribute('aria-controls') === panels[i].id),
      labelled: panels.every((p, i) => p.getAttribute('aria-labelledby') === tabs[i].id && p.getAttribute('role') === 'tabpanel'),
      selected: tabs.map((t) => t.getAttribute('aria-selected')).join(),
      tabindex: tabs.map((t) => t.tabIndex).join(),
      hidden: panels.map((p) => p.hidden).join(),
      ready: root.hasAttribute('data-ready'),
    };
  });
  assert.equal(aria.listRole, 'tablist', 'tablist 角色');
  assert.equal(aria.orient, 'horizontal', 'aria-orientation');
  assert.equal(aria.roles, 'tab,tab,tab,tab', 'tab 角色');
  assert(aria.controls, 'aria-controls 指向面板');
  assert(aria.labelled, '面板 aria-labelledby 指向标签');
  assert.equal(aria.selected, 'true,false,false,false', '默认选中第一个');
  assert.equal(aria.tabindex, '0,-1,-1,-1', 'roving tabindex');
  assert.equal(aria.hidden, 'false,true,true,true', '只显示选中面板');
  assert(aria.ready, '指示器就绪');

  // 点击切换 + 事件 + 指示器移动
  await page.evaluate(() => {
    window.__ev = [];
    document.addEventListener('nv:change', (e) => window.__ev.push(e.detail.value + '<' + e.detail.previous));
  });
  const ind0 = await page.evaluate(() => document.querySelector('.nv-tabs .nv-tabs-indicator').style.getPropertyValue('--_ix'));
  await page.click('.nv-tabs .nv-tab[data-value="members"]');
  await sleep(320);
  const click = await page.evaluate(() => {
    const root = document.querySelector('.nv-tabs');
    const tab = root.querySelector('.nv-tab[data-value="members"]');
    const ind = root.querySelector('.nv-tabs-indicator');
    return {
      sel: tab.getAttribute('aria-selected'),
      panel: document.getElementById(tab.getAttribute('aria-controls')).hidden,
      value: root.dataset.value,
      ix: ind.style.getPropertyValue('--_ix'),
      left: `${tab.offsetLeft}px`,
      width: ind.style.width,
      tabW: `${tab.offsetWidth}px`,
      ev: window.__ev.join(),
    };
  });
  assert.equal(click.sel, 'true', '点击后选中');
  assert.equal(click.panel, false, '对应面板显示');
  assert.equal(click.value, 'members', 'data-value 同步');
  assert(click.ix !== ind0 && click.ix === click.left, `指示器移到标签处（${click.ix} vs ${click.left}）`);
  assert.equal(click.width, click.tabW, '指示器宽度等于标签');
  assert.equal(click.ev, 'members<overview', 'nv:change detail');

  // 键盘：→ 自动激活、循环、Home/End
  await page.focus('.nv-tabs .nv-tab[data-value="members"]');
  await page.keyboard.press('ArrowRight');
  let st = await page.evaluate(() => [document.activeElement.dataset.value, document.querySelector('.nv-tabs').dataset.value]);
  assert.equal(st.join(), 'settings,settings', '→ 移动并激活');
  await page.keyboard.press('ArrowRight');
  st = await page.evaluate(() => document.activeElement.dataset.value);
  assert.equal(st, 'overview', '→ 末尾循环到首个');
  await page.keyboard.press('End');
  st = await page.evaluate(() => document.activeElement.dataset.value);
  assert.equal(st, 'settings', 'End');
  await page.keyboard.press('Home');
  st = await page.evaluate(() => document.activeElement.dataset.value);
  assert.equal(st, 'overview', 'Home');
  await page.keyboard.press('ArrowLeft');
  st = await page.evaluate(() => document.activeElement.dataset.value);
  assert.equal(st, 'settings', '← 首个循环到末尾');

  // Tab 键从选中标签进入面板
  await page.keyboard.press('Tab');
  st = await page.evaluate(() => document.activeElement.getAttribute('role'));
  assert.equal(st, 'tabpanel', 'Tab 进入面板');

  // 禁用：跳过 + 不可点击（邮箱示例：trash 禁用且在末尾）
  const mail = '.nv-tabs[data-value] .nv-tab[data-value="drafts"]';
  await page.focus(mail);
  await page.keyboard.press('ArrowRight');
  st = await page.evaluate(() => document.activeElement.dataset.value);
  assert.equal(st, 'inbox', '→ 跳过禁用标签并循环');
  await page.keyboard.press('End');
  st = await page.evaluate(() => document.activeElement.dataset.value);
  assert.equal(st, 'drafts', 'End 到最后一个可用标签');
  const disabledClick = await page.evaluate(() => {
    const t = document.querySelector('.nv-tab[data-value="trash"]');
    t.removeAttribute('disabled'); t.setAttribute('aria-disabled', 'true'); // 让点击能落到元素上
    t.click();
    return [t.getAttribute('aria-selected'), Nova.tabs.select(t.closest('.nv-tabs'), 'trash')];
  });
  assert.equal(disabledClick.join(), 'false,false', '禁用标签不可选中');

  // 纵向：↑ ↓
  await page.focus('#tabs-settings .nv-tab[data-value="profile"]');
  await page.keyboard.press('ArrowDown');
  st = await page.evaluate(() => [document.activeElement.dataset.value, document.querySelector('#tabs-settings .nv-tabs-list').getAttribute('aria-orientation')]);
  assert.equal(st.join(), 'security,vertical', '纵向 ↓');
  await page.keyboard.press('ArrowRight');
  st = await page.evaluate(() => document.activeElement.dataset.value);
  assert.equal(st, 'security', '纵向时 → 不移动');

  // 手动激活：方向键只移焦点，Enter 才切换
  await page.focus('#tabs-manual .nv-tab[data-value="sales"]');
  await page.keyboard.press('ArrowRight');
  st = await page.evaluate(() => [document.activeElement.dataset.value, Nova.tabs.value('#tabs-manual')]);
  assert.equal(st.join(), 'traffic,sales', '手动：只移动焦点');
  await page.keyboard.press('Enter');
  st = await page.evaluate(() => [Nova.tabs.value('#tabs-manual'), document.getElementById('tabs-manual-log').textContent]);
  assert.equal(st[0], 'traffic', '手动：Enter 激活');
  assert(st[1].includes('traffic'), '示例日志收到事件');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press(' ');
  st = await page.evaluate(() => Nova.tabs.value('#tabs-manual'));
  assert.equal(st, 'retention', '手动：空格激活');

  // 方法
  await page.click('#tabs-manual-go');
  st = await page.evaluate(() => {
    Nova.tabs.select('#tabs-manual', 'sales', { focus: true });
    return [Nova.tabs.value('#tabs-manual'), document.activeElement.dataset.value, Nova.tabs.select('#tabs-manual', 'nope')];
  });
  assert.equal(st.join(), 'sales,sales,false', 'select 方法');

  // 隐藏容器里初始化：可见后指示器自动落位
  const hiddenInit = await page.evaluate(async () => {
    const box = Nova.h('div', { hidden: true });
    box.innerHTML = '<div class="nv-tabs" id="tabs-t-hidden"><div class="nv-tabs-list"><button class="nv-tab">甲</button><button class="nv-tab">乙乙乙乙</button></div><div class="nv-tab-panel">1</div><div class="nv-tab-panel">2</div></div>';
    document.body.append(box);
    await new Promise((r) => setTimeout(r, 50));
    const root = document.getElementById('tabs-t-hidden');
    const before = root.hasAttribute('data-ready');
    box.hidden = false;
    await new Promise((r) => setTimeout(r, 80));
    const tab = root.querySelector('.nv-tab');
    const ind = root.querySelector('.nv-tabs-indicator');
    return { before, after: root.hasAttribute('data-ready'), w: ind.style.width, tw: `${tab.offsetWidth}px`, sel: tab.getAttribute('aria-selected') };
  });
  assert.equal(hiddenInit.before, false, '隐藏时不测量');
  assert.equal(hiddenInit.after, true, '可见后就绪');
  assert.equal(hiddenInit.w, hiddenInit.tw, '可见后指示器宽度正确');
  assert.equal(hiddenInit.sel, 'true', '隐藏容器内也有默认选中');

  // 动态新增标签与面板
  const dyn = await page.evaluate(async () => {
    const root = document.getElementById('tabs-t-hidden');
    root.querySelector('.nv-tabs-list').append(Nova.h('button', { class: 'nv-tab', 'data-value': 'c' }, '丙'));
    root.append(Nova.h('div', { class: 'nv-tab-panel', 'data-value': 'c' }, '3'));
    await new Promise((r) => setTimeout(r, 30));
    const t = root.querySelector('[data-value="c"].nv-tab');
    return [t.getAttribute('role'), t.getAttribute('aria-controls') === root.querySelector('.nv-tab-panel[data-value="c"]').id, Nova.tabs.select(root, 'c')];
  });
  assert.equal(dyn.join(), 'tab,true,true', '动态标签被接管');

  // 溢出：渐隐边缘与滚动到选中项
  const ov = await page.evaluate(async () => {
    const root = document.querySelector('.nv-tabs.doc-mid');
    const list = root.querySelector('.nv-tabs-list');
    const r1 = { overflow: list.hasAttribute('data-overflow'), right: list.hasAttribute('data-fade-right') };
    Nova.tabs.select(root, 'health');
    await new Promise((r) => setTimeout(r, 600));
    const tab = root.querySelector('.nv-tab[data-value="health"]');
    const lr = list.getBoundingClientRect();
    const tr = tab.getBoundingClientRect();
    return { ...r1, left: list.hasAttribute('data-fade-left'), rightAfter: list.hasAttribute('data-fade-right'), visible: tr.right <= lr.right + 0.5 && tr.left >= lr.left - 0.5 };
  });
  assert(ov.overflow, '标签过多时标记溢出');
  assert(ov.right, '右侧有更多时右侧渐隐');
  assert(ov.visible, '选中项滚动到可见');
  assert(ov.left && !ov.rightAfter, `滚到末尾后只左侧渐隐（left=${ov.left} right=${ov.rightAfter}）`);

  // 超长文本不撑破容器
  const long = await page.evaluate(() => {
    const root = document.querySelector('.nv-tabs.doc-mid');
    return root.scrollWidth <= root.clientWidth + 1;
  });
  assert(long, '标签栏不撑破容器');
};
