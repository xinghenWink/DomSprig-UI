// Confetti：点击按钮生成画布、结束后移除、Promise resolve、reset 立即清空、减少动态不播放
export default async ({ page, assert, sleep }) => {
  await page.click('button[data-confetti]');
  await sleep(150);
  const c = await page.evaluate(() => {
    const cv = document.querySelector('canvas');
    return cv ? { pe: getComputedStyle(cv).pointerEvents, pos: getComputedStyle(cv).position } : null;
  });
  assert(c, '生成画布');
  assert.equal(c.pe, 'none', '画布不拦截点击');
  assert.equal(c.pos, 'fixed', '画布固定定位');
  const t = await page.evaluate(async () => {
    const t0 = performance.now();
    await Nova.confetti({ particleCount: 30, velocity: 20 });
    return performance.now() - t0;
  });
  assert(t < 9000, `Promise 在粒子落完后 resolve（${Math.round(t)}ms）`);
  await sleep(300);
  assert(!(await page.$('canvas')), '结束后移除画布');
  await page.evaluate(() => { Nova.confetti({ particleCount: 200 }); });
  await sleep(100);
  await page.click('#cf-reset');
  await sleep(50);
  assert(!(await page.$('canvas')), 'reset 立即清空');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const rm = await page.evaluate(async () => { await Nova.confetti(); return !!document.querySelector('canvas'); });
  assert(!rm, '减少动态时不播放');
};
