// Number Input：包装与 ARIA、按钮步进与边界禁用、长按连发、键盘、越界夹回、小数精度、precision、sides/none、禁用只读、实例
export default async ({ page, assert, sleep }) => {
  const v = (sel) => page.$eval(sel, (el) => el.value);
  const btn = (sel, dir) => page.$eval(sel, (el, dir) => {
    const box = el.closest('.nv-control');
    const b = [...box.querySelectorAll('.nv-number-btn')].find((x) => (dir > 0 ? /增|加|\+/ : /减|\-/).test(x.getAttribute('aria-label')));
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, disabled: b.disabled };
  }, dir);

  // —— 结构 —— //
  const init = await page.$eval('#ni-basic', (el) => ({
    wrapped: el.parentElement.classList.contains('nv-control'),
    btns: el.closest('.nv-control').querySelectorAll('.nv-number-btn').length,
    btnTab: [...el.closest('.nv-control').querySelectorAll('.nv-number-btn')].every((b) => b.tabIndex === -1),
  }));
  assert(init.wrapped, '包进 .nv-control');
  assert.equal(init.btns, 2, '两个步进按钮');
  assert(init.btnTab, '按钮不进 Tab 序列');

  // —— 按钮 —— //
  await page.evaluate(() => {
    window.__ev = [];
    const el = document.getElementById('ni-basic');
    ['input', 'change'].forEach((t) => el.addEventListener(t, () => window.__ev.push(`${t}:${el.value}`)));
    el.addEventListener('nv:change', (e) => window.__ev.push(`nv:${e.detail.value}`));
  });
  let b = await btn('#ni-basic', 1);
  await page.mouse.click(b.x, b.y);
  await sleep(50);
  assert.equal(await v('#ni-basic'), '6', '点 + 加一');
  const ev = await page.evaluate(() => window.__ev.join(','));
  assert(ev.includes('input:6') && ev.includes('change:6') && ev.includes('nv:6'), `派发 input/change/nv:change（${ev}）`);
  assert.equal(await page.$eval('#ni-log', (el) => el.textContent), 'value = 6', '示例日志');
  b = await btn('#ni-basic', -1);
  await page.mouse.click(b.x, b.y);
  await sleep(50);
  assert.equal(await v('#ni-basic'), '5', '点 - 减一');

  // —— 长按连发 —— //
  b = await btn('#ni-basic', 1);
  await page.mouse.move(b.x, b.y);
  await page.mouse.down();
  await sleep(900);
  await page.mouse.up();
  const held = Number(await v('#ni-basic'));
  assert(held >= 8, `按住连续步进（${held}）`);

  // —— 键盘 —— //
  await page.focus('#ni-basic');
  await page.keyboard.press('End');
  assert.equal(await v('#ni-basic'), '20', 'End 到 max');
  b = await btn('#ni-basic', 1);
  assert(b.disabled, '到 max 时 + 按钮禁用');
  await page.keyboard.press('ArrowUp');
  assert.equal(await v('#ni-basic'), '20', '不超过 max');
  await page.keyboard.press('PageDown');
  assert.equal(await v('#ni-basic'), '10', 'PageDown 减 10');
  await page.keyboard.down('Shift');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.up('Shift');
  assert.equal(await v('#ni-basic'), '0', 'Shift+↓ 减 10');
  assert((await btn('#ni-basic', -1)).disabled, '到 min 时 - 按钮禁用');
  await page.keyboard.press('ArrowUp');
  assert.equal(await v('#ni-basic'), '1', '↑ 加一');
  await page.keyboard.press('Home');
  assert.equal(await v('#ni-basic'), '0', 'Home 到 min');

  // —— 越界夹回（change 前） —— //
  await page.evaluate(() => {
    window.__chg = [];
    document.getElementById('ni-basic').addEventListener('change', (e) => window.__chg.push(e.target.value));
  });
  await page.$eval('#ni-basic', (el) => el.select());
  await page.keyboard.type('99');
  await page.keyboard.press('Tab');
  await sleep(50);
  assert.equal(await v('#ni-basic'), '20', '越界失焦后夹回 max');
  assert.equal(await page.evaluate(() => window.__chg.join(',')), '20', 'change 监听者拿到修正后的值');

  // —— 小数 —— //
  await page.focus('#ni-rate');
  await page.keyboard.press('ArrowUp');
  assert.equal(await v('#ni-rate'), '0.9', '0.85 + 0.05 = 0.9（无浮点误差）');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  assert.equal(await v('#ni-rate'), '1', '不超过 max=1');
  assert.equal(await v('#ni-price'), '19.90', 'data-precision 补齐两位');
  await page.focus('#ni-price');
  await page.keyboard.press('ArrowUp');
  assert.equal(await v('#ni-price'), '20.00', 'precision 下步进');
  await page.$eval('#ni-price', (el) => el.select());
  await page.keyboard.type('3.14159');
  await page.keyboard.press('Tab');
  assert.equal(await v('#ni-price'), '3.14', '失焦按精度四舍五入');

  // —— sides / none —— //
  const sides = await page.$eval('[aria-label="购买数量"]', (el) => {
    const box = el.closest('.nv-control');
    const kids = [...box.children];
    return { first: kids[0].classList.contains('nv-number-btn'), last: kids[kids.length - 1].classList.contains('nv-number-btn'), decDisabled: kids[0].disabled };
  });
  assert(sides.first && sides.last, 'sides：左减右加');
  assert(sides.decDisabled, 'sides：在 min 时减号禁用');
  const none = await page.$eval('[aria-label="间隔（分钟）"]', (el) => el.closest('.nv-control').querySelectorAll('.nv-number-btn').length);
  assert.equal(none, 0, 'none：不显示按钮');
  await page.focus('[aria-label="间隔（分钟）"]');
  await page.keyboard.press('ArrowUp');
  assert.equal(await v('[aria-label="间隔（分钟）"]'), '35', 'none：键盘仍按 step 步进');

  // —— 禁用 —— //
  const dis = await page.$eval('[aria-label="禁用"]', (el) => [...el.closest('.nv-control').querySelectorAll('.nv-number-btn')].every((b) => b.disabled));
  assert(dis, '禁用时按钮也禁用');

  // —— 初始越界值不被夹（显示错误态） —— //
  assert.equal(await v('[aria-label="超出范围"]'), '120', '初始值不被静默修改');

  // —— 尺寸 —— //
  const hs = await page.$$eval('.nv-number', (els) => els.map((el) => [el.dataset.size || 'md', Math.round(el.closest('.nv-control').getBoundingClientRect().height)]));
  const ok = hs.every(([s, h]) => h === { sm: 32, md: 38, lg: 44 }[s]);
  assert(ok, `高度与尺寸对应（${JSON.stringify(hs)}）`);

  // —— 实例 —— //
  const api = await page.$eval('#ni-basic', (el) => {
    const n = Nova.get(el, 'number-input');
    n.value = 3;
    n.stepUp(2);
    const a = el.value;
    n.stepDown(10);
    return { a, b: el.value };
  });
  assert.equal(api.a, '5', 'stepUp(2)');
  assert.equal(api.b, '0', 'stepDown 夹到 min');
};
