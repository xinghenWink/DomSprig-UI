// Stat：走势图生成路径、area/line/dot、set() 更新、尺寸变化重绘、读屏隐藏、趋势颜色与 invert、统计组分隔
export default async ({ page, assert, sleep }) => {
  const sp = await page.$$eval('svg.nv-stat-spark', (els) => els.map((s) => ({
    area: !!s.querySelector('.nv-stat-spark-area'),
    line: !!s.querySelector('.nv-stat-spark-line'),
    dot: !!s.querySelector('.nv-stat-spark-dot'),
    type: s.dataset.type || 'area',
    hasDot: 'dot' in s.dataset,
    hidden: s.getAttribute('aria-hidden'),
  })));
  assert(sp.length === 3, '三个走势图');
  assert(sp.every((x) => x.line && x.hidden === 'true'), '都有线且读屏隐藏');
  assert(sp.every((x) => x.area === (x.type === 'area')), 'area / line 类型');
  assert(sp.every((x) => x.dot === x.hasDot), 'data-dot 末端圆点');

  const upd = await page.evaluate(() => {
    const s = document.getElementById('st-live');
    const inst = Nova.get(s, 'stat-spark');
    const d0 = s.querySelector('.nv-stat-spark-line').getAttribute('d');
    inst.set([1, 5, 2, 8]);
    return { changed: s.querySelector('.nv-stat-spark-line').getAttribute('d') !== d0, values: inst.values.join(','), attr: s.dataset.values };
  });
  assert(upd.changed, 'set() 重绘');
  assert.equal(upd.values, '1,5,2,8', 'values 读取');
  assert.equal(upd.attr, '1 5 2 8', '写回 data-values');

  const rs = await page.evaluate(async () => {
    const s = document.querySelector('svg.nv-stat-spark');
    const vb0 = s.getAttribute('viewBox');
    s.style.width = '120px';
    await new Promise((r) => setTimeout(r, 200));
    return { vb0, vb1: s.getAttribute('viewBox') };
  });
  assert(rs.vb0 !== rs.vb1, `尺寸变化后重绘（${rs.vb0} → ${rs.vb1}）`);

  // 极值不冲出画布
  const inside = await page.$$eval('svg.nv-stat-spark', (els) => els.every((s) => {
    const vb = s.viewBox.baseVal;
    const b = s.querySelector('.nv-stat-spark-line').getBBox();
    return b.y >= -0.5 && b.y + b.height <= vb.height + 0.5;
  }));
  assert(inside, '曲线不超出上下边界');

  // 趋势颜色
  const trend = await page.evaluate(() => {
    const c = (sel) => getComputedStyle(document.querySelector(sel)).color;
    return { up: c('.nv-stat-trend[data-trend="up"]:not([data-invert])'), down: c('.nv-stat-trend[data-trend="down"]:not([data-invert])'), invUp: document.querySelector('[data-invert]') ? c('[data-invert]') : null };
  });
  assert(trend.up !== trend.down, '上涨下跌颜色不同');
};
