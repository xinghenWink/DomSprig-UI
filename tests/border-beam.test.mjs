// Border Beam：注入装饰层（aria-hidden）、光束数量、读取圆角、refresh、离开视口暂停、不拦截输入框点击
export default async ({ page, assert, sleep }) => {
  const r = await page.$$eval('.nv-border-beam', (els) => els.map((el) => {
    const track = el.querySelector(':scope > .nv-border-beam-track');
    return {
      hidden: track?.getAttribute('aria-hidden'),
      beams: track ? track.querySelectorAll('.nv-border-beam-light').length : 0,
      want: Number(el.dataset.beams || 1),
      pe: track && getComputedStyle(track).pointerEvents,
    };
  }));
  assert(r.length >= 3, '有多个示例');
  assert(r.every((x) => x.hidden === 'true'), '装饰层 aria-hidden');
  assert(r.every((x) => x.beams === x.want), `光束数量（${r.map((x) => `${x.beams}/${x.want}`)}）`);
  assert(r.every((x) => x.pe === 'none'), '装饰层不拦截指针');

  // 输入框可点击聚焦
  await page.click('#border-beam-ask');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'border-beam-ask', '光束容器里的输入框可聚焦');

  // refresh 改光束数
  const n = await page.$eval('.nv-border-beam', (el) => {
    el.dataset.beams = '3';
    Nova.get(el, 'border-beam').refresh();
    return el.querySelectorAll('.nv-border-beam-light').length;
  });
  assert.equal(n, 3, 'refresh 按 data-beams 重建');

  // 离开视口暂停
  const p = await page.evaluate(async () => {
    const el = document.querySelector('.nv-border-beam');
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, 400));
    const off = el.hasAttribute('data-paused');
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 400));
    return { off, on: !el.hasAttribute('data-paused') };
  });
  assert(p.off && p.on, `离开视口暂停、回来继续（${JSON.stringify(p)}）`);
};
