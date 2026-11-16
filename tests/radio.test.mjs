// Radio：原生分组与方向键、选中样式、禁用、组错误态、表单提交、键盘焦点可见
export default async ({ page, assert, sleep }) => {
  const first = await page.$('input[type="radio"]:not(:disabled)');
  const name = await first.evaluate((i) => i.name);
  await first.focus();
  await page.keyboard.press('ArrowDown');
  const now = await page.evaluate((n) => [...document.querySelectorAll(`input[name="${n}"]`)].findIndex((i) => i.checked), name);
  assert(now >= 1, '方向键在同组 radio 间移动并选中');
  const look = await page.evaluate((n) => {
    const on = document.querySelector(`input[name="${n}"]:checked`);
    const off = document.querySelector(`input[name="${n}"]:not(:checked):not(:disabled)`);
    return { on: getComputedStyle(on).backgroundColor, off: getComputedStyle(off).backgroundColor, focus: getComputedStyle(on).outlineStyle !== 'none' || getComputedStyle(on).boxShadow.includes('px') };
  }, name);
  assert(look.on !== look.off, '选中与未选中样式不同');
  assert(look.focus, '键盘焦点可见');

  const dis = await page.$('input[type="radio"]:disabled');
  if (dis) {
    await dis.evaluate((i) => (i.closest('label') || i).click());
    assert(!(await dis.evaluate((i) => i.checked && !i.defaultChecked)), '禁用项不可选');
  }
  const invalid = await page.$eval('.nv-check-group[aria-invalid="true"]', (g) => {
    const i = g.querySelector('input[type="radio"]');
    return getComputedStyle(i).borderColor;
  });
  const normal = await page.$eval('input[type="radio"]:not(:checked):not(:disabled)', (i) => getComputedStyle(i).borderColor);
  assert(invalid !== normal, '组 aria-invalid 时标红');

  const form = await page.$('#radio-plan-form');
  if (form) {
    const before = await page.$eval('#radio-plan-form', (f) => [...new FormData(f).entries()].map(([k, v]) => `${k}=${v}`).join('&'));
    assert(before.length > 0, `表单拿到值（${before}）`);
  }
};
