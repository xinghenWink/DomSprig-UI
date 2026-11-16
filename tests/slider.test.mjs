// Slider：单值填充 / 刻度 / 气泡，范围拇指键盘、拖动、不交叉、隐藏 input、禁用
export const components = ['field', 'checkbox', 'slider'];

export default async ({ page, assert, sleep }) => {
  // —— 单值 ——
  const single = await page.$eval('#slider-marks', (el) => ({
    wrapped: el.parentElement.classList.contains('nv-slider-body'),
    marks: el.closest('.nv-slider-box').querySelectorAll('.nv-slider-mark').length,
    labels: el.closest('.nv-slider-box').querySelectorAll('.nv-slider-label').length,
    p: el.style.getPropertyValue('--_p'),
  }));
  assert(single.wrapped, '单值被包进 .nv-slider-body');
  assert.equal(single.marks, 5, '5 个刻度点');
  assert.equal(single.labels, 5, '5 个刻度标签');
  assert.equal(single.p, '0.5', '初始填充 0.5');

  await page.focus('#slider-marks');
  await page.keyboard.press('ArrowRight');
  const after = await page.$eval('#slider-marks', (el) => {
    const box = el.closest('.nv-slider-box');
    return {
      v: el.value,
      b: box.querySelector('.nv-slider-fill').style.getPropertyValue('--_b'),
      bubble: box.querySelector('.nv-slider-bubble').textContent,
      active: box.querySelectorAll('.nv-slider-mark[data-active]').length,
      shown: getComputedStyle(box.querySelector('.nv-slider-bubble')).opacity,
    };
  });
  assert.equal(after.v, '75', '方向键步进到 75');
  assert.equal(after.b, '0.75', '填充同步');
  assert.equal(after.bubble, '75', '气泡文字同步');
  assert.equal(after.active, 4, '填充下方的刻度高亮');
  await sleep(250);
  assert.equal(await page.$eval('#slider-marks', (el) => getComputedStyle(el.closest('.nv-slider-box').querySelector('.nv-slider-bubble')).opacity), '1', '聚焦时显示气泡');

  // —— 范围：初始状态与 ARIA ——
  const T = '#slider-price .nv-slider-thumb';
  const aria = await page.$$eval(T, (ts) => ts.map((t) => [t.getAttribute('role'), t.getAttribute('aria-valuenow'), t.getAttribute('aria-valuemin'), t.getAttribute('aria-valuemax'), t.getAttribute('aria-valuetext')]));
  assert.equal(JSON.stringify(aria), JSON.stringify([['slider', '200', '0', '800', '¥200'], ['slider', '800', '200', '1000', '¥800']]), '拇指 ARIA');
  assert.equal(await page.$eval('#slider-price [name=price]', (el) => el.value), '200,800', '隐藏 input 初始值');
  assert(await page.$eval('#slider-price', (el) => el.getAttribute('role') === 'group' && el.hasAttribute('aria-labelledby')), '范围容器被字段标签关联');

  // 键盘
  const now = () => page.$$eval(T, (ts) => ts.map((t) => Number(t.getAttribute('aria-valuenow'))));
  await page.$eval(T, (t) => t.focus());
  await page.keyboard.press('ArrowRight');
  assert.equal((await now())[0], 210, 'ArrowRight +step');
  await page.keyboard.down('Shift');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.up('Shift');
  assert.equal((await now())[0], 310, 'Shift ×10');
  await page.keyboard.press('PageUp');
  assert.equal((await now())[0], 410, 'PageUp +10%');
  await page.keyboard.press('End');
  assert.equal(JSON.stringify(await now()), '[800,800]', 'End 不越过另一个拇指');
  await page.keyboard.press('ArrowRight');
  assert.equal((await now())[0], 800, '相遇后不能交叉');
  await page.keyboard.press('Home');
  assert.equal((await now())[0], 0, 'Home 到最小值');
  assert(/nv:change → \[0,800\]/.test(await page.$eval('#slider-price-log', (el) => el.textContent)), 'nv:change 携带数组');
  assert(/price=0%2C800/.test(await page.$eval('#slider-price-log', (el) => el.textContent)), '表单值同步');

  // 拇指位置与数值一致（中心点）
  const pos = await page.$eval('#slider-price', (el) => {
    const body = el.querySelector('.nv-slider-body').getBoundingClientRect();
    const t = el.querySelectorAll('.nv-slider-thumb')[1].getBoundingClientRect();
    const tw = t.width;
    return { cx: t.left + tw / 2, expect: body.left + tw / 2 + (body.width - tw) * 0.8 };
  });
  assert(Math.abs(pos.cx - pos.expect) < 1.5, `拇指位置正确（${pos.cx.toFixed(1)} vs ${pos.expect.toFixed(1)}）`);

  // 拖动：在轨道 50% 处按下 → 最近的拇指（右侧 800 更近）移到 500，再拖到 90%
  await page.$eval('#slider-price', (el) => el.scrollIntoView({ block: 'center' }));
  const box = await page.$eval('#slider-price .nv-slider-body', (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top + r.height / 2, w: r.width }; });
  const tw = await page.$eval(T, (el) => el.offsetWidth);
  const at = (p) => box.x + tw / 2 + (box.w - tw) * p;
  await page.mouse.move(at(0.5), box.y);
  await page.mouse.down();
  assert.equal(JSON.stringify(await now()), '[0,500]', '点击轨道移动最近的拇指');
  assert(await page.$eval('#slider-price .nv-slider-body', (el) => el.hasAttribute('data-dragging')), '拖动中标记');
  await page.mouse.move(at(0.9), box.y, { steps: 5 });
  await page.mouse.up();
  assert.equal(JSON.stringify(await now()), '[0,900]', '拖动到 900');
  assert(!(await page.$eval('#slider-price .nv-slider-body', (el) => el.hasAttribute('data-dragging'))), '松手清除标记');

  // —— 禁用 ——
  const L = '#slider-lock .nv-slider-thumb';
  const locked = await page.$$eval(L, (ts) => ts.map((t) => `${t.tabIndex}/${t.getAttribute('aria-disabled')}`));
  assert.equal(locked.join(' '), '-1/true -1/true', '禁用时拇指不可聚焦');
  await page.click('#slider-lock-toggle');
  await sleep(50);
  assert.equal(await page.$eval(L, (t) => t.tabIndex), 0, '解锁后可聚焦');
  await page.focus(L);
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.$eval(L, (t) => t.getAttribute('aria-valuenow')), '26', '解锁后可调整');

  // 实例 API
  const api = await page.evaluate(() => {
    const el = document.getElementById('slider-price');
    const inst = Nova.get(el, 'slider');
    inst.set([900, 100]);
    const v = inst.value.join(',');
    const s = Nova.get('#slider-marks', 'slider');
    s.set(25);
    return { v, hidden: el.querySelector('[name=price]').value, b: document.querySelector('#slider-marks').closest('.nv-slider-box').querySelector('.nv-slider-fill').style.getPropertyValue('--_b'), d: typeof inst.destroy };
  });
  assert.equal(api.v, '100,900', 'set 自动排序');
  assert.equal(api.hidden, '100,900', 'set 同步隐藏 input');
  assert.equal(api.b, '0.25', '单值 set 刷新填充');
  assert.equal(api.d, 'function', '实例含 destroy');
};
