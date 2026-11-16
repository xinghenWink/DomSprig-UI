// Descriptions：列数、跨列、容器查询自适应（≤720 两列、≤460 单列）、bordered 最后一行补齐
export default async ({ page, assert }) => {
  const cols = (el) => el.evaluate((d) => {
    const items = [...d.querySelectorAll('.nv-desc-item')];
    const tops = new Map();
    items.forEach((i) => { const t = Math.round(i.getBoundingClientRect().top); tops.set(t, (tops.get(t) || 0) + 1); });
    return Math.max(...tops.values());
  });
  const first = await page.$('.nv-desc');
  assert.equal(await cols(first), 3, '默认 3 列');
  const span = await first.evaluate((d) => {
    const full = d.querySelector('.nv-desc-item[data-span="full"]');
    return full ? Math.round(full.getBoundingClientRect().width) >= Math.round(d.querySelector('.nv-desc-item').parentElement.getBoundingClientRect().width) - 40 : true;
  });
  assert(span, 'data-span=full 占满一行');

  // 自适应：把最后一个示例的容器改窄
  const resp = await page.evaluate(async () => {
    const list = [...document.querySelectorAll('.nv-desc')];
    const d = list[list.length - 1];
    const box = d.parentElement;
    const count = () => {
      const items = [...d.querySelectorAll('.nv-desc-item')];
      const tops = new Map();
      items.forEach((i) => { const t = Math.round(i.getBoundingClientRect().top); tops.set(t, (tops.get(t) || 0) + 1); });
      return Math.max(...tops.values());
    };
    const out = {};
    for (const w of [900, 600, 400]) {
      box.style.width = `${w}px`;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      out[w] = count();
    }
    out.overflow = d.scrollWidth > d.clientWidth + 1;
    return out;
  });
  assert.equal(resp[900], 3, '宽容器 3 列');
  assert.equal(resp[600], 2, '≤720px 两列');
  assert.equal(resp[400], 1, '≤460px 单列');
  assert(!resp.overflow, '窄容器不溢出');
};
