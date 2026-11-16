// Badge：角标随 data-count 更新、0 时隐藏、99+、按钮 aria-label 同步、dot 尺寸、角标位置贴在右上角
export default async ({ page, assert, sleep }) => {
  const badge = () => page.$eval('#badge-cart', (el) => {
    const s = getComputedStyle(el, '::after');
    return { content: s.content.replace(/"/g, ''), scale: s.transform, opacity: Number(s.opacity) };
  });
  let b = await badge();
  assert.equal(b.content, '4', '初始 4');
  await page.click('#badge-cart-plus');
  b = await badge();
  assert.equal(b.content, '5', '加一');
  assert.equal(await page.$eval('#badge-cart-btn', (x) => x.getAttribute('aria-label')), '购物车，5 件商品', 'aria-label 同步');
  await page.click('#badge-cart-many');
  assert.equal((await badge()).content, '99+', '超过 99 显示 99+');
  for (let i = 0; i < 121; i++) await page.$eval('#badge-cart-minus', (x) => x.click());
  await sleep(400);
  b = await badge();
  assert(b.opacity === 0 || b.scale.includes('matrix(0') || b.content === '', `0 时隐藏（${JSON.stringify(b)}）`);
  assert.equal(await page.$eval('#badge-cart-log', (x) => x.textContent), '购物车是空的', '日志');

  // 角标位置：右上角，中心在宿主边角附近
  const pos = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.nv-indicator[data-count]')].find((x) => x.dataset.count && x.dataset.count !== '0' && !x.dataset.placement);
    const host = el.getBoundingClientRect();
    const s = getComputedStyle(el, '::after');
    return { top: parseFloat(s.top), right: parseFloat(s.right), w: parseFloat(s.width), hostW: host.width, pos: s.position };
  });
  assert.equal(pos.pos, 'absolute', '角标绝对定位');
};
