// Checkbox：原生键盘切换、全选/半选联动示例、卡片选中样式
export const components = ['checkbox', 'radio'];

export default async ({ page, assert }) => {
  const state = () => page.$eval('#checkbox-all', (el) => ({ c: el.checked, i: el.indeterminate }));
  let s = await state();
  assert(s.i && !s.c, '初始为半选');

  await page.click('#checkbox-all');
  s = await state();
  assert(s.c && !s.i, '点击父项 → 全选');
  assert.equal(await page.$$eval('#checkbox-perm-list :checked', (l) => l.length), 4, '子项全部选中');

  // 键盘 Space 取消一个子项 → 父项回到半选
  await page.focus('#checkbox-perm-list [value=billing]');
  await page.keyboard.press('Space');
  s = await state();
  assert(s.i, '取消一项 → 半选');

  // 对勾通过 clip-path 动画显示
  const clip = await page.$eval('#checkbox-perm-list [value=read]', (el) => getComputedStyle(el, '::before').clipPath);
  assert(/inset\(0(px)?\)|inset\(0(px)? 0(px)? 0(px)? 0(px)?\)/.test(clip), `选中时对勾完整显示（${clip}）`);

  // 禁用项不可切换
  const dis = await page.evaluate(() => {
    const el = document.querySelector('[name=addon][value=support]');
    el.closest('label').click();
    return el.checked;
  });
  assert.equal(dis, false, '禁用卡片不可选中');

  // 卡片选中边框高亮
  const card = await page.$eval('[name=addon][value=backup]', (el) => getComputedStyle(el.closest('.nv-check-card')).borderColor);
  const plain = await page.$eval('[name=addon][value=sso]', (el) => getComputedStyle(el.closest('.nv-check-card')).borderColor);
  assert(card !== plain, '选中卡片边框颜色不同');

  // Radio：方向键切换并同步表单值
  await page.focus('[name=plan][value=pro]');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.$eval('#radio-plan-log', (el) => el.textContent), 'plan = team', '方向键选中下一项并触发 change');
};
