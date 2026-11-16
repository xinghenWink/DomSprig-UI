// Timeline（纯 CSS）：节点与连接线、pending 虚线与呼吸、时间栏对齐、左右交替及窄屏回到单侧
export default async ({ page, assert }) => {
  const r = await page.evaluate(() => {
    const tl = document.querySelector('.nv-timeline');
    const items = [...tl.querySelectorAll('.nv-timeline-item')];
    const line = (li) => getComputedStyle(li, '::after');
    const last = items[items.length - 1];
    const prev = items[items.length - 2];
    return {
      lines: items.slice(0, -1).map((li) => parseFloat(line(li).height) > 0 || parseFloat(getComputedStyle(li, '::before').height) > 8),
      pendingAnim: [...last.querySelectorAll('*'), last].some((x) => getComputedStyle(x).animationName !== 'none' || getComputedStyle(x, '::before').animationName !== 'none' || getComputedStyle(x, '::after').animationName !== 'none'),
      dashed: [prev, last].some((li) => [getComputedStyle(li, '::after'), getComputedStyle(li, '::before')].some((s) => s.borderLeftStyle === 'dashed' || s.backgroundImage.includes('repeating'))),
    };
  });
  assert(r.lines.every(Boolean), '节点之间有连接线');
  assert(r.pendingAnim, 'pending 节点有呼吸动画');
  assert(r.dashed, 'pending 前的连接线变虚线');

  const time = await page.evaluate(() => {
    const tl = document.querySelector('.nv-timeline[data-time="left"]');
    const ts = [...tl.querySelectorAll(':scope > li > .nv-timeline-time')].map((t) => Math.round(t.getBoundingClientRect().right));
    return new Set(ts).size === 1;
  });
  assert(time, '时间栏右对齐成一列');

  const alt = await page.evaluate(() => {
    const tl = document.querySelector('.nv-timeline[data-align="alternate"]');
    const cs = [...tl.querySelectorAll('.nv-timeline-content')].map((c) => Math.round(c.getBoundingClientRect().left));
    return { sides: new Set(cs).size };
  });
  assert(alt.sides >= 2, '左右交替');
  await page.setViewport({ width: 390, height: 860 });
  const narrow = await page.evaluate(() => {
    const tl = document.querySelector('.nv-timeline[data-align="alternate"]');
    const cs = [...tl.querySelectorAll('.nv-timeline-content')].map((c) => Math.round(c.getBoundingClientRect().left));
    return { sides: new Set(cs).size, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
  assert.equal(narrow.sides, 1, '窄屏回到单侧');
  assert(!narrow.overflow, '窄屏不溢出');
};
