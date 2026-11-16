// Alert：自动图标与 role、关闭按钮、可取消的 nv:close、收起动画后 hidden、show()、焦点去向
export const components = ['alert'];

export default async ({ page, assert, sleep }) => {
  // 自动增强：图标、role、关闭按钮文案
  const init = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const danger = q('.nv-alert[data-color="danger"]');
    const info = q('.nv-alert[data-color="info"]');
    const none = q('.nv-alert[data-icon="none"]');
    const custom = q('.nv-alert[data-close-label="关闭成功提示"] .nv-alert-close');
    return {
      dangerRole: danger.getAttribute('role'),
      infoRole: info.getAttribute('role'),
      warnRole: q('.nv-alert[data-color="warning"]').getAttribute('role'),
      icon: !!info.querySelector(':scope > svg.nv-alert-icon'),
      noIcon: !none.querySelector('.nv-alert-icon'),
      closeLabel: custom && custom.getAttribute('aria-label'),
      defaultLabel: q('#alert-closable .nv-alert .nv-alert-close').getAttribute('aria-label'),
    };
  });
  assert.equal(init.dangerRole, 'alert', 'danger → role=alert');
  assert.equal(init.warnRole, 'alert', 'warning → role=alert');
  assert.equal(init.infoRole, 'status', 'info → role=status');
  assert(init.icon, '按颜色插入默认图标');
  assert(init.noIcon, 'data-icon="none" 不插入图标');
  assert.equal(init.closeLabel, '关闭成功提示', 'data-close-label 覆盖关闭文案');
  assert.equal(init.defaultLabel, '关闭', '默认关闭文案');

  // 点击关闭：派发 nv:close → 动画 → hidden → nv:closed
  await page.evaluate(() => {
    window.__ev = [];
    const el = document.querySelector('#alert-closable .nv-alert');
    el.addEventListener('nv:close', () => window.__ev.push('close'));
    el.addEventListener('nv:closed', () => window.__ev.push('closed'));
  });
  await page.click('#alert-closable .nv-alert .nv-alert-close');
  const mid = await page.evaluate(() => {
    const el = document.querySelector('#alert-closable .nv-alert');
    return { hidden: el.hidden, state: el.dataset.state, ev: window.__ev.join() };
  });
  assert.equal(mid.hidden, false, '动画进行中仍可见');
  assert.equal(mid.state, 'closing', '动画中 data-state=closing');
  assert.equal(mid.ev, 'close', '先派发 nv:close');
  await sleep(450);
  const after = await page.evaluate(() => {
    const el = document.querySelector('#alert-closable .nv-alert');
    return { hidden: el.hidden, style: el.getAttribute('style') || '', ev: window.__ev.join(), log: document.getElementById('alert-log').textContent };
  });
  assert.equal(after.hidden, true, '动画结束后 hidden');
  assert.equal(after.style, '', '清理内联样式');
  assert.equal(after.ev, 'close,closed', '派发 nv:closed');
  assert(after.log.includes('欢迎使用'), '示例日志更新');

  // nv:close 被 preventDefault 时不关闭；第二次确认后关闭
  await page.click('#alert-confirm .nv-alert-close');
  await sleep(400);
  const cancelled = await page.evaluate(() => ({ hidden: document.getElementById('alert-confirm').hidden, state: document.getElementById('alert-confirm').dataset.state }));
  assert.equal(cancelled.hidden, false, '取消后不关闭');
  assert.equal(cancelled.state, undefined, '取消后无 closing 状态');

  // 键盘：Tab 聚焦关闭按钮，Enter 关闭，焦点移到下一个可聚焦元素
  await page.focus('#alert-confirm .nv-alert-close');
  await page.keyboard.press('Enter');
  await sleep(450);
  const kb = await page.evaluate(() => ({ hidden: document.getElementById('alert-confirm').hidden, focus: document.activeElement.id }));
  assert.equal(kb.hidden, true, 'Enter 关闭');
  assert.equal(kb.focus, 'alert-reset', '关闭后焦点移到下一个可聚焦元素');

  // show()：重新显示
  await page.click('#alert-reset');
  await sleep(450);
  const shown = await page.evaluate(() => [...document.querySelectorAll('#alert-closable .nv-alert')].map((el) => el.hidden));
  assert.equal(shown.join(), 'false,false,false', 'show() 重新显示全部');

  // 命令式 API 与可取消
  const api = await page.evaluate(() => {
    const el = document.querySelector('#alert-closable .nv-alert[data-color="success"]');
    const stop = (e) => e.preventDefault();
    el.addEventListener('nv:close', stop);
    const r1 = Nova.alert.close(el);
    el.removeEventListener('nv:close', stop);
    const r2 = Nova.alert.close(el);
    const r3 = Nova.alert.close(el); // 动画中重复调用无效
    return [r1, r2, r3];
  });
  assert.equal(api.join(), 'false,true,false', 'close() 返回值与可取消');

  // 减少动态时立即关闭；动态插入的提示自动增强
  const dyn = await page.evaluate(async () => {
    const el = Nova.h('div', { class: 'nv-alert', 'data-color': 'warning', 'data-closable': '' }, Nova.h('div', { class: 'nv-alert-desc', text: '<b>x</b>' }));
    document.body.append(el);
    await new Promise((r) => setTimeout(r, 30));
    const enhanced = !!el.querySelector('.nv-alert-close') && el.getAttribute('role') === 'alert';
    const mm = window.matchMedia;
    window.matchMedia = (q) => (q.includes('reduce') ? { matches: true } : mm.call(window, q));
    Nova.alert.close(el);
    window.matchMedia = mm;
    return { enhanced, hidden: el.hidden, text: el.querySelector('.nv-alert-desc').innerHTML };
  });
  assert(dyn.enhanced, '动态插入自动增强');
  assert.equal(dyn.hidden, true, '减少动态时立即关闭');
  assert.equal(dyn.text, '&lt;b&gt;x&lt;/b&gt;', '文本未被当作 HTML');

  // 表单错误汇总示例
  await page.click('#alert-form-submit');
  await sleep(60);
  const form = await page.evaluate(() => {
    const a = document.querySelector('#alert-form-slot .nv-alert');
    return { role: a.getAttribute('role'), items: a.querySelectorAll('li').length, close: !!a.querySelector('.nv-alert-close') };
  });
  assert.equal(form.role, 'alert', '错误汇总 role=alert');
  assert.equal(form.items, 2, '列出两个问题');
  assert(form.close, '动态提示有关闭按钮');
};
