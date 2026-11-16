// Table：三态排序与 aria-sort、勾选（半选、跨页保持、Shift 连选、操作栏）、分页联动、固定列阴影与吸顶、展开行、远程加载与空状态、安全渲染、行键盘
export default async ({ page, assert, sleep }) => {
  const U = '#table-users';
  const col = (sel, key) => page.$eval(sel, (el, key) => {
    const ths = [...el.querySelectorAll('thead th')];
    const i = ths.findIndex((th) => th.dataset.key === key || th.textContent.trim().startsWith(key));
    return [...el.querySelectorAll('tbody tr:not(.nv-table-expanded-row)')].map((tr) => tr.children[i]?.textContent.trim());
  }, key);
  const sortBtn = (sel, title) => page.evaluate((sel, title) => {
    const b = [...document.querySelectorAll(`${sel} thead .nv-table-sort`)].find((x) => x.textContent.trim().startsWith(title));
    b.click();
    return b.closest('th').getAttribute('aria-sort');
  }, sel, title);

  // —— 结构 —— //
  const init = await page.$eval(U, (el) => ({
    caption: el.querySelector('caption')?.textContent,
    rows: el.querySelectorAll('tbody tr').length,
    head: el.querySelector('thead .nv-table-check input')?.getAttribute('aria-label'),
    sortable: el.querySelectorAll('thead .nv-table-sort').length,
  }));
  assert.equal(init.caption, '团队用户列表', 'caption');
  assert.equal(init.rows, 8, 'pageSize=8');
  assert(init.head, '表头复选框有 aria-label');
  assert.equal(init.sortable, 4, '4 个可排序列');

  // —— 三态排序 —— //
  let s = await sortBtn(U, '访问次数');
  let v = (await col(U, '访问次数')).map(Number);
  assert.equal(s, 'ascending', '第一次升序');
  assert.equal(v.join(','), [...v].sort((a, b) => a - b).join(','), `升序（${v}）`);
  assert.equal(v[0], 0, '全局排序后第一页是最小值');
  s = await sortBtn(U, '访问次数');
  v = (await col(U, '访问次数')).map(Number);
  assert.equal(s, 'descending', '第二次降序');
  assert.equal(v[0], 451, '降序最大值在前');
  s = await sortBtn(U, '访问次数');
  assert(s === null || s === 'none', `第三次取消（${s}）`);
  assert.equal((await col(U, '用户'))[0].startsWith('林晓'), true, '取消排序恢复原顺序');
  await sortBtn(U, '用户');
  const names = (await col(U, '用户')).map((x) => x.replace(/[a-z@.]+$/, '').replace(/^.{0,2}(?=[一-龥]{2,3}$)/, ''));
  assert(names.length === 8, '中文排序后仍为 8 行');
  await sortBtn(U, '用户'); await sortBtn(U, '用户');

  // —— 勾选 —— //
  const checks = () => page.$$eval(`${U} tbody .nv-table-check input`, (i) => i.map((x) => x.checked));
  const head = () => page.$eval(`${U} thead .nv-table-check input`, (i) => ({ c: i.checked, ind: i.indeterminate }));
  await page.click(`${U} tbody tr:nth-child(2) .nv-table-check input`);
  assert.equal((await checks()).filter(Boolean).length, 1, '勾一行');
  let hd = await head();
  assert(hd.ind && !hd.c, '表头半选');
  const bar = await page.$eval(`${U} .nv-table-bar`, (b) => ({ state: b.dataset.state, inert: b.inert, text: b.querySelector('.nv-table-bar-count').textContent }));
  assert(bar.state === 'open' && !bar.inert, '出现操作栏');
  assert(bar.text.includes('1'), `已选 1 项（${bar.text}）`);
  // Shift 连选
  await page.keyboard.down('Shift');
  await page.click(`${U} tbody tr:nth-child(5) .nv-table-check input`);
  await page.keyboard.up('Shift');
  assert.equal((await checks()).map((c) => (c ? 1 : 0)).join(''), '01111000', 'Shift 连选 2–5 行');
  // 表头全选当前页
  await page.click(`${U} thead .nv-table-check input`);
  hd = await head();
  assert(hd.c && !hd.ind, '表头全选');
  assert((await checks()).every(Boolean), '当前页全选');
  // 翻页后保持
  await page.$eval(`${U} .nv-pagination button[aria-label="下一页"]`, (b) => b.click());
  await sleep(100);
  assert((await checks()).every((c) => !c), '第 2 页未勾选');
  await page.click(`${U} tbody tr:nth-child(1) .nv-table-check input`);
  const cnt = await page.$eval(`${U} .nv-table-bar-count`, (b) => b.textContent);
  assert(cnt.includes('9'), `跨页累计 9 项（${cnt}）`);
  await page.$eval(`${U} .nv-pagination button[aria-label="上一页"]`, (b) => b.click());
  await sleep(100);
  assert((await checks()).every(Boolean), '回到第 1 页仍保持勾选');
  // 操作按钮
  await page.evaluate((U) => [...document.querySelectorAll(`${U} .nv-table-bar-btn`)].find((b) => b.textContent.includes('导出')).click(), U);
  assert((await page.$eval('#table-users-log', (el) => el.textContent)).startsWith('导出 9 位用户'), '操作按钮拿到所选行');
  await page.$eval(`${U} .nv-table-bar-clear`, (b) => b.click());
  await sleep(300);
  assert((await checks()).every((c) => !c), '清空选择');
  assert.equal(await page.$eval(`${U} .nv-table-bar`, (b) => b.dataset.state), 'closed', '操作栏收起');

  // —— 每页条数 —— //
  await page.$eval(`${U} .nv-pagination select`, (s) => { s.value = '16'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await sleep(100);
  assert.equal(await page.$$eval(`${U} tbody tr`, (r) => r.length), 16, '切换每页 16 条');
  assert((await page.$eval('#table-users-log', (el) => el.textContent)).includes('每页 16 条'), 'onChange 派发');

  // —— 固定列与吸顶 —— //
  const O = '#table-orders';
  const fixed = await page.$eval(O, (el) => {
    const wrap = el.querySelector('.nv-table-wrap');
    const first = el.querySelector('tbody tr td');
    const last = el.querySelector('tbody tr td:last-child');
    const th = el.querySelector('thead th');
    return {
      scrollable: wrap.scrollWidth > wrap.clientWidth,
      vScroll: wrap.scrollHeight > wrap.clientHeight,
      firstSticky: getComputedStyle(first).position,
      lastSticky: getComputedStyle(last).position,
      thSticky: getComputedStyle(th).position,
    };
  });
  assert(fixed.scrollable, '订单表横向可滚动');
  assert(fixed.vScroll, 'maxHeight 内部纵向滚动');
  assert(fixed.firstSticky === 'sticky' && fixed.lastSticky === 'sticky', '左右固定列 sticky');
  assert.equal(fixed.thSticky, 'sticky', '表头吸顶');
  const shadow = await page.$eval(O, async (el) => {
    const wrap = el.querySelector('.nv-table-wrap');
    const st = () => ({ l: el.querySelector('[data-scroll-left], .is-scroll-left') !== null || wrap.hasAttribute('data-scroll-left') || el.querySelector('.nv-table-container')?.dataset.scrollLeft, r: wrap.className + ' ' + JSON.stringify(wrap.dataset) + ' ' + JSON.stringify(el.querySelector('.nv-table-container').dataset) });
    const before = st();
    wrap.scrollLeft = 200;
    wrap.dispatchEvent(new Event('scroll'));
    await new Promise((r) => setTimeout(r, 100));
    const mid = st();
    wrap.scrollTop = 200;
    wrap.dispatchEvent(new Event('scroll'));
    await new Promise((r) => setTimeout(r, 100));
    const th = el.querySelector('thead th').getBoundingClientRect().top - wrap.getBoundingClientRect().top;
    return { before: before.r, mid: mid.r, thTop: Math.round(th) };
  });
  assert(shadow.before !== shadow.mid, `滚动后固定列阴影状态变化（${shadow.before} → ${shadow.mid}）`);
  assert(Math.abs(shadow.thTop) <= 1, `纵向滚动后表头贴顶（${shadow.thTop}）`);
  const ell = await page.$eval(`${O} .nv-table-ellipsis`, (s) => ({ to: getComputedStyle(s).textOverflow, title: s.title || s.closest('td').title }));
  assert(ell.to === 'ellipsis' && ell.title, '长文本省略并有 title');

  // —— 展开行 —— //
  const E = '#table-expand';
  const exp0 = await page.$eval(E, (el) => [...el.querySelectorAll('tbody .nv-table-expand-btn')].length);
  assert(exp0 > 0, '有展开按钮');
  assert.equal(await page.$eval(`${E} tbody .nv-table-expand-btn`, (b) => b.getAttribute('aria-expanded')), 'true', 'defaultExpanded 初始展开');
  await page.$eval(`${E} tbody .nv-table-expand-btn`, (b) => b.click());
  await sleep(500);
  assert(!(await page.$eval(E, (el) => !!el.querySelector('.nv-table-expanded-row'))), '点击收起并移除展开行');
  await page.$eval(`${E} tbody .nv-table-expand-btn`, (b) => b.click());
  await sleep(400);
  const ex = await page.$eval(E, (el) => {
    const b = el.querySelector('tbody .nv-table-expand-btn');
    const row = document.getElementById(b.getAttribute('aria-controls'));
    return { expanded: b.getAttribute('aria-expanded'), row: !!row, h: row ? row.getBoundingClientRect().height : 0 };
  });
  assert(ex.expanded === 'true' && ex.row && ex.h > 20, `展开（${JSON.stringify(ex)}）`);
  // 整行点击也能切换（expandOnRowClick）
  await page.$eval(`${E} tbody tr td:nth-child(3)`, (td) => td.click());
  await sleep(500);
  const col2 = await page.$eval(E, (el) => el.querySelector('tbody .nv-table-expand-btn').getAttribute('aria-expanded'));
  assert.equal(col2, 'false', '点击整行收起');
  const noExp = await page.$eval(E, (el) => [...el.querySelectorAll('tbody tr:not(.nv-table-expanded-row)')].some((tr) => !tr.querySelector('.nv-table-expand-btn')));
  assert(noExp, 'rowExpandable=false 的行没有展开按钮');

  // —— 远程 —— //
  const R = '#table-remote';
  await sleep(800);
  let rem = await page.$eval(R, (el) => ({ rows: el.querySelectorAll('tbody tr:not(.nv-table-skeleton-row)').length, first: el.querySelector('tbody td:nth-child(2)')?.textContent }));
  assert.equal(rem.rows, 5, '远程首屏 5 行');
  await page.$eval(`${R} .nv-pagination button[aria-label="下一页"]`, (b) => b.click());
  await sleep(150);
  const loading = await page.$eval(`${R} .nv-table-mask`, (m) => !m.hidden);
  assert(loading, '翻页时显示加载遮罩');
  await sleep(800);
  rem = await page.$eval(R, (el) => ({ first: el.querySelector('tbody td:nth-child(2)')?.textContent, mask: el.querySelector('.nv-table-mask').hidden }));
  assert.equal(rem.first, 'EVT-4115', '第 2 页数据回填');
  assert(rem.mask, '加载完成隐藏遮罩');
  await sortBtn(R, '触发次数');
  await sleep(800);
  const cnts = (await col(R, '触发次数')).map(Number);
  assert.equal(cnts.join(','), [...cnts].sort((a, b) => a - b).join(','), '远程排序结果');
  await page.click('#table-remote-empty');
  await sleep(800);
  const empty = await page.$eval(R, (el) => el.querySelector('.nv-table-empty')?.textContent.trim());
  assert.equal(empty, '没有符合条件的告警', '空状态文字');

  // —— 安全渲染与行键盘 —— //
  const S = '#table-safe';
  const safe = await page.$eval(S, (el) => ({ html: el.querySelectorAll('tbody img, tbody script, tbody b').length, tabbable: el.querySelector('tbody tr').tabIndex }));
  assert.equal(safe.html, 0, '字符串按纯文本插入');
  assert.equal(safe.tabbable, 0, '可点击行可 Tab 聚焦');
  await page.focus(`${S} tbody tr`);
  await page.keyboard.press('ArrowDown');
  const focused = await page.evaluate((S) => [...document.querySelectorAll(`${S} tbody tr`)].indexOf(document.activeElement), S);
  assert.equal(focused, 1, '↓ 移到下一行');
  await page.keyboard.press('End');
  const lastIdx = await page.evaluate((S) => [...document.querySelectorAll(`${S} tbody tr`)].indexOf(document.activeElement), S);
  assert.equal(lastIdx, (await page.$$eval(`${S} tbody tr`, (r) => r.length)) - 1, 'End 到末行');
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  assert((await page.$eval('#table-safe-log', (el) => el.textContent)).startsWith('打开工单'), 'Enter 打开');
  await page.keyboard.press('Space');
  assert(await page.$eval(`${S} tbody tr .nv-table-check input`, (i) => i.checked), '空格勾选');
};
