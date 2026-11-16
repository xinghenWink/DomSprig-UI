// Card：选择卡片（radio）、禁用项、键盘、整卡可点链接、横向布局封面不溢出、四种外观
export default async ({ page, assert, sleep }) => {
  const plan = () => page.$eval('#cd-plan', (f) => new FormData(f).get('plan'));
  assert.equal(await plan(), 'pro', '初始选中专业版');
  const cards = await page.$$('#cd-plan label.nv-card');
  await cards[2].click();
  await sleep(50);
  assert.equal(await plan(), 'team', '点击卡片选中');
  assert.equal(await page.$eval('#cd-plan-log', (el) => el.textContent), 'plan = team', '示例日志');
  const sel = await page.$eval('#cd-plan', (f) => {
    const l = [...f.querySelectorAll('label.nv-card')];
    return l.map((x) => getComputedStyle(x).borderColor);
  });
  assert(sel[2] !== sel[0], '选中卡片边框高亮');
  await cards[3].click();
  await sleep(50);
  assert.equal(await plan(), 'team', '禁用卡片不可选');
  await page.focus('#cd-plan input:checked');
  await page.keyboard.press('ArrowLeft');
  await sleep(50);
  assert.equal(await plan(), 'pro', '方向键切换');
  const ring = await page.$eval('#cd-plan input:checked', (i) => {
    const s = getComputedStyle(i.closest('label'));
    return s.outlineStyle !== 'none' || s.boxShadow.includes('px');
  });
  assert(ring, '键盘焦点可见');

  // 整卡可点链接
  const link = await page.$eval('[data-card-link]', (a) => {
    const card = a.closest('.nv-card');
    card.scrollIntoView({ block: 'center' });
    const r = card.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 20);
    return { covers: hit === a || a.contains(hit), pos: getComputedStyle(card).position };
  });
  assert(link.covers, 'data-card-link 覆盖整张卡片');

  // 横向布局：封面不溢出卡片
  const hz = await page.$eval('.nv-card[data-orientation="horizontal"]', (c) => {
    const r = c.getBoundingClientRect();
    const m = c.querySelector('.nv-card-media').getBoundingClientRect();
    return { top: Math.round(m.top - r.top), left: Math.round(m.left - r.left), bottom: Math.round(r.bottom - m.bottom) };
  });
  assert(hz.top >= 0 && hz.left >= 0 && hz.bottom >= 0 && hz.top <= 1 && hz.left <= 1, `横向封面贴边且不溢出（${JSON.stringify(hz)}）`);

  // 纵向封面贴边（负 margin）
  const vt = await page.$eval('.nv-card > .nv-card-media:not([data-inset])', (m) => {
    const c = m.closest('.nv-card').getBoundingClientRect();
    const r = m.getBoundingClientRect();
    return { top: Math.round(r.top - c.top), left: Math.round(r.left - c.left), right: Math.round(c.right - r.right) };
  });
  assert(vt.top <= 1 && vt.left <= 1 && vt.right <= 1, `纵向封面贴边（${JSON.stringify(vt)}）`);
};
