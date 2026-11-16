// Breadcrumb：ARIA、aria-current 自动补全、折叠中间项、下拉菜单列出被折叠项、refresh、省略号
export default async ({ page, assert, sleep }) => {
  const base = await page.evaluate(() => {
    const nav = document.querySelector('.nv-breadcrumb');
    return {
      label: nav.getAttribute('aria-label'),
      current: nav.querySelectorAll('[aria-current="page"]').length,
      second: document.querySelectorAll('.nv-breadcrumb')[1].querySelector('[aria-current]')?.textContent.trim(),
    };
  });
  assert.equal(base.label, '面包屑', '自动补 aria-label');
  assert.equal(base.current, 1, '只有一个当前页');
  assert.equal(base.second, 'nova-ui', '最后一项自动设为 aria-current');

  // —— 折叠 —— //
  const sel = '.nv-breadcrumb[data-max="4"]';
  const fold = await page.$eval(sel, (nav) => {
    const lis = [...nav.querySelectorAll('ol > li')];
    const shown = lis.filter((li) => !li.hidden && getComputedStyle(li).display !== 'none');
    return {
      shown: shown.map((li) => li.textContent.trim() || '…'),
      more: nav.querySelector('.nv-breadcrumb-more')?.getAttribute('aria-label'),
    };
  });
  assert.equal(fold.shown.join('|'), '首页|…|评审记录|第 3 次评审', `保留首项和最后两项（${fold.shown}）`);
  assert.equal(fold.more, '显示其余 4 级', '折叠按钮有 aria-label');

  // —— 点开下拉 —— //
  await page.click(`${sel} .nv-breadcrumb-more`);
  await sleep(300);
  const menu = await page.evaluate(() => {
    const p = [...document.querySelectorAll('.nv-dropdown-panel, [role="menu"]')].find((x) => x.offsetParent !== null || x.getClientRects().length);
    return p ? { items: [...p.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent.trim()), hrefs: [...p.querySelectorAll('a[role="menuitem"]')].length } : null;
  });
  assert(menu, '点击「…」打开下拉菜单');
  assert.equal(menu.items.join('|'), '团队空间|设计组|2026 规划|组件库', '菜单列出被折叠的项');
  assert.equal(menu.hrefs, 4, '菜单项保留链接');
  assert.equal(await page.$eval(`${sel} .nv-breadcrumb-more`, (b) => b.getAttribute('aria-expanded')), 'true', 'aria-expanded=true');
  await page.keyboard.press('Escape');
  await sleep(300);
  assert.equal(await page.$eval(`${sel} .nv-breadcrumb-more`, (b) => b.getAttribute('aria-expanded')), 'false', 'Esc 关闭');
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains('nv-breadcrumb-more')), true, '关闭后焦点回到按钮');

  // —— refresh：删掉中间项后不再折叠 —— //
  const after = await page.$eval(sel, (nav) => {
    const lis = [...nav.querySelectorAll('ol > li:not([data-nv-breadcrumb-more])')];
    lis.slice(1, 4).forEach((li) => li.remove());
    Nova.get(nav, 'breadcrumb').refresh();
    return { more: !!nav.querySelector('.nv-breadcrumb-more'), shown: [...nav.querySelectorAll('ol > li')].filter((li) => !li.hidden).length };
  });
  assert(!after.more, '项数不超过 max 时去掉折叠按钮');
  assert.equal(after.shown, 4, '全部显示');

  // —— 省略号 —— //
  const ell = await page.$eval('.nv-breadcrumb[data-variant="pill"] [aria-current]', (el) => ({
    over: el.scrollWidth > el.clientWidth,
    to: getComputedStyle(el).textOverflow,
    w: el.getBoundingClientRect().width,
  }));
  assert(ell.over && ell.to === 'ellipsis', '长文字溢出省略');
  assert(ell.w <= 161, `不超过 --nv-breadcrumb-item-max（${ell.w}）`);
};
