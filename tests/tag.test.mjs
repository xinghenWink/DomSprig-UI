// Tag：关闭按钮生成与 aria-label、nv:close 可取消、关闭后焦点转移、hide 模式、可选标签组多选/单选/必选、Nova.tag API
export default async ({ page, assert, sleep }) => {
  const live = (sel) => page.$eval(sel, (g) => [...g.querySelectorAll('.nv-tag')].filter((t) => !t.hidden && t.isConnected && t.dataset.state !== 'closed').map((t) => { const c = t.cloneNode(true); c.querySelectorAll('.nv-avatar, .nv-tag-close').forEach((n) => n.remove()); return c.textContent.trim(); }));

  // —— 关闭按钮 —— //
  const btns = await page.$$eval('#tag-close-demo .nv-tag-close', (b) => b.map((x) => x.getAttribute('aria-label')));
  assert.equal(btns.length, 5, '每个 data-closable 标签都有关闭按钮');
  assert.equal(btns[0], '移除 设计系统', '关闭按钮 aria-label');
  assert.equal(btns[3], '移除 周屿', '头像文字不进 aria-label');

  await page.click('#tag-close-demo .nv-tag:nth-child(2) .nv-tag-close');
  await sleep(400);
  assert.equal((await live('#tag-close-demo')).join('|'), '设计系统|国际化|周屿|不可删除', '点击关闭移除标签');
  assert.equal(await page.$eval('#tag-close-log', (el) => el.textContent), 'nv:close → 组件库', 'nv:close 带 value');
  const focus = await page.evaluate(() => document.activeElement.getAttribute('aria-label'));
  assert.equal(focus, '移除 国际化', '关闭后焦点移到相邻标签的关闭按钮');

  await page.click('#tag-close-demo .nv-tag[data-locked] .nv-tag-close');
  await sleep(400);
  assert((await live('#tag-close-demo')).includes('不可删除'), 'preventDefault 阻止关闭');
  assert.equal(await page.$eval('#tag-close-log', (el) => el.textContent), '已阻止关闭：不可删除', '阻止时日志');

  // —— hide 模式与 API —— //
  const hide = await page.evaluate(async () => {
    const t = document.createElement('span');
    t.className = 'nv-tag';
    t.dataset.closable = 'hide';
    t.textContent = '临时';
    document.getElementById('tag-close-demo').append(t);
    Nova.init(t);
    t.querySelector('.nv-tag-close').click();
    await new Promise((r) => setTimeout(r, 400));
    return { connected: t.isConnected, hidden: t.hidden || getComputedStyle(t).display === 'none' };
  });
  assert(hide.connected && hide.hidden, 'data-closable="hide" 只隐藏不移除');

  // —— 多选组 —— //
  const pressed = (sel) => page.$eval(sel, (g) => [...g.querySelectorAll('.nv-tag[aria-pressed="true"]')].map((t) => t.dataset.value));
  await page.click('#tag-filter [data-value="vue"]');
  await page.click('#tag-filter [data-value="svelte"]');
  await page.click('#tag-filter [data-value="react"]');
  await sleep(50);
  assert.equal((await pressed('#tag-filter')).join(','), 'vue,svelte', '多选切换');
  assert.equal(await page.$eval('#tag-filter-log', (el) => el.textContent), 'value: ["vue","svelte"]', '组派发 nv:change');
  await page.$eval('#tag-filter [data-value="angular"]', (b) => b.click());
  assert(!(await pressed('#tag-filter')).includes('angular'), '禁用标签不可选');
  await page.focus('#tag-filter [data-value="solid"]');
  await page.keyboard.press('Space');
  await sleep(50);
  assert((await pressed('#tag-filter')).includes('solid'), '键盘空格切换');

  // —— 单选必选 —— //
  await page.click('#tag-single [data-value="month"]');
  await sleep(50);
  assert.equal((await pressed('#tag-single')).join(','), 'month', '单选互斥');
  await page.click('#tag-single [data-value="month"]');
  await sleep(50);
  assert.equal((await pressed('#tag-single')).join(','), 'month', '必选时不能取消最后一个');
  assert.equal(await page.$eval('#tag-single-log', (el) => el.textContent), 'value: ["month"]', '单选日志');

  // —— group.value 读写 —— //
  const v = await page.evaluate(() => {
    const g = Nova.get(document.getElementById('tag-filter'), 'tag-group');
    g.value = ['react', 'solid'];
    const pressedNow = [...document.querySelectorAll('#tag-filter [aria-pressed="true"]')].map((t) => t.dataset.value).join(',');
    return { read: g.value.join(','), pressedNow };
  });
  assert.equal(v.read, 'react,solid', 'value 可写');
  assert.equal(v.pressedNow, 'react,solid', '写入后同步 aria-pressed');

  const tog = await page.evaluate(() => {
    const t = document.querySelector('#tag-filter [data-value="vue"]');
    Nova.tag.toggle(t, true);
    const a = t.getAttribute('aria-pressed');
    Nova.tag.toggle(t);
    return a + ',' + t.getAttribute('aria-pressed');
  });
  assert.equal(tog, 'true,false', 'Nova.tag.toggle');
};
