// Tag Input：回车/逗号/中文逗号添加、退格两段删除、点 × 删除、隐藏域、粘贴拆分、上限、校验、空格分隔、实例 API、表单重置
export default async ({ page, assert, sleep }) => {
  const tags = (sel) => page.$eval(sel, (el) => [...el.querySelectorAll('.nv-tag:not([data-state="closed"])')].map((t) => t.dataset.value));
  const field = (sel) => `${sel} .nv-tag-input-field`;

  // —— 结构 —— //
  const init = await page.$eval('#ti-basic', (el) => ({
    control: el.classList.contains('nv-control'),
    role: el.getAttribute('role'),
    label: el.querySelector('.nv-tag-input-field').getAttribute('aria-label'),
    ph: el.querySelector('.nv-tag-input-field').placeholder,
  }));
  assert(init.control, '外框复用 .nv-control');
  assert.equal(init.role, 'group', 'role=group');
  assert.equal(init.label, '标签', '输入框继承 aria-label');
  assert.equal(init.ph, '输入标签，回车确认', '占位文字');

  // —— 回车、逗号、中文逗号 —— //
  await page.evaluate(() => {
    window.__ev = [];
    const el = document.getElementById('ti-basic');
    ['nv:add', 'nv:remove', 'nv:change', 'nv:invalid'].forEach((t) => el.addEventListener(t, (e) => window.__ev.push(`${t}:${e.detail.value ?? e.detail.values.join('/')}`)));
  });
  await page.click(field('#ti-basic'));
  await page.keyboard.type('设计');
  await page.keyboard.press('Enter');
  await page.keyboard.type('前端,');
  await page.keyboard.type('动效，');
  await sleep(100);
  assert.equal((await tags('#ti-basic')).join('|'), '设计|前端|动效', '回车、逗号、中文逗号都能确认');
  assert.equal(await page.$eval(field('#ti-basic'), (el) => el.value), '', '确认后清空输入框');
  const hidden = await page.$eval('#ti-basic', (el) => [...el.querySelectorAll('input[type="hidden"][name="tags"]')].map((i) => i.value).join('|'));
  assert.equal(hidden, '设计|前端|动效', '每个标签一个隐藏域');
  assert.equal(await page.$eval('#ti-log', (el) => el.textContent), 'values = [设计, 前端, 动效]', 'nv:change 更新日志');

  // —— 空输入时逗号不留下字符 —— //
  await page.keyboard.type(',');
  assert.equal(await page.$eval(field('#ti-basic'), (el) => el.value), '', '空输入时分隔符被吞掉');

  // —— 重复默认拒绝，留在输入框 —— //
  await page.keyboard.type('设计');
  await page.keyboard.press('Enter');
  await sleep(50);
  assert.equal((await tags('#ti-basic')).length, 3, '重复被拒绝');
  assert.equal(await page.$eval(field('#ti-basic'), (el) => el.value), '设计', '被拒绝的值留在输入框');
  assert(await page.evaluate(() => window.__ev.includes('nv:invalid:设计')), '派发 nv:invalid');
  await page.$eval(field('#ti-basic'), (el) => { el.value = ''; });

  // —— 退格：先选中，再删除 —— //
  await page.keyboard.press('Backspace');
  const pending = await page.$eval('#ti-basic', (el) => el.querySelector('.nv-tag:last-of-type')?.hasAttribute('data-pending'));
  assert(pending, '第一次退格选中最后一个标签');
  assert.equal((await tags('#ti-basic')).length, 3, '第一次退格不删除');
  await page.keyboard.press('Backspace');
  await sleep(350);
  assert.equal((await tags('#ti-basic')).join('|'), '设计|前端', '第二次退格删除');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('x');
  const cleared = await page.$eval('#ti-basic', (el) => !el.querySelector('[data-pending]'));
  assert(cleared, '继续输入时取消选中');
  await page.$eval(field('#ti-basic'), (el) => { el.value = ''; });

  // —— 点 × 删除 —— //
  await page.click('#ti-basic .nv-tag[data-value="设计"] .nv-tag-close');
  await sleep(350);
  assert.equal((await tags('#ti-basic')).join('|'), '前端', '点 × 删除');
  assert.equal(await page.evaluate(() => document.activeElement.className), 'nv-tag-input-field', '删除后焦点回到输入框');
  assert.equal(await page.$eval('#ti-basic', (el) => el.querySelectorAll('input[type="hidden"]').length), 1, '隐藏域同步删除');

  // —— nv:add 可取消 —— //
  await page.evaluate(() => {
    document.getElementById('ti-basic').addEventListener('nv:add', (e) => { if (e.detail.value === '禁止') e.preventDefault(); });
  });
  await page.keyboard.type('禁止');
  await page.keyboard.press('Enter');
  assert.equal((await tags('#ti-basic')).join('|'), '前端', 'nv:add 被取消时不添加');
  await page.$eval(field('#ti-basic'), (el) => { el.value = ''; });

  // —— 粘贴拆分 —— //
  await page.evaluate(() => {
    const input = document.querySelector('#ti-basic .nv-tag-input-field');
    const dt = new DataTransfer();
    dt.setData('text/plain', 'a, b\nc');
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  assert.equal((await tags('#ti-basic')).join('|'), '前端|a|b|c', '粘贴按逗号和换行拆分');

  // —— 失焦时提交未确认的输入 —— //
  await page.keyboard.type('blur');
  await page.click('body', { offset: { x: 5, y: 5 } });
  assert.equal((await tags('#ti-basic')).slice(-1)[0], 'blur', '失焦时把输入变成标签');

  // —— 点外框空白聚焦输入框 —— //
  await page.$eval('#ti-basic', (el) => el.click());
  assert.equal(await page.evaluate(() => document.activeElement.closest('.nv-tag-input')?.id), 'ti-basic', '点外框聚焦输入框');

  // —— 初始值与上限 —— //
  const sk = 'div[aria-label="技能"]';
  assert.equal((await tags(sk)).join('|'), '设计|前端|动效', 'data-value 初始标签');
  await page.click(field(sk));
  await page.keyboard.type('a,b,c,');
  await sleep(50);
  const full = await page.$eval(sk, (el) => ({ n: el.querySelectorAll('.nv-tag').length, full: el.classList.contains('is-full') }));
  assert.equal(full.n, 5, '最多 5 个');
  assert(full.full, '满了加 is-full');

  // —— 校验 —— //
  await page.click(field('#ti-valid'));
  await page.keyboard.type('ABC');
  await page.keyboard.press('Enter');
  assert.equal(await page.$eval('#ti-valid-log', (el) => el.textContent), '拒绝「ABC」：只接受小写字母', 'pattern 校验');
  await page.$eval(field('#ti-valid'), (el) => { el.value = ''; });
  await page.keyboard.type('abcdefghij');
  await page.keyboard.press('Enter');
  assert.equal(await page.$eval('#ti-valid-log', (el) => el.textContent), '拒绝「abcdefghij」：太长了', 'maxlength 校验');
  await page.$eval(field('#ti-valid'), (el) => { el.value = ''; });
  await page.keyboard.type('abc');
  await page.keyboard.press('Enter');
  assert.equal(await page.$eval('#ti-valid-log', (el) => el.textContent), '已添加', '合法值添加');
  await page.keyboard.type('ABC');
  await page.keyboard.press('Enter');
  await page.$eval(field('#ti-valid'), (el) => { el.value = ''; });
  await page.keyboard.type('abc');
  await page.keyboard.press('Enter');
  assert.equal(await page.$eval('#ti-valid-log', (el) => el.textContent), '拒绝「abc」：重复了', '重复校验（大小写不敏感）');
  await page.$eval(field('#ti-valid'), (el) => { el.value = ''; });

  // —— 样式透传 —— //
  const style = await page.evaluate(() => {
    const o = document.querySelector('div[aria-label="描边标签"] .nv-tag');
    const lg = document.querySelector('div[aria-label="实心标签"]');
    return { variant: o.dataset.variant, color: o.dataset.color, size: lg.dataset.size, h: lg.getBoundingClientRect().height };
  });
  assert.equal(style.variant, 'outline', 'data-variant 透传');
  assert.equal(style.color, 'primary', 'data-color 透传');
  assert(style.h >= 44, `lg 外框至少 44px（${style.h}）`);

  // —— 空格分隔 —— //
  const kw = 'div[aria-label="关键词"]';
  assert.equal((await tags(kw)).join('|'), '设计|系统|组件库', '空格拆分初始值');
  await page.click(field(kw));
  await page.keyboard.type('动效 ');
  assert.equal((await tags(kw)).slice(-1)[0], '动效', '空格确认');

  // —— 实例 API —— //
  const api = await page.evaluate(() => {
    const el = document.getElementById('ti-basic');
    const ti = Nova.get(el, 'tag-input');
    ti.value = 'x,y';
    const a = ti.value.join('|');
    const added = ti.add('z');
    ti.remove('x');
    const b = ti.value.join('|');
    ti.clear();
    return { a, added, b, c: ti.value.length };
  });
  assert.equal(api.a, 'x|y', 'value 可写');
  assert(api.added, 'add() 返回 true');
  assert.equal(api.b, 'y|z', 'remove() 删除');
  assert.equal(api.c, 0, 'clear() 清空');

  // —— 表单重置 —— //
  const reset = await page.evaluate(async () => {
    const form = document.createElement('form');
    form.innerHTML = '<div class="nv-tag-input" data-name="t" data-value="一,二"></div>';
    document.querySelector('.doc-preview').append(form);
    Nova.init(form);
    const ti = Nova.get(form.firstElementChild, 'tag-input');
    ti.add('三');
    const before = new FormData(form).getAll('t').join('|');
    form.reset();
    const after = new FormData(form).getAll('t').join('|');
    return { before, after };
  });
  assert.equal(reset.before, '一|二|三', 'FormData 拿到全部标签');
  assert.equal(reset.after, '一|二', 'reset 恢复初始值');
};
