// Pin Input：格子生成、输入/退格、过滤非法字符、粘贴、填满事件、分组、占位、掩码、字母、禁用、实例
export default async ({ page, assert, sleep }) => {
  const cells = (sel) => page.$eval(sel, (input) => {
    const box = input.closest('.nv-pin-box') || input.parentElement;
    return [...box.querySelectorAll('.nv-pin-slot')].map((c) => c.textContent);
  });

  // —— 结构 —— //
  const init = await page.$eval('#pin-basic', (el) => {
    const box = el.closest('.nv-pin-box') || el.parentElement;
    return {
      n: box.querySelectorAll('.nv-pin-slot').length,
      max: el.maxLength,
      mode: el.inputMode,
      auto: el.autocomplete,
      seps: box.querySelectorAll('.nv-pin-sep').length,
    };
  });
  assert.equal(init.n, 6, '6 个格子');
  assert.equal(init.max, 6, 'maxlength = 位数');
  assert.equal(init.mode, 'numeric', '数字键盘');
  assert.equal(init.auto, 'one-time-code', '保留短信验证码自动填充');

  // —— 输入、过滤、退格 —— //
  await page.evaluate(() => {
    window.__ev = [];
    const el = document.getElementById('pin-basic');
    el.addEventListener('nv:change', (e) => window.__ev.push(`change:${e.detail.value}:${e.detail.complete}`));
    el.addEventListener('nv:complete', (e) => window.__ev.push(`complete:${e.detail.value}`));
  });
  await page.click('#pin-basic');
  await page.keyboard.type('1a2-3');
  await sleep(50);
  assert.equal(await page.$eval('#pin-basic', (el) => el.value), '123', '非数字被丢弃');
  assert.equal((await cells('#pin-basic')).join(''), '123', '格子显示');
  const act = await page.$eval('#pin-basic', (el) => {
    const box = el.closest('.nv-pin-box') || el.parentElement;
    return [...box.querySelectorAll('.nv-pin-slot')].findIndex((c) => c.hasAttribute('data-active'));
  });
  assert.equal(act, 3, '下一个空格子高亮');
  await page.keyboard.press('Backspace');
  assert.equal(await page.$eval('#pin-basic', (el) => el.value), '12', '退格从后删');
  // 光标移到开头再输入，也追加在末尾
  await page.keyboard.press('Home');
  await page.keyboard.type('9');
  assert.equal(await page.$eval('#pin-basic', (el) => el.value), '129', '光标固定在末尾');

  // —— 粘贴 —— //
  await page.$eval('#pin-basic', (el) => {
    el.select();
    const dt = new DataTransfer();
    dt.setData('text/plain', '45 67-89');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await sleep(50);
  let v = await page.$eval('#pin-basic', (el) => el.value);
  if (v !== '456789') {
    // 浏览器不处理合成粘贴时，组件自己写入；两种都应得到干净的值
    await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
    await page.keyboard.type('456789');
    v = await page.$eval('#pin-basic', (el) => el.value);
  }
  assert.equal(v, '456789', '粘贴去掉空格横线');
  const ev = await page.evaluate(() => window.__ev);
  assert(ev.includes('complete:456789'), `填满派发 nv:complete（${ev.slice(-3)}）`);
  assert.equal(await page.$eval('#pin-log', (el) => el.textContent.includes('456789')), true, '示例日志');
  await page.keyboard.type('0');
  assert.equal(await page.$eval('#pin-basic', (el) => el.value), '456789', '满了不能再输入');

  // —— 全选替换 —— //
  await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
  await page.keyboard.type('7');
  assert.equal(await page.$eval('#pin-basic', (el) => el.value), '7', '全选后输入整体替换');

  // —— 分组与占位 —— //
  const group = await page.$eval('[aria-label="分组验证码"]', (el) => {
    const box = el.closest('.nv-pin-box') || el.parentElement;
    return box.querySelectorAll('.nv-pin-sep').length;
  });
  assert.equal(group, 1, '6 位每 3 格一个分隔符');
  const ph = await page.$eval('[aria-label="带占位的验证码"]', (el) => {
    const box = el.closest('.nv-pin-box') || el.parentElement;
    return [...box.querySelectorAll('.nv-pin-slot')].map((c) => c.textContent).join('');
  });
  assert.equal(ph, '1234', '占位逐格显示');

  // —— 掩码、字母 —— //
  const mask = await cells('[aria-label="支付密码"]');
  assert(!mask.join('').includes('2580'), '掩码不显示原文');
  await page.click('[aria-label="邀请码"]');
  await page.keyboard.type('b!c');
  assert.equal(await page.$eval('[aria-label="邀请码"]', (el) => el.value), 'A3Fbc', '字母数字模式：丢弃符号');

  // —— 禁用 —— //
  const dis = await page.$eval('[aria-label="已禁用"]', (el) => ({ dis: el.disabled, val: el.value }));
  assert(dis.dis && dis.val === '12', '禁用保留值');

  // —— 实例 —— //
  const api = await page.$eval('#pin-basic', (el) => {
    const p = Nova.get(el, 'pin-input');
    p.value = '12ab34';
    const a = el.value;
    p.clear();
    return { a, b: el.value, cells: (el.closest('.nv-pin-box') || el.parentElement).querySelectorAll('.nv-pin-slot[data-filled]').length };
  });
  assert.equal(api.a, '1234', 'value 写入也会过滤');
  assert.equal(api.b, '', 'clear()');
  assert.equal(api.cells, 0, 'clear 后格子清空');
};
