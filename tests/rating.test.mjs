// Rating：整星点击（整颗星都能点）、半星左右半边、悬停预览、方向键、可清空、只读、显示分数、实例
export default async ({ page, assert, sleep }) => {
  const star = (sel, i) => page.$eval(sel, (el, i) => {
    const it = el.querySelectorAll('.nv-rating-item')[i];
    it.scrollIntoView({ block: 'center' });
    const r = it.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, i);
  const fills = (sel) => page.$eval(sel, (el) => [...el.querySelectorAll('.nv-rating-item')].map((it) => getComputedStyle(it, '::after').clipPath));
  const val = (sel) => page.$eval(sel, (el) => Nova.get(el, 'rating').value);

  // —— 结构 —— //
  const init = await page.$eval('#rt-basic', (el) => ({
    role: el.getAttribute('role'),
    radios: el.querySelectorAll('input[type="radio"]').length,
    name: el.querySelector('input').name,
    label: el.querySelector('input').getAttribute('aria-label'),
  }));
  assert.equal(init.role, 'radiogroup', 'role=radiogroup');
  assert.equal(init.radios, 5, '整星模式每颗星一个 radio');
  assert.equal(init.name, 'score', 'name 来自 data-name');
  assert.equal(init.label, '1 星', 'radio 的 aria-label');

  // —— 整星：点星星右侧、左侧都能选中 —— //
  let s = await star('#rt-basic', 2);
  await page.mouse.click(s.x + s.w * 0.85, s.y + s.h / 2);
  await sleep(50);
  assert.equal(await val('#rt-basic'), 3, '点第 3 颗星右侧 = 3');
  assert.equal(await page.$eval('#rt-log', (el) => el.textContent), 'value = 3', '派发 nv:change');
  s = await star('#rt-basic', 3);
  await page.mouse.click(s.x + s.w * 0.15, s.y + s.h / 2);
  await sleep(50);
  assert.equal(await val('#rt-basic'), 4, '点第 4 颗星左侧也 = 4（整星模式不分半边）');
  await page.mouse.move(5, 5);
  await sleep(400);
  const f = await fills('#rt-basic');
  assert(f[3].includes('inset(0px)') || f[3] === 'inset(0px 0% 0px 0px)' || /inset\(0(px)? 0(%|px)? 0(px)? 0(px)?\)/.test(f[3]), `第 4 颗满填充（${f[3]}）`);
  assert(f[4].includes('100%'), `第 5 颗不填充（${f[4]}）`);

  // —— 再点当前值不清空（未开 clearable） —— //
  await page.mouse.click(s.x + s.w * 0.5, s.y + s.h / 2);
  assert.equal(await val('#rt-basic'), 4, '未开 clearable 时再点不清空');

  // —— 悬停预览 —— //
  s = await star('#rt-basic', 1);
  await page.mouse.move(s.x + s.w / 2, s.y + s.h / 2);
  await sleep(50);
  const prev = await page.$eval('#rt-basic', (el) => ({ cls: el.classList.contains('is-preview'), hover: [...el.querySelectorAll('.nv-rating-item')].findIndex((x) => x.hasAttribute('data-hover')) }));
  assert(prev.cls && prev.hover === 1, '悬停第 2 颗时预览');
  await page.mouse.move(5, 5);
  await sleep(50);
  assert(!(await page.$eval('#rt-basic', (el) => el.classList.contains('is-preview'))), '移出后取消预览');

  // —— 方向键 —— //
  await page.focus('#rt-basic input:checked');
  await page.keyboard.press('ArrowLeft');
  await sleep(50);
  assert.equal(await val('#rt-basic'), 3, '← 减一');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await sleep(50);
  assert.equal(await val('#rt-basic'), 5, '→ 加一');

  // —— 半星 —— //
  const half = '[aria-label="半星评分"]';
  assert.equal(await val(half), 3.5, '初始 3.5');
  assert.equal(await page.$eval(half, (el) => el.querySelectorAll('input').length), 10, '半星模式每颗两个 radio');
  assert.equal(await page.$eval(half, (el) => el.querySelector('.nv-rating-value')?.textContent), '3.5', '显示分数');
  s = await star(half, 1);
  await page.mouse.click(s.x + s.w * 0.25, s.y + s.h / 2);
  await sleep(50);
  assert.equal(await val(half), 1.5, '点左半边 = x.5');
  await page.mouse.click(s.x + s.w * 0.75, s.y + s.h / 2);
  await sleep(50);
  assert.equal(await val(half), 2, '点右半边 = 整数');
  assert.equal(await page.$eval(half, (el) => el.querySelector('.nv-rating-value').textContent), '2', '分数同步');

  // —— 可清空 —— //
  const cl = '[aria-label="可清空"]';
  s = await star(cl, 1);
  await page.mouse.click(s.x + s.w / 2, s.y + s.h / 2);
  await sleep(50);
  assert.equal(await val(cl), 0, '再点当前值清空');
  assert.equal(await page.$eval(cl, (el) => el.querySelectorAll('input:checked').length), 0, '清空后没有选中的 radio');

  // —— 只读 —— //
  const ro = '[aria-label="只读"]';
  s = await star(ro, 0);
  await page.mouse.click(s.x + s.w / 2, s.y + s.h / 2);
  await sleep(50);
  assert.equal(await val(ro), 4.5, '只读不可改');

  // —— 十分制 —— //
  assert.equal(await page.$eval('[aria-label="十分制"]', (el) => el.querySelectorAll('.nv-rating-item').length), 10, 'data-max=10');

  // —— 表单提交 —— //
  const fd = await page.evaluate(() => {
    const form = document.createElement('form');
    document.querySelector('.doc-preview').append(form);
    form.append(document.getElementById('rt-basic'));
    return new FormData(form).get('score');
  });
  assert.equal(fd, '5', 'FormData 拿到分数');
};
