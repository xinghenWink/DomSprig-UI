// Steps：状态推导、aria-current、可点击（finished 限制、可取消事件）、方法、窄屏自动纵向
export const components = ['steps'];

export default async ({ page, assert, sleep }) => {
  const statuses = (sel) => page.evaluate((s) => [...document.querySelectorAll(`${s} > .nv-step`)].map((x) => x.dataset.status).join(), sel);

  // 状态推导：data-current=1 → finish, process, wait…
  const first = await page.evaluate(() => {
    const root = document.querySelector('.nv-steps');
    const list = [...root.querySelectorAll(':scope > .nv-step')];
    return { s: list.map((x) => x.dataset.status).join(), cur: list.findIndex((x) => x.getAttribute('aria-current') === 'step') };
  });
  assert(first.s.startsWith('finish,process,wait'), `状态推导：${first.s}`);
  assert.equal(first.cur, 1, 'aria-current 指向当前步骤');

  // 下单流程：next/prev + 事件 + finished 限制
  await page.evaluate(() => {
    window.__ev = [];
    document.getElementById('steps-checkout').addEventListener('nv:change', (e) => window.__ev.push(`${e.detail.previous}>${e.detail.index}`));
  });
  await page.click('#steps-checkout-next');
  await page.click('#steps-checkout-next');
  assert.equal(await statuses('#steps-checkout'), 'finish,finish,process,wait', 'next 两次到第 3 步');
  const locked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#steps-checkout > .nv-step > .nv-step-main')];
    return btns.map((b) => (b.tagName === 'BUTTON' ? (b.disabled ? 'd' : 'e') : '-')).join('');
  });
  assert.equal(locked, 'eedd', 'finished 模式只能点已完成步骤');
  await page.click('#steps-checkout > .nv-step:nth-child(1) > .nv-step-main');
  assert.equal(await statuses('#steps-checkout'), 'process,wait,wait,wait', '点击已完成步骤返回');
  assert.equal(await page.evaluate(() => window.__ev.join()), '0>1,1>2,2>0', `nv:change 序列：${await page.evaluate(() => window.__ev.join())}`);
  assert.equal(await page.evaluate(() => document.getElementById('steps-checkout-log').textContent), '当前：第 1 步', '示例联动');

  // 可取消
  const cancelled = await page.evaluate(() => {
    const el = document.getElementById('steps-click');
    const stop = (e) => e.preventDefault();
    el.addEventListener('nv:change', stop);
    const r = Nova.steps.set(el, 2);
    el.removeEventListener('nv:change', stop);
    return { r, cur: Nova.get(el, 'steps').current };
  });
  assert.equal(cancelled.r, false, 'preventDefault 后 set 返回 false');
  assert.equal(cancelled.cur, 0, '取消后步骤不变');

  // 禁用步骤不可点击，Enter 可切换
  const dis = await page.evaluate(() => document.querySelector('#steps-click > .nv-step[data-disabled] > .nv-step-main').disabled);
  assert(dis, 'data-disabled 的步骤按钮禁用');
  await page.focus('#steps-click > .nv-step:nth-child(3) > .nv-step-main');
  await page.keyboard.press('Enter');
  assert.equal(await statuses('#steps-click'), 'finish,finish,process,wait', 'Enter 切换到第 3 步');

  // 窄屏自动纵向：容器缩窄后加 data-collapsed，恢复后移除
  await page.evaluate(() => { document.getElementById('steps-checkout').style.width = '260px'; });
  await sleep(120);
  assert(await page.evaluate(() => document.getElementById('steps-checkout').hasAttribute('data-collapsed')), '窄容器自动转纵向');
  await page.evaluate(() => { document.getElementById('steps-checkout').style.width = ''; });
  await sleep(120);
  assert(!(await page.evaluate(() => document.getElementById('steps-checkout').hasAttribute('data-collapsed'))), '宽度恢复后还原横向');
};
