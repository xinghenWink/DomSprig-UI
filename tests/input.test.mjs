// Input：清除按钮、密码切换、字数统计、包装与销毁
export default async ({ page, assert }) => {
  // 独立 input 被包装，data-size 转移
  const wrap = await page.evaluate(() => {
    const el = document.getElementById('input-clear');
    return { box: el.parentElement.className, btn: !!el.parentElement.querySelector('.nv-input-clear:not([hidden])') };
  });
  assert(wrap.box.includes('nv-control'), '独立 input 被包进 .nv-control');
  assert(wrap.btn, '有值时显示清除按钮');

  // 点击清除：值清空、派发 input/change/nv:clear、焦点留在输入框
  const cleared = await page.evaluate(() => {
    const el = document.getElementById('input-clear');
    const got = [];
    ['input', 'change', 'nv:clear'].forEach((t) => el.addEventListener(t, () => got.push(t)));
    el.parentElement.querySelector('.nv-input-clear').click();
    return { value: el.value, got: got.join(','), focus: document.activeElement === el, hidden: el.parentElement.querySelector('.nv-input-clear').hidden };
  });
  assert.equal(cleared.value, '', '值被清空');
  assert.equal(cleared.got, 'input,change,nv:clear', '事件顺序');
  assert(cleared.focus, '清除后焦点在输入框');
  assert(cleared.hidden, '空值时隐藏清除按钮');

  // 键盘输入后清除按钮重新出现
  await page.type('#input-clear', 'abc');
  assert.equal(await page.$eval('#input-clear', (el) => el.parentElement.querySelector('.nv-input-clear').hidden), false, '输入后显示清除按钮');

  // 密码切换
  const pwd = await page.evaluate(() => {
    const el = document.getElementById('input-pwd');
    const btn = el.parentElement.querySelector('.nv-input-toggle');
    btn.click();
    const a = { type: el.type, pressed: btn.getAttribute('aria-pressed'), label: btn.getAttribute('aria-label') };
    btn.click();
    return { a, b: el.type };
  });
  assert.equal(pwd.a.type, 'text', '切换为明文');
  assert.equal(pwd.a.pressed, 'true', 'aria-pressed 同步');
  assert.equal(pwd.a.label, '隐藏密码', '文案切换');
  assert.equal(pwd.b, 'password', '再次点击恢复');

  // 字数统计
  await page.$eval('#input-title', (el) => { el.focus(); el.select(); });
  await page.keyboard.press('Backspace');
  await page.type('#input-title', '你好世界');
  assert.equal(await page.$eval('#input-title', (el) => el.parentElement.querySelector('.nv-input-count').textContent), '4/30', '字数统计');

  // 禁用/只读不显示清除按钮
  const guard = await page.evaluate(() => {
    const el = Nova.h('input', { class: 'nv-input', 'data-clearable': '', value: 'x', readonly: true });
    document.body.append(el);
    Nova.init(el.parentElement);
    const inst = Nova.get(el, 'input');
    const hidden = el.parentElement.querySelector('.nv-input-clear').hidden;
    inst.destroy();
    return { hidden, unwrapped: el.parentElement === document.body, btns: document.body.querySelectorAll(':scope > .nv-control').length };
  });
  assert(guard.hidden, '只读时不显示清除按钮');
  assert(guard.unwrapped, 'destroy 后解除包装');

  // Esc 清空（文档示例脚本）
  await page.type('#input-search', '订单');
  await page.keyboard.press('Escape');
  assert.equal(await page.$eval('#input-search', (el) => el.value), '', 'Nova.input.clear 生效');
};
