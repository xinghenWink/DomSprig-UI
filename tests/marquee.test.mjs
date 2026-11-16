// Marquee：生成 track/group、副本 aria-hidden + inert 且去掉 id、铺满容器、时长按速度换算、离开视口暂停、refresh
export default async ({ page, assert, sleep }) => {
  await sleep(300);
  const m = await page.$eval('.nv-marquee', (el) => {
    const groups = [...el.querySelectorAll('.nv-marquee-group')];
    const g = groups[0].getBoundingClientRect().width;
    const track = el.querySelector('.nv-marquee-track');
    return {
      groups: groups.length,
      clonesHidden: groups.slice(1).every((x) => x.getAttribute('aria-hidden') === 'true' && x.inert && !x.querySelector('[id]')),
      cover: groups.length * g >= el.getBoundingClientRect().width + g - 1,
      dur: parseFloat(getComputedStyle(track).animationDuration),
      expect: g / Number(el.dataset.speed || 40),
      anim: getComputedStyle(track).animationName,
    };
  });
  assert(m.groups >= 2, `至少两组（${m.groups}）`);
  assert(m.clonesHidden, '副本 aria-hidden + inert 且无 id');
  assert(m.cover, '副本数足够铺满容器');
  assert(m.anim !== 'none', '有滚动动画');
  assert(Math.abs(m.dur - m.expect) / m.expect < 0.15, `时长按速度换算（${m.dur.toFixed(2)}s vs ${m.expect.toFixed(2)}s）`);

  const paused = await page.evaluate(async () => {
    const el = document.querySelector('.nv-marquee');
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, 400));
    const off = el.hasAttribute('data-paused') || getComputedStyle(el.querySelector('.nv-marquee-track')).animationPlayState === 'paused';
    window.scrollTo(0, 0);
    el.scrollIntoView({ block: 'center' });
    await new Promise((r) => setTimeout(r, 400));
    return { off, on: getComputedStyle(el.querySelector('.nv-marquee-track')).animationPlayState };
  });
  assert(paused.off, '离开视口暂停');
  assert.equal(paused.on, 'running', '回到视口继续');

  const n = await page.evaluate(() => {
    const el = document.querySelector('.nv-marquee');
    el.querySelector('.nv-marquee-group').append(Object.assign(document.createElement('span'), { textContent: '新增项' }));
    Nova.get(el, 'marquee').refresh();
    return [...el.querySelectorAll('.nv-marquee-group')].every((x) => x.textContent.includes('新增项'));
  });
  assert(n, 'refresh 后副本同步');
};
