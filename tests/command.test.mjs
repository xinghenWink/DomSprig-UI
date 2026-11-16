// Command 命令面板：打开/关闭、模糊匹配排序、高亮、空状态、键盘、遮罩、重复打开、内嵌版、转义
export const components = ['command'];

const ITEMS = `[
  { id: 'settings', label: 'Settings', group: '偏好', icon: 'settings', shortcut: 'Ctrl ,' },
  { id: 'set-theme', label: 'Set Theme', group: '偏好', keywords: ['appearance'] },
  { id: 'reset', label: 'Reset Settings', group: '偏好' },
  { id: 'files', label: 'Search Files', group: '文件', shortcut: ['Ctrl', 'P'], desc: '按文件名查找' },
  { id: 'xss', label: '<img src=x onerror="window.__xss=1">', group: '文件', desc: '<b>desc</b>' },
  { id: 'gp-tool', label: 'GP 工具', group: '工具' },
  { id: 'git-push', label: 'Git Push', group: '工具' },
  { id: 'grep', label: 'Grep', group: '工具' },
  { id: 'theme', label: '切换明暗主题', group: '操作', keywords: 'theme dark' },
  { id: 'locked', label: 'Locked Item', group: '操作', disabled: true },
]`;

export default async ({ page, assert, sleep }) => {
  const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const visible = () => page.evaluate(() =>
    [...document.querySelectorAll('.nv-command-dialog:not([data-state="closed"]) [role="option"]')]
      .filter((el) => el.getClientRects().length).map((el) => el.dataset.value));
  const type = async (text) => {
    await page.evaluate(() => { const i = document.querySelector('.nv-command-dialog [role="combobox"]'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); });
    if (text) await page.keyboard.type(text);
  };
  const openPalette = () => page.evaluate((src) => {
    window.__sel = [];
    window.__closed = 0;
    // eslint-disable-next-line no-new-func
    const items = new Function(`return ${src}`)().map((it) => ({ ...it, onSelect: (x) => window.__sel.push(x.id) }));
    window.__h = Nova.command.open({ items, onClose: () => window.__closed++ });
    return typeof window.__h.close;
  }, ITEMS);

  await page.evaluate(() => {
    const b = Nova.h('button', { id: 't-opener', type: 'button' }, 'open');
    document.body.prepend(b);
    b.focus();
  });

  // —— 打开：结构、ARIA、焦点 ——
  assert.equal(await openPalette(), 'function', 'open() 返回 { close }');
  await frame();
  const a11y = await page.evaluate(() => {
    const dlg = document.querySelector('.nv-command-dialog [role="dialog"]');
    const input = dlg.querySelector('[role="combobox"]');
    const list = document.getElementById(input.getAttribute('aria-controls'));
    const first = list.querySelector('[role="option"]');
    return {
      modal: dlg.getAttribute('aria-modal'),
      label: dlg.getAttribute('aria-label'),
      focused: document.activeElement === input,
      listRole: list.getAttribute('role'),
      groups: list.querySelectorAll('[role="group"][aria-labelledby]').length,
      activedesc: input.getAttribute('aria-activedescendant') === first.id,
      firstSelected: first.getAttribute('aria-selected'),
      expanded: input.getAttribute('aria-expanded'),
      kbds: [...first.querySelectorAll('kbd')].map((k) => k.textContent).join('+'),
      locked: document.documentElement.style.overflow,
      layers: Nova.layer.size,
    };
  });
  assert.equal(a11y.modal, 'true', 'aria-modal');
  assert.equal(a11y.label, '命令面板', '默认 aria-label');
  assert(a11y.focused, '焦点进入输入框');
  assert.equal(a11y.listRole, 'listbox', 'listbox');
  assert.equal(a11y.groups, 4, '4 个具名分组');
  assert(a11y.activedesc, 'aria-activedescendant 指向第一项');
  assert.equal(a11y.firstSelected, 'true', '高亮项 aria-selected');
  assert.equal(a11y.expanded, 'true', 'aria-expanded');
  assert.equal(a11y.kbds, 'Ctrl+,', 'shortcut 渲染为键帽');
  assert.equal(a11y.locked, 'hidden', '锁定页面滚动');
  assert.equal(a11y.layers, 1, '入栈');

  // —— 评分排序：前缀 > 词首 ——
  await type('set');
  assert.equal((await visible()).join(','), 'settings,set-theme,reset', `set 排序 ${await visible()}`);
  const groupState = await page.evaluate(() => {
    const groups = [...document.querySelectorAll('.nv-command-dialog .nv-command-group')];
    return groups.filter((g) => !g.hidden).length;
  });
  assert.equal(groupState, 1, '没有结果的分组隐藏');
  const marks = await page.evaluate(() =>
    [...document.querySelectorAll('.nv-command-dialog [role="option"]:not([hidden]) .nv-item-label')].map((l) =>
      [...l.querySelectorAll('mark.nv-command-hl')].map((m) => m.textContent).join('|')));
  assert.equal(marks.join(','), 'Set,Set,Set', `高亮命中字符 ${marks}`);
  const resetLabel = await page.evaluate(() => document.querySelector('[data-value="reset"] .nv-item-label').innerHTML);
  assert.equal(resetLabel, 'Reset <mark class="nv-command-hl">Set</mark>tings', '词首高亮位置正确');

  // 缩写：完全前缀 > 词首缩写 > 普通子序列
  await type('gp');
  assert.equal((await visible()).join(','), 'gp-tool,git-push,grep', `gp 排序 ${await visible()}`);
  const gpMarks = await page.evaluate(() => [...document.querySelectorAll('[data-value="git-push"] mark')].map((m) => m.textContent).join('|'));
  assert.equal(gpMarks, 'G|P', '缩写高亮 G 与 P');

  // 中文词首 + 关键词（关键词命中不高亮）
  await type('主题');
  assert.equal((await visible()).join(','), 'theme', '中文子串命中');
  await type('dark');
  assert.equal((await visible()).join(','), 'theme', '关键词命中');
  assert.equal(await page.evaluate(() => document.querySelectorAll('[data-value="theme"] mark').length), 0, '关键词命中不高亮');
  await type('appearance');
  assert.equal((await visible()).join(','), 'set-theme', '数组关键词');

  // 空状态
  await type('zzzz');
  const empty = await page.evaluate(() => {
    const dlg = document.querySelector('.nv-command-dialog');
    const e = dlg.querySelector('.nv-command-empty');
    return {
      empty: !e.hidden && e.getClientRects().length > 0,
      text: e.textContent,
      groups: [...dlg.querySelectorAll('.nv-command-group')].filter((g) => !g.hidden).length,
      expanded: dlg.querySelector('[role="combobox"]').getAttribute('aria-expanded'),
      active: dlg.querySelector('[role="combobox"]').hasAttribute('aria-activedescendant'),
    };
  });
  assert(empty.empty, '显示空状态');
  assert.equal(empty.text, '没有找到相关结果', '默认空状态文案');
  assert.equal(empty.groups, 0, '所有分组隐藏');
  assert.equal(empty.expanded, 'false', '无结果 aria-expanded=false');
  assert(!empty.active, '无结果时没有 activedescendant');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.__sel.length), 0, '无结果时 Enter 不选择');

  // 特殊字符：作为文本渲染与高亮，不执行
  await type('<img');
  const xss = await page.evaluate(() => {
    const opt = document.querySelector('[data-value="xss"]');
    return {
      visible: !opt.hidden,
      img: !!document.querySelector('.nv-command-dialog img'),
      ran: window.__xss === 1,
      label: opt.querySelector('.nv-item-label').textContent,
      mark: opt.querySelector('mark').textContent,
      desc: opt.querySelector('.nv-command-item-desc').textContent,
    };
  });
  assert(xss.visible, '特殊字符可搜索');
  assert(!xss.img && !xss.ran, '标签中的 HTML 不执行');
  assert.equal(xss.label, '<img src=x onerror="window.__xss=1">', '标签原样显示');
  assert.equal(xss.mark, '<img', '高亮文本正确');
  assert.equal(xss.desc, '<b>desc</b>', '描述原样显示');

  // —— 键盘：↑↓ 循环、跳过禁用、Enter 选择 ——
  await type('');
  const activeVal = () => page.evaluate(() => document.querySelector('.nv-command-dialog [role="option"][data-active]')?.dataset.value);
  assert.equal(await activeVal(), 'settings', '初始高亮第一项');
  await page.keyboard.press('ArrowDown');
  assert.equal(await activeVal(), 'set-theme', '↓ 下一项');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  assert.equal(await activeVal(), 'theme', '↑ 循环到最后一个可用项（跳过禁用）');
  await page.keyboard.press('Home');
  assert.equal(await activeVal(), 'settings', 'Home');
  await page.keyboard.press('End');
  assert.equal(await activeVal(), 'theme', 'End');
  await type('push');
  await page.keyboard.press('Enter');
  await sleep(400);
  const picked = await page.evaluate(() => ({
    sel: window.__sel.join(','),
    closed: window.__closed,
    dialogs: document.querySelectorAll('.nv-command-dialog').length,
    focus: document.activeElement.id,
    layers: Nova.layer.size,
    overflow: document.documentElement.style.overflow,
    handleClosed: window.__h.closed,
  }));
  assert.equal(picked.sel, 'git-push', 'Enter 调用 onSelect');
  assert.equal(picked.closed, 1, 'onClose 调用一次');
  assert.equal(picked.dialogs, 0, '退场后移除');
  assert.equal(picked.focus, 't-opener', '焦点还给打开者');
  assert.equal(picked.layers, 0, '出栈');
  assert.equal(picked.overflow, '', '解除滚动锁定');
  assert(picked.handleClosed, 'handle.closed');

  // —— 鼠标：悬停高亮、点击选择 ——
  await openPalette();
  await frame();
  const box = await page.evaluate(() => {
    const r = document.querySelector('.nv-command-dialog [data-value="files"]').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(box.x, box.y);
  assert.equal(await activeVal(), 'files', '悬停设为高亮');
  await page.mouse.click(box.x, box.y);
  await sleep(400);
  assert.equal(await page.evaluate(() => window.__sel.join(',')), 'files', '点击选择');
  await page.evaluate(() => document.getElementById('t-opener').focus());

  // —— Esc 关闭并还焦 ——
  await openPalette();
  await frame();
  await page.keyboard.press('Escape');
  await sleep(400);
  const esc = await page.evaluate(() => ({ n: document.querySelectorAll('.nv-command-dialog').length, focus: document.activeElement.id, sel: window.__sel.length }));
  assert.equal(esc.n, 0, 'Esc 关闭');
  assert.equal(esc.focus, 't-opener', 'Esc 后还焦');
  assert.equal(esc.sel, 0, 'Esc 不触发 onSelect');

  // —— 点遮罩关闭 ——
  await openPalette();
  await frame();
  await page.mouse.click(12, 840);
  await sleep(400);
  assert.equal(await page.evaluate(() => document.querySelectorAll('.nv-command-dialog').length), 0, '点遮罩关闭');

  // —— 重复打开：替换旧面板；立即关闭不会抢走焦点 ——
  await page.evaluate(() => document.getElementById('t-opener').focus());
  const reopen = await page.evaluate(async () => {
    const a = Nova.command.open({ items: [{ id: 'a', label: 'A' }] });
    const b = Nova.command.open({ items: [{ id: 'b', label: 'B' }], placeholder: '第二个' });
    await new Promise((r) => setTimeout(r, 400));
    const res = {
      aClosed: a.closed,
      open: document.querySelectorAll('.nv-command-dialog').length,
      placeholder: document.querySelector('.nv-command-dialog input').placeholder,
      focusInB: document.activeElement === document.querySelector('.nv-command-dialog input'),
      layers: Nova.layer.size,
    };
    b.close();
    Nova.command.close();
    await new Promise((r) => setTimeout(r, 400));
    res.after = document.querySelectorAll('.nv-command-dialog').length;
    res.focus = document.activeElement.id;
    res.overflow = document.documentElement.style.overflow;
    return res;
  });
  assert(reopen.aClosed, '旧面板被关闭');
  assert.equal(reopen.open, 1, '只保留一个面板');
  assert.equal(reopen.placeholder, '第二个', '新面板生效');
  assert(reopen.focusInB, '焦点在新面板');
  assert.equal(reopen.layers, 1, '只有一层');
  assert.equal(reopen.after, 0, '关闭后清理');
  assert.equal(reopen.focus, 't-opener', '最终还焦给最初的打开者');
  assert.equal(reopen.overflow, '', '滚动锁定计数归零');

  // —— 内嵌版 ——
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.innerHTML = `
      <div class="nv-command" data-nv-command id="t-inline" aria-label="测试" data-empty-text="无匹配">
        <input class="nv-command-input">
        <div class="nv-command-list">
          <div class="nv-panel-label">文件</div>
          <div class="nv-item" data-value="new">新建文件</div>
          <div class="nv-item" data-value="upload" data-keywords="sync">上传</div>
          <hr class="nv-panel-sep">
          <div class="nv-panel-label">编辑</div>
          <div class="nv-item" data-value="rename">重命名</div>
          <div class="nv-item" data-value="off" aria-disabled="true">禁用项</div>
          <hr class="nv-panel-sep">
          <div class="nv-item" data-value="tail">尾部</div>
        </div>
      </div>`;
    document.body.append(host);
    window.__inline = [];
    host.addEventListener('nv:select', (e) => window.__inline.push(e.detail.value));
  });
  await sleep(50);
  const inl = await page.evaluate(() => {
    const root = document.getElementById('t-inline');
    const input = root.querySelector('input');
    return {
      inst: !!Nova.get(root, 'command'),
      role: input.getAttribute('role'),
      placeholder: input.placeholder,
      groups: root.querySelectorAll('.nv-command-group').length,
      labelled: root.querySelectorAll('[role="group"][aria-labelledby]').length,
      options: root.querySelectorAll('[role="option"]').length,
      icon: !!root.querySelector('.nv-command-search > svg'),
    };
  });
  assert(inl.inst, '内嵌版自动初始化');
  assert.equal(inl.role, 'combobox', '输入框 combobox');
  assert.equal(inl.placeholder, '搜索…', '默认占位');
  assert.equal(inl.groups, 3, '扁平写法自动分组');
  assert.equal(inl.labelled, 2, '有标题的分组 role=group');
  assert.equal(inl.options, 5, '选项 role=option');
  assert(inl.icon, '自动补搜索图标');

  await page.focus('#t-inline input');
  await page.keyboard.type('重');
  const f1 = await page.evaluate(() => {
    const root = document.getElementById('t-inline');
    const vis = (sel) => [...root.querySelectorAll(sel)].filter((el) => el.getClientRects().length);
    return {
      opts: vis('[role="option"]').map((el) => el.dataset.value).join(','),
      seps: vis('.nv-panel-sep').length,
      mark: root.querySelector('[data-value="rename"] mark')?.textContent,
    };
  });
  assert.equal(f1.opts, 'rename', '内嵌版过滤');
  assert.equal(f1.seps, 0, '只剩一个分组时隐藏分隔线');
  assert.equal(f1.mark, '重', '内嵌版高亮');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.__inline.join(',')), 'rename', 'Enter 派发 nv:select');

  await page.keyboard.press('Backspace');
  await page.keyboard.type('sync');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('#t-inline [role="option"]')].filter((el) => !el.hidden).map((el) => el.dataset.value).join(',')), 'upload', 'data-keywords 参与匹配');

  await page.keyboard.press('Escape');
  const cleared = await page.evaluate(() => ({
    value: document.querySelector('#t-inline input').value,
    n: [...document.querySelectorAll('#t-inline [role="option"]')].filter((el) => !el.hidden).length,
    seps: [...document.querySelectorAll('#t-inline .nv-panel-sep')].filter((el) => !el.hidden).length,
  }));
  assert.equal(cleared.value, '', '内嵌版 Esc 清空');
  assert.equal(cleared.n, 5, '清空后全部显示');
  assert.equal(cleared.seps, 2, '分隔线恢复');

  // 键盘跳过禁用项，点击派发事件
  await page.keyboard.press('End');
  assert.equal(await page.evaluate(() => document.querySelector('#t-inline [data-active]').dataset.value), 'tail', 'End 到最后一项');
  await page.keyboard.press('ArrowUp');
  assert.equal(await page.evaluate(() => document.querySelector('#t-inline [data-active]').dataset.value), 'rename', '↑ 跳过禁用项');
  await page.click('#t-inline [data-value="upload"]');
  await page.click('#t-inline [data-value="off"]');
  assert.equal(await page.evaluate(() => window.__inline.join(',')), 'rename,upload', '点击派发 nv:select，禁用项不派发');
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#t-inline input')), true, '点击选项后焦点仍在输入框');

  await page.evaluate(() => Nova.get('#t-inline', 'command').filter('qqqq'));
  const inEmpty = await page.evaluate(() => {
    const e = document.querySelector('#t-inline .nv-command-empty');
    return { shown: !e.hidden, text: e.textContent, list: document.querySelector('#t-inline .nv-command-list').hidden };
  });
  assert(inEmpty.shown && inEmpty.list, '内嵌版空状态');
  assert.equal(inEmpty.text, '无匹配', 'data-empty-text 覆盖');

  // refresh：动态新增选项
  const refreshed = await page.evaluate(() => {
    const root = document.getElementById('t-inline');
    Nova.get(root, 'command').filter('');
    root.querySelector('.nv-command-list').append(Object.assign(document.createElement('div'), { className: 'nv-item', textContent: '动态项' }));
    root.querySelector('.nv-command-list').lastChild.dataset.value = 'dyn';
    Nova.command.refresh(root);
    Nova.get(root, 'command').filter('动态');
    return [...root.querySelectorAll('[role="option"]')].filter((el) => !el.hidden).map((el) => el.dataset.value).join(',');
  });
  assert.equal(refreshed, 'dyn', 'refresh 后新选项可搜索');

  // 评分工具
  const util = await page.evaluate(() => ({
    exact: Nova.command.match('grep', 'Grep').score,
    none: Nova.command.match('xyz', 'Grep'),
    camel: Nova.command.match('tp', 'togglePanel').positions.join(','),
  }));
  assert.equal(util.exact, 1000, '完全一致 1000 分');
  assert.equal(util.none, null, '不匹配返回 null');
  assert.equal(util.camel, '0,6', '驼峰词首');
};
