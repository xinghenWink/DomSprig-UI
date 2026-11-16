// Textarea：自动高度（最小/最大行数）、字数统计、隐藏容器初始化
export default async ({ page, assert, sleep }) => {
  const sel = '#textarea-comment-input';
  const h0 = await page.$eval(sel, (el) => el.offsetHeight);
  await page.focus(sel);
  await page.keyboard.type('第一行');
  for (let i = 0; i < 4; i++) { await page.keyboard.down('Shift'); await page.keyboard.press('Enter'); await page.keyboard.up('Shift'); await page.keyboard.type(`第 ${i + 2} 行`); }
  const h1 = await page.$eval(sel, (el) => el.offsetHeight);
  assert(h1 > h0 + 30, `输入多行后增高（${h0} → ${h1}）`);
  assert.equal(await page.$eval(sel, (el) => el.style.overflowY), 'hidden', '未超过最大行数时不滚动');
  for (let i = 0; i < 6; i++) { await page.keyboard.down('Shift'); await page.keyboard.press('Enter'); await page.keyboard.up('Shift'); await page.keyboard.type('更多'); }
  const h2 = await page.$eval(sel, (el) => ({ h: el.offsetHeight, o: el.style.overflowY }));
  assert.equal(h2.o, 'auto', '超过最大行数出现滚动条');
  const h3 = await page.$eval(sel, (el) => { el.value += '\n再来一行'; el.dispatchEvent(new Event('input', { bubbles: true })); return el.offsetHeight; });
  assert.equal(h3, h2.h, '达到最大行数后高度不再增加');

  // 字数统计
  const count = await page.$eval(sel, (el) => el.parentElement.querySelector('.nv-textarea-count').textContent);
  assert(/^\d+\/500$/.test(count), `字数统计格式（${count}）`);

  // Ctrl+Enter 发送后清空并回落到最小高度
  await page.keyboard.down('Control');
  await page.keyboard.press('Enter');
  await page.keyboard.up('Control');
  const after = await page.$eval(sel, (el) => ({ v: el.value, h: el.offsetHeight }));
  assert.equal(after.v, '', '发送后清空');
  assert.equal(after.h, h0, '回落到最小高度');

  // 在 display:none 容器内初始化，显示后由 ResizeObserver 计算高度
  const hidden = await page.evaluate(async () => {
    const box = Nova.h('div', { style: { display: 'none', width: '400px' } });
    const ta = Nova.h('textarea', { class: 'nv-textarea', 'data-autosize': '', 'data-min-rows': '1' });
    ta.value = 'a\nb\nc\nd';
    box.append(ta);
    document.body.append(box);
    await new Promise((r) => setTimeout(r, 30));
    box.style.display = 'block';
    await new Promise((r) => setTimeout(r, 60));
    return ta.offsetHeight;
  });
  assert(hidden > 90, `隐藏容器显示后正确计算高度（${hidden}）`);
  await sleep(10);
};
