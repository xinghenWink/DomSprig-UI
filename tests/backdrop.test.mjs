// Backdrop：生成指定数量的流星（读屏隐藏、被裁切）、refresh、减少动态不生成
export default async ({ page, assert }) => {
  const m = await page.$eval('[data-nv-meteors]', (el) => ({
    n: el.querySelectorAll('.nv-meteor').length,
    hidden: el.getAttribute('aria-hidden') === 'true' || [...el.querySelectorAll('.nv-meteor')].every((x) => x.getAttribute('aria-hidden') === 'true'),
    clip: [el, el.parentElement].some((x) => getComputedStyle(x).overflow === 'hidden' || getComputedStyle(x).overflow === 'clip'),
  }));
  assert.equal(m.n, 14, '14 颗流星');
  assert(m.hidden, '流星对读屏隐藏');
  assert(m.clip, '流星被容器裁切');
  const r = await page.$eval('[data-nv-meteors]', (el) => {
    el.dataset.nvMeteors = '5';
    const inst = Nova.get(el, 'meteors') || Nova.get(el, 'backdrop');
    inst.refresh();
    return el.querySelectorAll('.nv-meteor').length;
  });
  assert.equal(r, 5, 'refresh 按新数量重建');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const rm = await page.evaluate(() => {
    const d = document.createElement('div');
    d.dataset.nvMeteors = '6';
    document.querySelector('.doc-preview').append(d);
    Nova.init(d);
    return d.querySelectorAll('.nv-meteor').length;
  });
  assert.equal(rm, 0, '减少动态不生成流星');
};
