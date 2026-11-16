// DatePicker：结构与 ARIA、文字输入解析、点选、键盘、月/年面板、日期时间、min/max/disabledDate、范围选择与预设、清除、只读禁用、表单重置
export default async ({ page, assert, sleep }) => {
  const vis = (natId) => `#${natId} + .nv-date .nv-date-input`;
  const panel = () => page.evaluate(() => {
    const p = document.querySelector('.nv-date-panel:not([data-state="closed"])');
    if (!p) return null;
    return {
      titles: [...p.querySelectorAll('.nv-date-cal .nv-date-title')].map((t) => t.textContent.trim()),
      selected: [...p.querySelectorAll('.nv-date-cell[aria-selected="true"]:not([data-outside]) .nv-date-day')].map((b) => b.textContent),
      active: p.querySelector('.nv-date-cell[data-active] .nv-date-day')?.textContent || null,
      presets: [...p.querySelectorAll('.nv-date-preset')].map((b) => b.textContent),
      time: !!p.querySelector('.nv-date-time'),
      cals: p.querySelectorAll('.nv-date-grid').length,
    };
  });
  const clickDay = (n, cal = 0) => page.evaluate((n, cal) => {
    const grid = document.querySelectorAll('.nv-date-panel:not([data-state="closed"]) .nv-date-grid')[cal];
    const b = [...grid.querySelectorAll('.nv-date-cell:not([data-outside]) .nv-date-day')].find((x) => x.textContent === String(n));
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, n, cal);
  const typeInto = async (sel, text) => {
    await page.click(sel, { count: 3 });
    await page.keyboard.press('Escape');
    await page.$eval(sel, (el) => { el.select(); });
    await page.keyboard.type(text);
  };
  const outside = async () => { await page.mouse.click(5, 5); await sleep(250); };

  // —— 结构 —— //
  const init = await page.evaluate(() => {
    const nat = document.getElementById('date-basic');
    const input = nat.nextElementSibling.querySelector('.nv-date-input');
    return {
      natHidden: nat.getAttribute('aria-hidden') === 'true' && nat.tabIndex === -1,
      role: input.getAttribute('role'),
      popup: input.getAttribute('aria-haspopup'),
      labelled: document.getElementById(input.getAttribute('aria-labelledby'))?.textContent,
      ph: input.placeholder,
    };
  });
  assert(init.natHidden, '原生 input 隐藏且移出 Tab 序列');
  assert.equal(init.role, 'combobox', 'role=combobox');
  assert.equal(init.popup, 'dialog', 'aria-haspopup=dialog');
  assert.equal(init.labelled, '出发日期', 'label 关联到可见输入框');

  // —— 文字输入 —— //
  await page.evaluate(() => {
    window.__ev = [];
    const nat = document.getElementById('date-basic');
    nat.addEventListener('change', () => window.__ev.push(`change:${nat.value}`));
    nat.addEventListener('input', () => window.__ev.push(`input:${nat.value}`));
  });
  for (const [text, want] of [['2026年10月24日', '2026-10-24'], ['20261025', '2026-10-25'], ['2026.10.26', '2026-10-26'], ['2026/10/27', '2026-10-27']]) {
    await typeInto(vis('date-basic'), text);
    await page.keyboard.press('Enter');
    await sleep(80);
    assert.equal(await page.$eval('#date-basic', (el) => el.value), want, `解析「${text}」`);
  }
  assert.equal(await page.$eval(vis('date-basic'), (el) => el.value), '2026/10/27', '显示为 YYYY/MM/DD');
  assert(await page.evaluate(() => window.__ev.includes('change:2026-10-27') && window.__ev.includes('input:2026-10-27')), '原生 input/change 派发');
  await typeInto(vis('date-basic'), '乱写');
  await page.keyboard.press('Enter');
  await sleep(80);
  assert.equal(await page.$eval('#date-basic', (el) => el.value), '2026-10-27', '无法识别时值不变');
  assert.equal(await page.$eval(vis('date-basic'), (el) => el.value), '2026/10/27', '无法识别时还原文字');
  await typeInto(vis('date-basic'), '2026-02-30');
  await page.keyboard.press('Enter');
  await sleep(80);
  assert.equal(await page.$eval('#date-basic', (el) => el.value), '2026-10-27', '不存在的日期被拒绝');
  await outside();

  // —— 点击打开，点选 —— //
  await page.click(vis('date-basic'));
  await sleep(250);
  let p = await panel();
  assert(p, '点击打开面板');
  assert.equal(p.titles[0], '2026年10月', '打开到当前值所在月份');
  assert.equal(p.selected.join(','), '27', '当前值高亮');
  assert.equal(await page.$eval(vis('date-basic'), (el) => el.getAttribute('aria-expanded')), 'true', 'aria-expanded=true');
  await clickDay(12);
  await sleep(250);
  assert.equal(await page.$eval('#date-basic', (el) => el.value), '2026-10-12', '点选写回值');
  assert.equal(await panel(), null, '点选后关闭');
  assert.equal(await page.$eval('#date-basic-log', (el) => el.textContent.includes('2026-10-12')), true, '示例日志更新');

  // —— 键盘 —— //
  await page.focus(vis('date-basic'));
  await page.keyboard.press('ArrowDown');
  await sleep(250);
  assert(await panel(), '↓ 打开');
  await page.keyboard.press('ArrowDown'); // 进入游标模式（停在当前值）
  await page.keyboard.press('ArrowDown'); // +7
  await page.keyboard.press('ArrowRight'); // +1
  await sleep(50);
  p = await panel();
  assert.equal(p.active, '20', `方向键移动游标（${p.active}）`);
  const ad = await page.$eval(vis('date-basic'), (el) => el.getAttribute('aria-activedescendant'));
  assert(ad && ad.endsWith(String(2026 * 10000 + 9 * 100 + 20)), 'aria-activedescendant 指向游标格');
  await page.keyboard.press('PageDown');
  await sleep(50);
  p = await panel();
  assert.equal(p.titles[0], '2026年11月', 'PageDown 下个月');
  assert.equal(p.active, '20', 'PageDown 保持日期');
  await page.keyboard.press('Enter');
  await sleep(250);
  assert.equal(await page.$eval('#date-basic', (el) => el.value), '2026-11-20', 'Enter 选中游标日期');
  assert.equal(await panel(), null, 'Enter 后关闭');
  await page.keyboard.press('ArrowDown');
  await sleep(200);
  await page.keyboard.press('Escape');
  await sleep(250);
  assert.equal(await panel(), null, 'Esc 关闭');
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains('nv-date-input')), true, 'Esc 后焦点留在输入框');

  // —— 月份 / 年份面板 —— //
  await page.click(vis('date-basic'));
  await sleep(250);
  await page.click('.nv-date-panel .nv-date-title-btn[data-act="month"]');
  await sleep(150);
  const months = await page.$$eval('.nv-date-panel .nv-date-pick[data-month]', (b) => b.length);
  assert.equal(months, 12, '月份面板 12 个');
  await page.click('.nv-date-panel .nv-date-pick[data-month="2"]');
  await sleep(150);
  assert.equal((await panel()).titles[0], '2026年3月', '选月份回到日视图');
  await page.click('.nv-date-panel .nv-date-title-btn[data-act="year"]');
  await sleep(150);
  const years = await page.$$eval('.nv-date-panel .nv-date-pick[data-year]', (b) => b.map((x) => x.dataset.year));
  assert(years.includes('2026') && years.length >= 10, '年份面板');
  await page.click('.nv-date-panel .nv-date-pick[data-year="2028"]');
  await sleep(150);
  await page.click('.nv-date-panel .nv-date-pick[data-month="0"]');
  await sleep(150);
  assert.equal((await panel()).titles[0], '2028年1月', '年 → 月 → 日');
  await page.click('.nv-date-panel .nv-date-nav[data-act="prev"]');
  await sleep(100);
  assert.equal((await panel()).titles[0], '2027年12月', '上一月跨年');
  await outside();
  assert.equal(await panel(), null, '点外部关闭');
  assert.equal(await page.$eval('#date-basic', (el) => el.value), '2026-11-20', '只浏览不改值');

  // —— 清除 —— //
  const clearVisible = await page.$eval('#date-basic + .nv-date .nv-date-clear', (b) => !b.hidden && getComputedStyle(b).display !== 'none');
  assert(clearVisible, '有值时显示清除按钮');
  await page.click('#date-basic + .nv-date .nv-date-clear');
  await sleep(150);
  assert.equal(await page.$eval('#date-basic', (el) => el.value), '', '清除');
  assert.equal(await page.$eval('#date-basic + .nv-date .nv-date-clear', (b) => getComputedStyle(b).display), 'none', '清除后隐藏按钮');
  await outside();

  // —— 日期时间 —— //
  await page.click(vis('date-time'));
  await sleep(300);
  p = await panel();
  assert(p.time, '显示时间列');
  const tm = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.nv-date-panel .nv-date-time-item[data-unit="m"]')].map((x) => x.dataset.n);
    const selH = document.querySelector('.nv-date-panel .nv-date-time-item[data-unit="h"][aria-selected="true"]')?.dataset.n;
    const selM = document.querySelector('.nv-date-panel .nv-date-time-item[data-unit="m"][aria-selected="true"]')?.dataset.n;
    return { step: items.slice(0, 3).join(','), n: items.length, selH, selM };
  });
  assert.equal(tm.step, '0,5,10', '分钟步长 5');
  assert.equal(tm.n, 12, '分钟列 12 项');
  assert.equal(`${tm.selH}:${tm.selM}`, '14:30', '当前时间高亮');
  await page.click('.nv-date-panel .nv-date-time-item[data-unit="h"][data-n="9"]');
  await page.click('.nv-date-panel .nv-date-time-item[data-unit="m"][data-n="45"]');
  await sleep(100);
  assert.equal(await page.$eval('#date-time', (el) => el.value), '2026-11-20T09:45', '点时间写回值');
  assert(await panel(), '选时间不关闭面板');
  await clickDay(3);
  await sleep(100);
  assert.equal(await page.$eval('#date-time', (el) => el.value), '2026-11-03T09:45', '改日期保留时间');
  assert(await panel(), '日期时间选日期后不关闭');
  await page.click('.nv-date-panel .nv-date-foot-btn[data-act="ok"]');
  await sleep(250);
  assert.equal(await panel(), null, '确定关闭');
  assert.equal(await page.$eval(vis('date-time'), (el) => el.value), '2026/11/03 09:45', '显示日期 + 时间');
  await typeInto(vis('date-time'), '2026-12-01 08:07');
  await page.keyboard.press('Enter');
  await sleep(80);
  assert.equal(await page.$eval('#date-time', (el) => el.value), '2026-12-01T08:07', '手输日期时间');
  await outside();

  // —— min / max / disabledDate —— //
  await page.click(vis('date-minmax'));
  await sleep(250);
  const mm = await page.evaluate(() => {
    const nat = document.getElementById('date-minmax');
    const cells = [...document.querySelectorAll('.nv-date-panel .nv-date-cell[id]:not([data-outside])')];
    const t = new Date();
    const todayCell = cells.find((c) => c.querySelector('[data-today]'));
    const before = cells.filter((c) => c._date < new Date(t.getFullYear(), t.getMonth(), t.getDate()));
    return {
      min: nat.min, max: nat.max,
      todayOn: todayCell && todayCell.getAttribute('aria-disabled') !== 'true',
      beforeOff: before.every((c) => c.getAttribute('aria-disabled') === 'true' && c.querySelector('button').disabled),
      beforeN: before.length,
    };
  });
  assert(mm.min && mm.max, '示例设置了 min / max');
  assert(mm.todayOn, '今天可选');
  assert(mm.beforeOff, `min 之前的日期禁用（${mm.beforeN} 个）`);
  await outside();
  const weekend = await page.evaluate(() => {
    const nat = document.querySelectorAll('[data-nv-date]')[3];
    nat.nextElementSibling.querySelector('.nv-date-input').click();
    return new Promise((r) => setTimeout(() => {
      const cells = [...document.querySelectorAll('.nv-date-panel:not([data-state="closed"]) .nv-date-cell[id]')];
      r(cells.filter((c) => c._date.getDay() % 6 === 0).every((c) => c.getAttribute('aria-disabled') === 'true')
        && cells.some((c) => c._date.getDay() % 6 !== 0 && c.getAttribute('aria-disabled') !== 'true'));
    }, 250));
  });
  assert(weekend, 'disabledDate 禁用周末');
  await outside();

  // —— 范围 —— //
  await page.setViewport({ width: 1280, height: 1000 });
  await page.click(vis('date-range'));
  await sleep(300);
  p = await panel();
  assert.equal(p.cals, 2, '宽屏并排两个月');
  assert.equal(p.presets.join('|'), '今天|最近 7 天|最近 30 天|本月|上月', '默认预设');
  const [t0, t1] = p.titles;
  await clickDay(10);
  await sleep(80);
  assert(await page.evaluate(() => document.querySelector('.nv-date-panel').hasAttribute('data-pending')), '点起点后进入待选状态');
  await clickDay(5);
  await sleep(250);
  const rv = await page.$eval('#date-range', (el) => el.value);
  const ym = await page.evaluate((t) => { const m = /(\d+)年(\d+)月/.exec(t); return `${m[1]}-${String(m[2]).padStart(2, '0')}`; }, t0);
  assert.equal(rv, `${ym}-05/${ym}-10`, `先点后点哪端都可以（${rv}）`);
  assert.equal(await panel(), null, '选完终点关闭');
  assert(await page.$eval('#date-range-log', (el, v) => el.textContent.includes(v), rv), '示例日志更新');
  await page.click(vis('date-range'));
  await sleep(300);
  p = await panel();
  assert.equal(p.selected.length, 6, '再次打开显示区间（6 天）');
  await clickDay(28);
  await clickDay(3, 1);
  await sleep(250);
  const ym2 = await page.evaluate((t) => { const m = /(\d+)年(\d+)月/.exec(t); return `${m[1]}-${String(m[2]).padStart(2, '0')}`; }, t1);
  assert.equal(await page.$eval('#date-range', (el) => el.value), `${ym}-28/${ym2}-03`, '跨月区间');
  await page.click(vis('date-range'));
  await sleep(300);
  await page.evaluate(() => [...document.querySelectorAll('.nv-date-panel .nv-date-preset')].find((b) => b.textContent === '最近 7 天').click());
  await sleep(250);
  const r7 = await page.evaluate(() => {
    const [a, b] = document.getElementById('date-range').value.split('/').map((s) => new Date(`${s}T00:00`));
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return { days: Math.round((b - a) / 864e5) + 1, endToday: b.getTime() === t.getTime() };
  });
  assert(r7.days === 7 && r7.endToday, '「最近 7 天」= 今天往前 7 天');
  await typeInto(vis('date-range'), '2026-01-05 - 2026-01-02');
  await page.keyboard.press('Enter');
  await sleep(80);
  assert.equal(await page.$eval('#date-range', (el) => el.value), '2026-01-02/2026-01-05', '手输区间并自动排序');
  await outside();

  // —— 自定义预设 —— //
  await page.click(vis('date-presets-js'));
  await sleep(300);
  p = await panel();
  assert(p.presets.length > 0, '自定义预设显示');
  await outside();
  const noPreset = await page.evaluate(() => {
    const nat = [...document.querySelectorAll('[data-nv-date-range]')].find((x) => x.dataset.presets === 'false');
    if (!nat) return 'missing';
    nat.nextElementSibling.querySelector('.nv-date-input').click();
    return new Promise((r) => setTimeout(() => r(!document.querySelector('.nv-date-panel:not([data-state="closed"]) .nv-date-presets')), 250));
  });
  assert.equal(noPreset, true, 'data-presets="false" 关闭预设栏');
  await outside();

  // —— 窄屏一个月 —— //
  await page.setViewport({ width: 420, height: 900 });
  await page.click(vis('date-range'));
  await sleep(300);
  p = await panel();
  assert.equal(p.cals, 1, '窄屏只显示一个月');
  const fit = await page.evaluate(() => { const r = document.querySelector('.nv-date-panel').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; });
  assert(fit, '窄屏面板不超出视口');
  await outside();
  await page.setViewport({ width: 1280, height: 860 });

  // —— 只读 / 禁用 —— //
  const states = await page.evaluate(async () => {
    const out = {};
    for (const nat of document.querySelectorAll(':is([data-nv-date], [data-nv-date-range]):is([readonly], [disabled])')) {
      const inp = nat.nextElementSibling.querySelector('.nv-date-input');
      inp.click();
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await new Promise((r) => setTimeout(r, 200));
      out[nat.disabled ? 'disabled' : 'readonly'] = !!document.querySelector('.nv-date-panel:not([data-state="closed"])');
    }
    return out;
  });
  assert(states.readonly === false && states.disabled === false, `只读、禁用不弹出（${JSON.stringify(states)}）`);

  // —— 尺寸 —— //
  const hs = await page.evaluate(() => ['小号日期', '默认日期', '大号日期'].map((l) => document.querySelector(`[aria-label="${l}"] + .nv-date`).getBoundingClientRect().height));
  assert.equal(hs.join(','), '32,38,44', 'sm / md / lg 高度');

  // —— 弹窗内：Esc 先关面板，表单重置 —— //
  await page.click('#date-dialog-open');
  await sleep(300);
  const dlgInput = await page.evaluate(() => {
    const nat = document.querySelector('#date-dialog [data-nv-date], #date-dialog [data-nv-date-range]');
    const inp = nat.nextElementSibling.querySelector('.nv-date-input');
    inp.id = inp.id || 'dlg-date';
    return `#${CSS.escape(inp.id)}`;
  });
  await page.click(dlgInput);
  await sleep(300);
  const inDialog = await page.evaluate(() => !!document.querySelector('#date-dialog .nv-date-panel:not([data-state="closed"])'));
  assert(inDialog, '面板挂到 dialog 内');
  await page.keyboard.press('Escape');
  await sleep(300);
  const st = await page.evaluate(() => ({ dialog: document.getElementById('date-dialog').open, panel: !!document.querySelector('.nv-date-panel:not([data-state="closed"])') }));
  assert(st.dialog && !st.panel, '第一次 Esc 只关面板');
  await page.keyboard.press('Escape');
  await sleep(300);
  assert.equal(await page.evaluate(() => document.getElementById('date-dialog').open), false, '第二次 Esc 关弹窗');

  const reset = await page.evaluate(async () => {
    const form = document.createElement('form');
    form.innerHTML = '<input type="date" name="d" data-nv-date value="2026-05-01">';
    document.querySelector('.doc-preview').append(form);
    Nova.init(form);
    const nat = form.querySelector('input[name="d"]');
    nat.value = '2026-06-02';
    Nova.datepicker.refresh(nat);
    const shownAfterRefresh = form.querySelector('.nv-date-input').value;
    form.reset();
    await new Promise((r) => setTimeout(r, 50));
    return { refresh: shownAfterRefresh, after: nat.value, shown: form.querySelector('.nv-date-input').value };
  });
  assert.equal(reset.refresh, '2026/06/02', 'refresh 同步显示');
  assert.equal(reset.after, '2026-05-01', 'reset 恢复默认值');
  assert.equal(reset.shown, '2026/05/01', 'reset 后显示同步');
};
