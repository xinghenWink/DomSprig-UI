// Button：加载态切换与阻止点击、水波纹生成与清理、尺寸高度与输入框对齐、仅图标按钮为正方形
export default async ({ page, assert, sleep }) => {
  // —— 加载态 —— //
  await page.evaluate(() => {
    window.__clicks = 0;
    document.getElementById('btn-demo-submit').addEventListener('click', () => window.__clicks++);
  });
  await page.click('#btn-demo-submit');
  await sleep(50);
  const loading = await page.$eval('#btn-demo-submit', (b) => ({
    on: b.hasAttribute('data-loading'),
    busy: b.getAttribute('aria-busy'),
    pe: getComputedStyle(b).pointerEvents,
  }));
  assert(loading.on, '点击后进入加载态');
  assert.equal(loading.busy, 'true', '同步 aria-busy');
  await page.click('#btn-demo-submit');
  assert.equal(await page.evaluate(() => window.__clicks), 1, '加载中不再响应点击');
  await sleep(1700);
  const done = await page.$eval('#btn-demo-submit', (b) => ({ on: b.hasAttribute('data-loading'), busy: b.getAttribute('aria-busy') }));
  assert(!done.on && done.busy === 'false', '结束后恢复');

  // —— 水波纹 —— //
  const rp = await page.$('[data-ripple]');
  assert(rp, '示例里有 data-ripple 按钮');
  const box = await rp.boundingBox();
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  const n = await rp.evaluate((b) => b.querySelectorAll('.nv-ripple').length);
  assert.equal(n, 1, '按下时生成水波纹');
  const clip = await rp.evaluate((b) => getComputedStyle(b).overflow);
  assert.equal(clip, 'hidden', '水波纹被按钮裁切');
  await page.mouse.up();
  await sleep(900);
  assert.equal(await rp.evaluate((b) => b.querySelectorAll('.nv-ripple').length), 0, '动画结束后移除');

  // —— 尺寸 —— //
  const sizes = await page.evaluate(() => {
    const get = (s) => document.querySelector(`.nv-btn[data-size="${s}"]`)?.getBoundingClientRect().height;
    const md = [...document.querySelectorAll('.nv-btn:not([data-size])')][0].getBoundingClientRect().height;
    const icon = document.querySelector('.nv-btn[data-icon]').getBoundingClientRect();
    return { sm: get('sm'), md, lg: get('lg'), iconW: icon.width, iconH: icon.height };
  });
  assert.equal(sizes.sm, 32, 'sm 高 32');
  assert.equal(sizes.md, 38, 'md 高 38');
  assert.equal(sizes.lg, 44, 'lg 高 44');
  assert.equal(sizes.iconW, sizes.iconH, '仅图标按钮为正方形');
};
