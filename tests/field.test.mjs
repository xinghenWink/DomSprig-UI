// Field：label/for 自动关联、aria-describedby、aria-invalid 随错误文字同步
export default async ({ page, assert, sleep }) => {
  const basic = await page.evaluate(() => {
    const f = document.querySelector('.nv-field');
    const label = f.querySelector('.nv-field-label');
    const input = f.querySelector('input');
    const desc = f.querySelector('.nv-field-desc');
    return { forOk: label.htmlFor === input.id && !!input.id, described: input.getAttribute('aria-describedby') === desc.id };
  });
  assert(basic.forOk, 'label 自动关联控件');
  assert(basic.described, '说明文字写入 aria-describedby');

  // 初始错误
  const phone = () => page.evaluate(() => {
    const f = document.getElementById('field-phone');
    const input = f.querySelector('input');
    const err = f.querySelector('.nv-field-error');
    return {
      invalid: input.getAttribute('aria-invalid'),
      described: (input.getAttribute('aria-describedby') || '').split(' ').includes(err.id),
      fieldInvalid: f.hasAttribute('data-invalid'),
      live: err.getAttribute('aria-live'),
    };
  });
  let p = await phone();
  assert.equal(p.invalid, 'true', '有错误文字 → aria-invalid');
  assert(p.described && p.fieldInvalid, '错误 id 进入 aria-describedby');
  assert.equal(p.live, 'polite', '错误文字可被朗读');

  // 清除错误（setError） → 移除 aria-invalid
  await page.click('#field-toggle');
  await sleep(20);
  p = await phone();
  assert.equal(p.invalid, null, '清除错误后移除 aria-invalid');
  assert(!p.described && !p.fieldInvalid, '错误 id 移出 aria-describedby');

  // 直接改写 textContent 也会同步（MutationObserver）
  await page.evaluate(() => { document.querySelector('#field-phone .nv-field-error').textContent = '号码已被注册'; });
  await sleep(20);
  p = await phone();
  assert.equal(p.invalid, 'true', '改写错误文字自动同步');

  // 用户自有的 aria-describedby 不被覆盖；用户写的 aria-invalid 不会被清除
  const own = await page.evaluate(async () => {
    const f = Nova.h('div', { class: 'nv-field' },
      Nova.h('label', { class: 'nv-field-label' }, '标签'),
      Nova.h('input', { class: 'nv-input', 'aria-describedby': 'ext-hint', 'aria-invalid': 'true' }),
      Nova.h('p', { class: 'nv-field-desc' }, '说明'));
    document.body.append(f);
    await new Promise((r) => setTimeout(r, 20));
    Nova.field.setError(f, '出错');
    Nova.field.setError(f, '');
    const input = f.querySelector('input');
    return { d: input.getAttribute('aria-describedby'), inv: input.getAttribute('aria-invalid'), created: !!f.querySelector('.nv-field-error') };
  });
  assert(own.d.startsWith('ext-hint '), `保留外部 describedby（${own.d}）`);
  assert.equal(own.inv, 'true', '不清除用户自己设置的 aria-invalid');
  assert(own.created, 'setError 自动创建错误元素');

  // 注册表单：提交校验 → 焦点到第一个错误项；输入后实时消除
  await page.click('#field-signup [type=submit]');
  await sleep(20);
  const sub = await page.evaluate(() => ({
    errs: document.querySelectorAll('#field-signup .nv-field[data-invalid]').length,
    focus: document.activeElement.name,
  }));
  assert.equal(sub.errs, 3, '三项必填出错');
  assert.equal(sub.focus, 'name', '焦点到第一个错误');
  await page.type('#field-signup [name=name]', '林晓');
  await sleep(20);
  assert.equal(await page.$$eval('#field-signup .nv-field[data-invalid]', (l) => l.length), 2, '修正后实时消除');
};
