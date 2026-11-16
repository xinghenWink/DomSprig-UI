// Pagination：页码算法与省略号、点击翻页与焦点保留、上一页/下一页边界、省略号跳页、每页条数、跳转、简洁模式、脚本控制、禁用
export default async ({ page, assert, sleep }) => {
  const nth = (i) => `.nv-pagination:nth-of-type(${i})`;
  const pages = (sel) => page.$eval(sel, (el) => [...el.querySelectorAll('.nv-pagination-list > li > button')].map((b) => {
    if (b.classList.contains('nv-pagination-more')) return '…';
    if (b.dataset.page && !b.getAttribute('aria-label').includes('上一页') && !b.getAttribute('aria-label').includes('下一页') && b.classList.contains('nv-pagination-item')) return b.textContent.trim() + (b.getAttribute('aria-current') ? '*' : '');
    return null;
  }).filter(Boolean).join(' '));

  const navs = await page.$$('.nv-pagination');
  const p250 = navs[1];
  const seq = (h) => h.evaluate((el) => [...el.querySelectorAll('.nv-pagination-list > li > button.nv-pagination-item')].map((b) => (b.classList.contains('nv-pagination-more') ? '…' : b.textContent.trim() + (b.getAttribute('aria-current') ? '*' : ''))).filter(Boolean).join(' '));

  assert.equal(await seq(navs[0]), '1 2* 3 4 5', '5 页全部显示');
  assert.equal(await seq(p250), '1 … 11 12* 13 … 25', '首尾 + 两侧 + 省略号');
  const aria = await p250.evaluate((el) => ({
    label: el.getAttribute('aria-label'),
    cur: el.querySelector('[aria-current="page"]').getAttribute('aria-label'),
  }));
  assert.equal(aria.label, '分页', '默认 aria-label');
  assert(/12/.test(aria.cur), '当前页有可读名称');

  // —— 点击翻页 + 焦点保留 —— //
  await p250.evaluate((el) => { window.__pg = []; el.addEventListener('nv:change', (e) => window.__pg.push(e.detail.page)); });
  await p250.$eval('button[data-page="13"]:not(.nv-pagination-more)', (b) => b.click());
  await sleep(50);
  assert.equal(await seq(p250), '1 … 12 13* 14 … 25', '点击页码');
  // 下一页
  const nextBtn = await p250.$('button[aria-label="下一页"]');
  await nextBtn.focus();
  await page.keyboard.press('Enter');
  await sleep(50);
  assert.equal(await seq(p250), '1 … 13 14* 15 … 25', 'Enter 下一页');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), '下一页', '翻页后焦点仍在「下一页」');
  // 省略号跳页
  await p250.evaluate((el) => [...el.querySelectorAll('.nv-pagination-more')].pop().click());
  await sleep(50);
  const afterJump = await seq(p250);
  assert(afterJump.includes('19*'), `后省略号跳 5 页（${afterJump}）`);
  // 末页时下一页禁用
  await p250.$eval('button[data-page="25"]', (b) => b.click());
  await sleep(50);
  assert(await p250.$eval('button[aria-label="下一页"]', (b) => b.disabled), '末页「下一页」禁用');
  assert.equal(await seq(p250), '1 … 21 22 23 24 25*', '末页（保持按钮数量不变）');
  assert.equal(await page.evaluate(() => window.__pg.join(',')), '13,14,19,25', 'nv:change 依次派发');

  // —— 每页条数与跳转 —— //
  const full = await page.$('#pagination-full');
  const total = await full.$eval('.nv-pagination-total', (t) => t.textContent);
  assert(total.includes('1286'), `显示总数（${total}）`);
  const sel = await full.$('select');
  await sel.evaluate((s) => { s.value = s.options[s.options.length - 1].value; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await sleep(100);
  const after = await full.evaluate((el) => {
    const s = el.querySelector('select');
    return { size: s.value, last: [...el.querySelectorAll('.nv-pagination-item:not(.nv-pagination-more)')].map((b) => b.textContent.trim()).filter(Boolean).pop() };
  });
  assert.equal(after.last, String(Math.ceil(1286 / Number(after.size))), `改每页条数后总页数更新（${JSON.stringify(after)}）`);
  const jumper = await full.$('.nv-pagination-jumper input');
  await jumper.click();
  await page.keyboard.type('3');
  await page.keyboard.press('Enter');
  await sleep(50);
  assert.equal(await full.$eval('[aria-current="page"]', (b) => b.textContent.trim()), '3', '跳转输入回车');
  await jumper.click({ count: 3 });
  await page.keyboard.type('9999');
  await page.keyboard.press('Enter');
  await sleep(50);
  const lastPage = await full.$eval('[aria-current="page"]', (b) => b.textContent.trim());
  assert.equal(lastPage, String(Math.ceil(1286 / Number(after.size))), '超出页数跳到末页');
  assert(await page.$eval('#pagination-full-log', (el) => el.textContent.length > 0 && !el.textContent.includes('试试')), '示例日志更新');

  // —— 简洁模式 —— //
  const simple = await page.$('[aria-label="消息分页"]');
  const sm = await simple.evaluate((el) => ({ input: el.querySelector('.nv-pagination-input').value, count: el.querySelector('.nv-pagination-count').textContent }));
  assert.equal(`${sm.input}/${sm.count}`, '2/9', '简洁模式显示 当前/总数');
  await simple.$eval('button[aria-label="下一页"]', (b) => b.click());
  await sleep(50);
  assert.equal(await simple.$eval('.nv-pagination-input', (i) => i.value), '3', '简洁模式下一页');
  const si = await simple.$('.nv-pagination-input');
  await si.click({ count: 3 });
  await page.keyboard.type('7');
  await page.keyboard.press('Enter');
  await sleep(50);
  assert.equal(await simple.$eval('.nv-pagination-input', (i) => i.value), '7', '简洁模式输入跳转');

  // —— 脚本控制 —— //
  await page.click('#pagination-api-b');
  await sleep(100);
  const apiA = await page.$eval('#pagination-api', (el) => el.querySelector('[aria-current="page"]')?.textContent.trim());
  assert.equal(apiA, '1', '换关键词回到第 1 页');
  await page.click('#pagination-api-last');
  await sleep(100);
  const apiLast = await page.$eval('#pagination-api', (el) => ({ cur: el.querySelector('[aria-current="page"]').textContent.trim(), last: [...el.querySelectorAll('.nv-pagination-item:not(.nv-pagination-more)')].map((b) => b.textContent.trim()).filter(Boolean).pop() }));
  assert.equal(apiLast.cur, apiLast.last, 'goTo 跳到末页');

  // —— 禁用 —— //
  const dis = await page.$eval('[aria-label="已禁用的分页"]', (el) => [...el.querySelectorAll('button')].every((b) => b.disabled));
  assert(dis, '禁用时所有按钮禁用');

  // —— 尺寸 —— //
  const hs = await page.evaluate(() => ['评论分页', '商品分页'].map((l) => Math.round(document.querySelector(`[aria-label="${l}"] .nv-pagination-item`).getBoundingClientRect().height)));
  assert.equal(hs.join(','), '28,38', 'sm / lg 高度（28 / 38）');
};
