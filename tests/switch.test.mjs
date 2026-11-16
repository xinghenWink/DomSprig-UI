// Switch：键盘切换、加载态拦截、表单值、滑块位移
export default async ({ page, assert, sleep }) => {
  // Space 切换
  const sel = '#switch-settings [name=push]';
  await page.focus(sel);
  await page.keyboard.press('Space');
  assert.equal(await page.$eval(sel, (el) => el.checked), true, 'Space 打开');
  assert(/push=on/.test(await page.$eval('#switch-settings-log', (el) => el.textContent)), '表单值包含 push=on');

  // 滑块位移：开启后 ::before 的 translate 不为 0
  await sleep(500);
  const tx = await page.$eval(sel, (el) => getComputedStyle(el, '::before').translate);
  assert(tx && tx !== 'none' && !tx.startsWith('0px'), `开启时滑块右移（${tx}）`);

  // 加载中：点击和空格都不改变状态
  const loading = await page.evaluate(() => {
    const el = document.querySelector('.nv-switch[data-loading]');
    const before = el.checked;
    el.click();
    return before === el.checked;
  });
  assert(loading, '加载中点击无效');
  await page.focus('.nv-switch[data-loading]');
  await page.keyboard.press('Space');
  assert.equal(await page.$eval('.nv-switch[data-loading]', (el) => el.checked), false, '加载中空格无效');

  // 远程切换：change → loading → 结束后恢复
  await page.click('#switch-remote');
  const mid = await page.$eval('#switch-remote', (el) => ({ l: el.hasAttribute('data-loading'), b: el.getAttribute('aria-busy'), c: el.checked }));
  assert(mid.l && mid.b === 'true' && mid.c, '切换后进入加载态');
  await sleep(900);
  const end = await page.$eval('#switch-remote', (el) => ({ l: el.hasAttribute('data-loading'), b: el.getAttribute('aria-busy') }));
  assert(!end.l && end.b === 'false', '请求结束退出加载态');

  // 禁用
  assert.equal(await page.evaluate(() => { const el = document.querySelector('.nv-switch:disabled:not(:checked)'); el.click(); return el.checked; }), false, '禁用不可切换');
};
