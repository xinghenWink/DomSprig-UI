// Tooltip：延迟、跳过延迟、各种隐藏时机、键盘聚焦、ARIA、翻转与箭头、单例、安全
export default async ({ page, assert, sleep }) => {
  // 准备固定位置的测试目标，避免依赖文档示例布局
  await page.evaluate(() => {
    const mk = (id, attrs, style) => {
      const b = Nova.h('button', { id, type: 'button', ...attrs, style: { position: 'fixed', width: '80px', height: '32px', ...style } }, id);
      document.body.append(b);
      return b;
    };
    mk('t-a', { 'data-tip': '提示 A', 'aria-describedby': 'keep-me' }, { left: '300px', top: '300px' });
    mk('t-b', { 'data-tip': '提示 B', 'data-tip-title': '标题 B' }, { left: '400px', top: '300px' });
    mk('t-top', { 'data-tip': '贴顶部，应翻到下方' }, { left: '600px', top: '2px' });
    mk('t-left', { 'data-tip': '贴左边，应翻到右侧', 'data-tip-placement': 'left' }, { left: '2px', top: '500px' });
    mk('t-zero', { 'data-tip': '立即', 'data-tip-delay': '0' }, { left: '700px', top: '300px' });
    mk('t-xss', { 'data-tip': '<img src=x onerror="window.__xss=1">' }, { left: '800px', top: '300px' });
    const long = Nova.h('span', { id: 't-trunc', class: 'nv-tip-truncate', tabindex: '0', 'data-tip-overflow': '', style: { position: 'fixed', left: '300px', top: '420px', width: '120px' } },
      '一段很长很长很长很长很长很长的文件名称.pdf');
    const short = Nova.h('span', { id: 't-short', class: 'nv-tip-truncate', tabindex: '0', 'data-tip-overflow': '', style: { position: 'fixed', left: '300px', top: '460px', width: '200px' } }, '短文本');
    document.body.append(long, short);
  });
  const state = () => page.evaluate(() => {
    const n = document.getElementById('nv-tooltip');
    return n ? { hidden: n.hidden, state: n.dataset.state, text: n.textContent, side: n.dataset.side, count: document.querySelectorAll('.nv-tooltip').length } : null;
  });
  const center = (id) => page.evaluate((i) => { const r = document.getElementById(i).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
  const hoverId = async (id) => { const c = await center(id); await page.mouse.move(c.x, c.y); };
  const visibleNow = async () => { const s = await state(); return !!s && !s.hidden && s.state === 'open'; };

  // 1. 默认 300ms 延迟
  await hoverId('t-a');
  await sleep(150);
  assert(!(await visibleNow()), '150ms 时还不应显示');
  await sleep(250);
  let s = await state();
  assert(await visibleNow(), '300ms 后显示');
  assert.equal(s.text, '提示 A', '内容来自 data-tip');
  const aria = await page.evaluate(() => ({
    role: document.getElementById('nv-tooltip').getAttribute('role'),
    ignore: document.getElementById('nv-tooltip').hasAttribute('data-nv-layer-ignore'),
    pe: getComputedStyle(document.getElementById('nv-tooltip')).pointerEvents,
    desc: document.getElementById('t-a').getAttribute('aria-describedby'),
  }));
  assert.equal(aria.role, 'tooltip', 'role=tooltip');
  assert(aria.ignore, '提示节点带 data-nv-layer-ignore');
  assert.equal(aria.pe, 'none', 'pointer-events:none');
  assert.equal(aria.desc, 'keep-me nv-tooltip', '追加 aria-describedby 并保留原值');

  // 箭头指向锚点中心
  const arrow = await page.evaluate(() => {
    const n = document.getElementById('nv-tooltip');
    const r = n.getBoundingClientRect();
    const a = document.getElementById('t-a').getBoundingClientRect();
    return { arrowX: r.left + parseFloat(n.style.getPropertyValue('--nv-arrow-x')), cx: a.left + a.width / 2, side: n.dataset.side, below: r.bottom <= a.top };
  });
  assert.equal(arrow.side, 'top', '默认在上方');
  assert(arrow.below, '提示在元素上方');
  assert(Math.abs(arrow.arrowX - arrow.cx) < 1.5, `箭头指向中心（${arrow.arrowX} vs ${arrow.cx}）`);

  // 2. 跳过延迟：直接移到相邻目标立即显示，且全页只有一个节点
  await hoverId('t-b');
  await sleep(40);
  s = await state();
  assert(await visibleNow(), '跳过延迟：立即显示');
  assert.equal(s.text, '标题 B提示 B', '标题 + 描述');
  assert.equal(s.count, 1, '全页只有一个提示节点');
  assert.equal(await page.evaluate(() => document.getElementById('t-a').getAttribute('aria-describedby')), 'keep-me', '离开后恢复原 aria-describedby');
  assert(await page.evaluate(() => !!document.querySelector('#nv-tooltip .nv-tooltip-title')), '标题节点');

  // 3. 移出立即隐藏
  await page.mouse.move(1000, 700);
  await sleep(20);
  s = await state();
  assert.equal(s.state, 'closed', '移出后进入关闭');
  assert.equal(await page.evaluate(() => document.getElementById('t-b').hasAttribute('aria-describedby')), false, '移出后移除 aria-describedby');
  await sleep(250);
  assert((await state()).hidden, '退场后隐藏');

  // 4. 超过 500ms 后重新计时
  await sleep(400);
  await hoverId('t-a');
  await sleep(120);
  assert(!(await visibleNow()), '超出免延迟窗口后恢复延迟');
  await sleep(300);
  assert(await visibleNow(), '再次延迟后显示');

  // 5. Esc：只关提示，不连带关闭下层浮层
  await page.evaluate(() => {
    window.__dismissed = 0;
    window.__pop = Nova.layer.push({ el: document.createElement('div'), onDismiss: () => { window.__dismissed++; } });
  });
  await page.keyboard.press('Escape');
  await sleep(20);
  assert.equal((await state()).state, 'closed', 'Esc 隐藏提示');
  assert.equal(await page.evaluate(() => window.__dismissed), 0, '提示可见时 Esc 不传给浮层栈');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.__dismissed), 1, '第二次 Esc 才关闭下层浮层');
  await page.evaluate(() => window.__pop());

  // 6. 按下鼠标立即隐藏，且在离开前不再显示
  await page.mouse.move(1000, 700);
  await sleep(600);
  await hoverId('t-zero');
  await sleep(30);
  assert(await visibleNow(), 'data-tip-delay=0 立即显示');
  await page.mouse.down();
  await sleep(20);
  assert.equal((await state()).state, 'closed', '按下时隐藏');
  await page.mouse.up();
  const zc = await center('t-zero');
  await page.mouse.move(zc.x + 5, zc.y + 3);
  await sleep(100);
  assert(!(await visibleNow()), '点击后在元素内移动不再显示');

  // 7. 滚动立即隐藏
  await page.mouse.move(1000, 700);
  await sleep(600);
  await page.evaluate(() => Nova.tooltip.show('#t-a'));
  assert(await visibleNow(), 'Nova.tooltip.show 立即显示');
  await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
  await sleep(20);
  assert.equal((await state()).state, 'closed', '滚动时隐藏');
  // 缩放
  await page.evaluate(() => Nova.tooltip.show('#t-a'));
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await sleep(20);
  assert.equal((await state()).state, 'closed', '缩放时隐藏');

  // 8. 键盘聚焦触发，失焦隐藏
  await sleep(600);
  await page.evaluate(() => document.getElementById('t-b').focus());
  await sleep(150);
  assert(!(await visibleNow()), '聚焦同样有延迟');
  await sleep(250);
  assert(await visibleNow(), '键盘聚焦后显示');
  assert(await page.evaluate(() => document.getElementById('t-b').getAttribute('aria-describedby') === 'nv-tooltip'), '聚焦时关联描述');
  await page.evaluate(() => document.getElementById('t-b').blur());
  await sleep(20);
  assert.equal((await state()).state, 'closed', '失焦隐藏');

  // 9. 翻转：贴顶部 → 下方；贴左边 → 右侧
  await sleep(600);
  await page.evaluate(() => Nova.tooltip.show('#t-top'));
  s = await state();
  assert.equal(s.side, 'bottom', `贴顶部时翻到下方（${s.side}）`);
  await page.evaluate(() => Nova.tooltip.show('#t-left'));
  s = await state();
  assert.equal(s.side, 'right', `贴左边时翻到右侧（${s.side}）`);
  const inView = await page.evaluate(() => { const r = document.getElementById('nv-tooltip').getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth; });
  assert(inView, '提示在视口内');
  await page.evaluate(() => Nova.tooltip.hide());

  // 10. data-tip-overflow：只在截断时显示
  await sleep(600);
  await page.evaluate(() => Nova.tooltip.show('#t-short'));
  assert(!(await visibleNow()), '未截断时不显示');
  await page.evaluate(() => Nova.tooltip.show('#t-trunc'));
  s = await state();
  assert(await visibleNow(), '截断时显示');
  assert.equal(s.text, '一段很长很长很长很长很长很长的文件名称.pdf', '内容取完整原文');
  await page.evaluate(() => Nova.tooltip.hide());

  // 11. 安全：data-tip 按纯文本渲染
  await page.evaluate(() => Nova.tooltip.show('#t-xss'));
  const xss = await page.evaluate(() => ({ img: !!document.querySelector('#nv-tooltip img'), flag: window.__xss }));
  assert(!xss.img && !xss.flag, '不解析 HTML');

  // 12. 目标被移除时自动隐藏
  await page.evaluate(() => document.getElementById('t-xss').remove());
  await sleep(50);
  assert.equal((await state()).state, 'closed', '目标移除后隐藏');

  // 13. 辅助类：.nv-tip-icon 自动填充图标
  assert(await page.evaluate(() => !!document.querySelector('.nv-tip-icon svg')), 'nv-tip-icon 填充图标');
};
