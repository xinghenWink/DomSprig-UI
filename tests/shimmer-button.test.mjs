// Shimmer / Shine / Glow：data-shine 注入光层（aria-hidden、末尾、不参与布局）、重复初始化不重复注入、.nv-shimmer 有动画
export default async ({ page, assert }) => {
  const r = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[data-shine]')];
    return els.map((el) => {
      const s = el.querySelectorAll(':scope > .nv-shine');
      const last = el.lastElementChild;
      return { n: s.length, hidden: s[0]?.getAttribute('aria-hidden'), last: last === s[0], pos: s[0] && getComputedStyle(s[0]).position };
    });
  });
  assert(r.length >= 2, '有 data-shine 示例');
  assert(r.every((x) => x.n === 1 && x.hidden === 'true' && x.last && x.pos === 'absolute'), `每个元素末尾一个光层（${JSON.stringify(r)}）`);
  const again = await page.evaluate(() => {
    const el = document.querySelector('[data-shine]');
    Nova.init(el.parentElement);
    return el.querySelectorAll(':scope > .nv-shine').length;
  });
  assert.equal(again, 1, '重复初始化不重复注入');
  const anim = await page.$eval('.nv-shimmer', (el) => {
    const names = [getComputedStyle(el).animationName, getComputedStyle(el, '::before').animationName, getComputedStyle(el, '::after').animationName];
    return names.some((n) => n && n !== 'none');
  });
  assert(anim, '.nv-shimmer 有流光动画');
  const label = await page.$eval('.nv-shimmer', (el) => el.textContent.trim().length > 0);
  assert(label, '按钮文字可读');
};
