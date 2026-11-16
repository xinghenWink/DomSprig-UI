// Spotlight：单卡跟随指针写 --_x/--_y，组内每张卡相对自身坐标
export default async ({ page, assert, sleep }) => {
  const one = await page.$('.nv-spotlight');
  await one.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const b = await one.boundingBox();
  await page.mouse.move(b.x + 30, b.y + 20);
  await page.mouse.move(b.x + 40, b.y + 25, { steps: 2 });
  await sleep(100);
  const v = await one.evaluate((el) => [el.style.getPropertyValue('--_x'), el.style.getPropertyValue('--_y')]);
  assert(Math.abs(parseFloat(v[0]) - 40) <= 2 && Math.abs(parseFloat(v[1]) - 25) <= 2, `单卡坐标（${v}）`);

  const grid = await page.$('.nv-spotlight-group');
  await grid.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await sleep(100);
  const cards = await grid.$$('.nv-spotlight');
  const c0 = await cards[0].boundingBox();
  const c1 = await cards[1].boundingBox();
  await page.mouse.move(c0.x + 10, c0.y + 10);
  await page.mouse.move(c0.x + 20, c0.y + 15, { steps: 2 });
  await sleep(100);
  const g = await grid.evaluate((el) => [...el.querySelectorAll('.nv-spotlight')].slice(0, 2).map((c) => parseFloat(c.style.getPropertyValue('--_x'))));
  assert(Math.abs(g[0] - 20) <= 2, `组内第一张（${g[0]}）`);
  assert(Math.abs(g[1] - (c0.x + 20 - c1.x)) <= 2, `组内第二张用自身坐标（${g[1]}）`);
};
