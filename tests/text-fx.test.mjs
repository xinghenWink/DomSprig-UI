// Text FX：打字机循环 / 不循环、blur-in 拆分后还原、scramble 结束还原、rotate 读屏文字
export default async ({ page, assert, sleep }) => {
  const visible = (el) => [...el.childNodes].filter((n) => !(n.nodeType === 1 && n.classList.contains('nv-sr-only'))).map((n) => n.textContent).join('');

  const pre = await page.$eval('[data-nv-text="blur-in"]', (el) => !!el.querySelector('.nv-text-split') && el.querySelector('.nv-sr-only')?.textContent === '让界面本身成为产品的一部分');
  assert(pre, '进入视口前已拆分，并放了读屏原文');

  const first = await page.$$eval('[data-nv-text="type"]', (l) => ({ sr: l[0].querySelector('.nv-sr-only')?.textContent || l[0].getAttribute('aria-label') || '' }));
  assert(first.sr.includes('后台系统'), `打字机读屏有完整文案（${first.sr}）`);

  const t1 = await page.$$eval('[data-nv-text="type"]', (l) => l[0].textContent);
  await sleep(700);
  const t2 = await page.$$eval('[data-nv-text="type"]', (l) => l[0].textContent);
  assert(t1 !== t2, `打字机在打字（${t1} → ${t2}）`);

  await page.$$eval('[data-nv-text="type"]', (l) => l[1].scrollIntoView({ block: 'center' }));
  await sleep(5000);
  const stop = await page.$$eval('[data-nv-text="type"]', (l) => [...l[1].childNodes].filter((n) => !(n.nodeType === 1 && n.classList.contains('nv-sr-only'))).map((n) => n.textContent).join(''));
  assert(stop.includes('部署成功'), `data-loop=false 停在最后一个词（${stop}）`);
  await sleep(1500);
  const stop2 = await page.$$eval('[data-nv-text="type"]', (l) => [...l[1].childNodes].filter((n) => !(n.nodeType === 1 && n.classList.contains('nv-sr-only'))).map((n) => n.textContent).join(''));
  assert.equal(stop2, stop, '停住后不再变化');

  const blur = await page.evaluate(async () => {
    const el = document.querySelectorAll('[data-nv-text="blur-in"]')[0];
    el.scrollIntoView({ block: 'center' });
    await new Promise((r) => setTimeout(r, 3500));
    return { restored: !el.querySelector('.nv-text-split, .nv-sr-only') && el.textContent.trim() === '让界面本身成为产品的一部分' };
  });
  assert(blur.restored, '结束后还原为原始 DOM');

  const scr = await page.evaluate(async () => {
    const el = document.querySelector('[data-nv-text="scramble"]');
    el.scrollIntoView({ block: 'center' });
    await new Promise((r) => setTimeout(r, 2500));
    const html0 = el.innerHTML;
    el.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false }));
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    el.focus();
    await new Promise((r) => setTimeout(r, 120));
    const during = el.innerHTML !== html0;
    await new Promise((r) => setTimeout(r, 2500));
    return { during, restored: el.innerHTML === html0 };
  });
  assert(scr.restored, 'scramble 结束后文字还原');

  const rot = await page.evaluate(() => {
    const el = document.querySelector('[data-nv-text="rotate"]');
    return el.querySelector('.nv-sr-only')?.textContent || el.getAttribute('aria-label') || '';
  });
  assert(rot.includes('更快'), `轮换读屏文字（${rot}）`);
};
