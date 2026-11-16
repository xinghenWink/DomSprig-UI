// Number Ticker：进入视口后计数到终值、格式化（前后缀/小数/紧凑/不分组）、读屏只读终值、里程表、set() 与 nv:done
export default async ({ page, assert, sleep }) => {
  const final = () => page.$$eval('[data-nv-ticker]', (els) => els.map((el) => el.querySelector('.nv-sr-only')?.textContent));
  const shown = (i) => page.$$eval('[data-nv-ticker]', (els, i) => {
    const el = els[i];
    return el.querySelector('.nv-ticker-value')?.textContent;
  }, i);

  const sr = await final();
  assert.equal(sr[0], '¥128,930', '前缀 + 千分位');
  assert.equal(sr[1], '99.95%', '小数 + 后缀');
  assert(/^1,?260万$/.test(sr[2]), `紧凑写法（${sr[2]}）`);
  assert.equal(sr[3], '2026', '不分组');
  const hidden = await page.$$eval('[data-nv-ticker]', (els) => els.every((el) => [...el.children].filter((c) => !c.classList.contains('nv-sr-only')).every((c) => c.getAttribute('aria-hidden') === 'true')));
  assert(hidden, '动画层 aria-hidden');

  await page.$$eval('[data-nv-ticker]', (els) => els[0].scrollIntoView({ block: 'center' }));
  await sleep(2800);
  assert.equal(await shown(0), '¥128,930', '计数结束显示终值');
  assert.equal(await shown(1), '99.95%', '小数终值');
  assert.equal(await shown(3), '2026', '起点 1990 计到 2026');

  await page.$$eval('[data-nv-ticker]', (els) => els[4].scrollIntoView({ block: 'center' }));
  await sleep(2200);
  const odo = await page.$$eval('[data-nv-ticker]', (els) => {
    const el = els[4];
    const moved = [...el.querySelectorAll('*')].filter((c) => { const t = getComputedStyle(c).transform; return t && t !== 'none' && t !== 'matrix(1, 0, 0, 1, 0, 0)'; });
    return { sr: el.querySelector('.nv-sr-only').textContent, moved: moved.length };
  });
  assert.equal(odo.sr, '8,462 人在线', '里程表终值');
  assert(odo.moved >= 3, `里程表按位滚动（${odo.moved} 列有位移）`);

  const live = await page.evaluate(async () => {
    const el = document.getElementById('tk-live');
    el.scrollIntoView({ block: 'center' });
    await new Promise((r) => setTimeout(r, 1200));
    const done = new Promise((r) => el.addEventListener('nv:done', (e) => r(e.detail.value), { once: true }));
    Nova.ticker.set(el, 4100, { duration: 300 });
    const v = await Promise.race([done, new Promise((r) => setTimeout(() => r('timeout'), 2000))]);
    return { v, get: Nova.ticker.get(el), sr: el.querySelector('.nv-sr-only').textContent };
  });
  assert.equal(live.v, 4100, 'nv:done 带终值');
  assert.equal(live.get, 4100, 'Nova.ticker.get');
  assert.equal(live.sr, '$4,100', '读屏文字同步');
  await page.click('#tk-up');
  await sleep(1300);
  assert(Number(await page.evaluate(() => Nova.ticker.get(document.getElementById('tk-live')))) > 4100, '按钮增加数值');
};
