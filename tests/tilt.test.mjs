// Tilt / Magnetic：悬停倾斜、离开复位并清空 transform、glare、磁吸位移与复位
export default async ({ page, assert, sleep }) => {
  const card = await page.$('[data-nv-tilt]');
  await card.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = await card.boundingBox();
  const orig = await card.evaluate((el) => el.style.transform);
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.1);
  await page.mouse.move(box.x + box.width * 0.95, box.y + box.height * 0.05, { steps: 3 });
  await sleep(500);
  const tf = await card.evaluate((el) => el.style.transform || getComputedStyle(el).transform);
  assert(/rotate|matrix3d/.test(tf), `悬停时倾斜（${tf}）`);
  await page.mouse.move(5, 5);
  await sleep(1500);
  assert.equal(await card.evaluate((el) => el.style.transform), orig, '离开后弹回并清空 transform');

  const g = await page.$('[data-nv-tilt][data-glare]');
  await g.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const gb = await g.boundingBox();
  await page.mouse.move(gb.x + gb.width * 0.2, gb.y + gb.height * 0.2);
  await page.mouse.move(gb.x + gb.width * 0.25, gb.y + gb.height * 0.25, { steps: 2 });
  await sleep(400);
  assert(await g.evaluate((el) => !!el.querySelector('[class*="glare"]')), 'data-glare 注入光泽层');
  await page.mouse.move(5, 5);
  await sleep(1200);

  const m = await page.$('[data-nv-magnetic]');
  await m.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const mb = await m.boundingBox();
  await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2);
  await page.mouse.move(mb.x + mb.width - 2, mb.y + mb.height / 2, { steps: 4 });
  await sleep(500);
  const tr = await m.evaluate((el) => el.style.translate);
  assert(tr && tr !== '0px 0px' && tr !== 'none' && tr !== '0px', `磁吸位移（${tr}）`);
  await page.mouse.move(5, 5);
  await sleep(1500);
  const tr2 = await m.evaluate((el) => el.style.translate);
  assert(!tr2 || tr2 === 'none' || tr2 === '0px 0px' || tr2 === '0px', `离开后复位（${tr2}）`);
};
