// Segmented：指示器对齐选中项、点击与方向键切换、事件、禁用项、value 写入、撑满等分
export default async ({ page, assert, sleep }) => {
  const aligned = (sel) => page.$eval(sel, (el) => {
    const ind = el.querySelector('.nv-segmented-indicator').getBoundingClientRect();
    const lab = el.querySelector('input:checked').closest('label').getBoundingClientRect();
    return Math.abs(ind.left - lab.left) <= 1.5 && Math.abs(ind.width - lab.width) <= 1.5;
  });

  assert.equal(await page.$eval('#seg-demo', (el) => el.getAttribute('role')), 'radiogroup', 'role=radiogroup');
  assert(await aligned('#seg-demo'), '指示器对齐初始选中项');

  await page.evaluate(() => {
    window.__ev = [];
    const el = document.getElementById('seg-demo');
    el.addEventListener('change', (e) => window.__ev.push(`change:${e.target.value}`));
    el.addEventListener('nv:change', (e) => window.__ev.push(`nv:${e.detail.value}`));
  });
  await page.click('#seg-demo label:nth-of-type(4)');
  await sleep(350);
  assert.equal(await page.$eval('#seg-demo input:checked', (i) => i.value), 'year', '点击切换');
  assert(await aligned('#seg-demo'), '指示器移到新选中项');
  assert.equal(await page.evaluate(() => window.__ev.sort().join(',')), 'change:year,nv:year', '原生 change + nv:change');
  assert.equal(await page.$eval('#seg-log', (el) => el.textContent), 'value = year', '示例日志');

  await page.focus('#seg-demo input:checked');
  await page.keyboard.press('ArrowLeft');
  await sleep(350);
  assert.equal(await page.$eval('#seg-demo input:checked', (i) => i.value), 'month', '方向键切换');
  assert(await aligned('#seg-demo'), '方向键后指示器跟随');
  const ring = await page.$eval('#seg-demo input:checked', (i) => {
    const l = i.closest('label');
    const s = getComputedStyle(l);
    return s.outlineStyle !== 'none' || s.boxShadow !== 'none' || getComputedStyle(l.parentElement.querySelector('.nv-segmented-indicator')).boxShadow.includes('px');
  });
  assert(ring, '键盘焦点可见');

  // value 写入
  const w = await page.evaluate(async () => {
    const el = document.getElementById('seg-demo');
    window.__ev = [];
    Nova.get(el, 'segmented').value = 'day';
    await new Promise((r) => setTimeout(r, 350));
    return { checked: el.querySelector('input:checked').value, ev: window.__ev.length };
  });
  assert.equal(w.checked, 'day', 'value 写入');
  assert.equal(w.ev, 0, '写入不派发事件');
  assert(await aligned('#seg-demo'), '写入后指示器跟随');

  // 每个示例的指示器都对齐（含图标、尺寸、撑满）
  const all = await page.$$eval('.nv-segmented', (els) => els.map((el) => {
    const ind = el.querySelector('.nv-segmented-indicator').getBoundingClientRect();
    const lab = el.querySelector('input:checked')?.closest('label').getBoundingClientRect();
    return lab ? Math.abs(ind.left - lab.left) <= 1.5 && Math.abs(ind.width - lab.width) <= 1.5 : true;
  }));
  assert(all.every(Boolean), `所有示例指示器对齐（${all}）`);

  // 撑满等分
  const block = await page.$eval('.nv-segmented[data-block]', (el) => {
    const ws = [...el.querySelectorAll('label')].map((l) => Math.round(l.getBoundingClientRect().width));
    return { ws, full: Math.abs(el.getBoundingClientRect().width - el.parentElement.getBoundingClientRect().width) < 2 };
  });
  assert(block.full, 'data-block 撑满');
  assert(Math.max(...block.ws) - Math.min(...block.ws) <= 1, `等分（${block.ws}）`);

  // 禁用项
  const dis = await page.$('.nv-segmented input:disabled');
  if (dis) {
    const before = await dis.evaluate((i) => i.closest('.nv-segmented').querySelector('input:checked').value);
    await dis.evaluate((i) => i.closest('label').click());
    await sleep(100);
    const after = await dis.evaluate((i) => i.closest('.nv-segmented').querySelector('input:checked').value);
    assert.equal(after, before, '禁用项不可选');
  }

  // 尺寸变化后重新定位
  const resized = await page.evaluate(async () => {
    const el = document.querySelector('.nv-segmented[data-block]');
    el.parentElement.style.width = '300px';
    await new Promise((r) => setTimeout(r, 400));
    const ind = el.querySelector('.nv-segmented-indicator').getBoundingClientRect();
    const lab = el.querySelector('input:checked').closest('label').getBoundingClientRect();
    return Math.abs(ind.width - lab.width) <= 1.5;
  });
  assert(resized, '容器缩放后指示器重新定位');
};
