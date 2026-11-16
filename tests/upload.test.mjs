// Upload：拖拽区生成与键盘、选择/拖拽/粘贴添加、校验（类型/大小/数量）、单选替换、列表与删除、同步原生 input、进度与状态、图片预览、禁用、表单重置
export default async ({ page, assert, sleep }) => {
  // 在页面里造文件并通过 input change / drop / paste 送进去
  const feed = (sel, files, how = 'input') => page.evaluate(async (sel, files, how) => {
    const el = document.querySelector(sel);
    const mk = ({ name, size = 1000, type = '' }) => {
      if (type.startsWith('image/')) {
        const c = document.createElement('canvas');
        c.width = 8; c.height = 8;
        c.getContext('2d').fillRect(0, 0, 8, 8);
        const bin = atob(c.toDataURL('image/png').split(',')[1]);
        const pad = Math.max(0, size - bin.length);
        return new File([Uint8Array.from(bin, (ch) => ch.charCodeAt(0)), new Uint8Array(pad)], name, { type });
      }
      return new File([new Uint8Array(size)], name, { type });
    };
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(mk(f)));
    if (how === 'input') {
      const input = el.querySelector('.nv-upload-input');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (how === 'drop') {
      const target = el.querySelector('.nv-upload-dragger') || el;
      target.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
      const over = el.hasAttribute('data-dragover');
      target.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
      target.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      return { over, after: el.hasAttribute('data-dragover') };
    } else if (how === 'paste') {
      const target = el.querySelector('.nv-upload-dragger') || el;
      target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }
    await new Promise((r) => setTimeout(r, 30));
    return null;
  }, sel, files, how);
  const items = (sel) => page.$eval(sel, (el) => [...el.querySelectorAll('.nv-upload-item:not([data-state="closed"])')].map((li) => ({
    name: li.querySelector('.nv-upload-name').textContent,
    meta: li.querySelector('.nv-upload-meta').textContent,
    status: li.dataset.status,
    img: !!li.querySelector('.nv-upload-thumb img'),
  })));
  const B = '#up-basic';

  // —— 拖拽区 —— //
  const dz = await page.$eval(B, (el) => {
    const d = el.querySelector('.nv-upload-dragger');
    return { role: d.getAttribute('role'), tab: d.tabIndex, hint: d.querySelector('.nv-upload-hint')?.textContent, text: d.textContent, input: el.querySelector('.nv-upload-input').name };
  });
  assert.equal(dz.role, 'button', '拖拽区 role=button');
  assert.equal(dz.tab, 0, '拖拽区可聚焦');
  assert.equal(dz.hint, '单个不超过 10 MB', '提示按 max-size 生成');
  assert(!dz.text.includes('null'), '没有多余的 null 文本');
  assert.equal(dz.input, 'files', 'data-name 写到原生 input');
  const noNull = await page.$$eval('.nv-upload-dragger', (ds) => ds.every((d) => !d.textContent.includes('null')));
  assert(noNull, '所有拖拽区都没有 null 文本');

  // 键盘 Enter 打开选择框（拦截 input.click）
  await page.$eval(B, (el) => { window.__opened = 0; el.querySelector('.nv-upload-input').click = () => { window.__opened++; }; });
  await page.focus(`${B} .nv-upload-dragger`);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await page.click(`${B} .nv-upload-dragger`);
  assert.equal(await page.evaluate(() => window.__opened), 3, 'Enter / 空格 / 点击都打开选择框');

  // —— 选择文件 —— //
  await page.evaluate(() => {
    window.__ev = [];
    const el = document.getElementById('up-basic');
    ['nv:add', 'nv:remove', 'nv:change', 'nv:reject'].forEach((t) => el.addEventListener(t, (e) => window.__ev.push(`${t}:${e.detail.file?.name || e.detail.files.length}`)));
  });
  await feed(B, [{ name: 'a.pdf', size: 2048 }, { name: 'b.txt', size: 1536 * 1024 }]);
  let list = await items(B);
  assert.equal(list.map((x) => x.name).join(','), 'a.pdf,b.txt', '选择后加入列表');
  assert.equal(list[0].meta, '2 KB', '显示文件大小');
  assert.equal(list[1].meta, '1.5 MB', 'MB 格式化');
  assert.equal(await page.$eval('#up-basic-log', (el) => el.textContent), 'files = 2', 'nv:change');
  assert.equal(await page.$eval(`${B} .nv-upload-input`, (i) => i.files.length), 2, '同步回原生 input.files');

  // 再选一次是追加（多选）
  await feed(B, [{ name: 'c.png', size: 500, type: 'image/png' }]);
  list = await items(B);
  assert.equal(list.length, 3, '多选时追加');
  assert(list[2].img, '图片显示缩略图');
  assert.equal(await page.$eval(`${B} .nv-upload-input`, (i) => [...i.files].map((f) => f.name).join(',')), 'a.pdf,b.txt,c.png', '原生 input 是完整列表');

  // —— 拖拽 —— //
  const drag = await feed(B, [{ name: 'd.zip', size: 10 }], 'drop');
  assert(drag.over, '拖入时容器带 data-dragover');
  assert(!drag.after, '放下后取消 data-dragover');
  assert.equal((await items(B)).length, 4, '拖拽添加');

  // —— 粘贴 —— //
  await feed(B, [{ name: 'shot.png', size: 100, type: 'image/png' }], 'paste');
  assert.equal((await items(B)).pop().name, 'shot.png', '粘贴添加');

  // —— 大小校验 —— //
  await feed(B, [{ name: 'big.bin', size: 11 * 1024 * 1024 }]);
  assert(await page.evaluate(() => window.__ev.includes('nv:reject:big.bin')), '超过 10MB 被拒绝');
  assert.equal((await items(B)).length, 5, '被拒绝的不进列表');

  // —— 删除 —— //
  await page.click(`${B} .nv-upload-item:first-child .nv-upload-remove`);
  await sleep(350);
  list = await items(B);
  assert.equal(list[0].name, 'b.txt', '删除第一项');
  assert.equal(await page.$eval(`${B} .nv-upload-input`, (i) => i.files.length), 4, '删除后同步原生 input');
  assert.equal(await page.$eval(`${B} .nv-upload-item:first-child .nv-upload-remove`, (b) => b.getAttribute('aria-label')), '移除 b.txt', '删除按钮 aria-label');

  // nv:add 可取消
  await page.evaluate(() => document.getElementById('up-basic').addEventListener('nv:add', (e) => { if (e.detail.file.name === 'no.txt') e.preventDefault(); }));
  await feed(B, [{ name: 'no.txt' }]);
  assert(!(await items(B)).some((x) => x.name === 'no.txt'), 'nv:add 被取消时不加入');

  // —— 单选替换 + accept 扩展名 —— //
  const S = '.doc-demo:nth-of-type(2) .nv-upload, .nv-upload[data-accept=".pdf,.doc,.docx"]';
  await feed(S, [{ name: '简历.pdf' }]);
  await feed(S, [{ name: '简历v2.DOCX' }]);
  list = await items(S);
  assert.equal(list.map((x) => x.name).join(','), '简历v2.DOCX', '单选：新文件替换旧文件；扩展名不区分大小写');
  await page.evaluate((S) => { window.__rej = []; document.querySelector(S).addEventListener('nv:reject', (e) => window.__rej.push(e.detail.reason)); }, S);
  await feed(S, [{ name: 'x.exe' }]);
  assert.equal(await page.evaluate(() => window.__rej.join(',')), 'type', '扩展名不符被拒绝');
  const btnOpen = await page.$eval(S, (el) => { let n = 0; el.querySelector('.nv-upload-input').click = () => { n++; }; el.querySelector('button.nv-btn').click(); return n; });
  assert.equal(btnOpen, 1, '按钮触发选择框');

  // —— 校验 demo：type / size / count —— //
  const V = '#up-valid';
  await feed(V, [{ name: 'doc.pdf', type: 'application/pdf' }]);
  assert.equal(await page.$eval('#up-valid-log', (el) => el.textContent), '已拒绝 doc.pdf：类型不符', 'MIME 通配校验');
  await feed(V, [{ name: 'large.jpg', type: 'image/jpeg', size: 300 * 1024 }]);
  assert.equal(await page.$eval('#up-valid-log', (el) => el.textContent), '已拒绝 large.jpg：超过 200 KB', 'KB 上限');
  await feed(V, [{ name: '1.png', type: 'image/png' }, { name: '2.png', type: 'image/png' }, { name: '3.png', type: 'image/png' }]);
  assert.equal((await items(V)).length, 2, '最多 2 个');
  assert.equal(await page.$eval('#up-valid-log', (el) => el.textContent), '已拒绝 3.png：超过数量上限', '数量上限');

  // —— 进度（模拟上传 demo） —— //
  const P = '#up-progress';
  await feed(P, [{ name: 'ok.txt', size: 4096 }, { name: 'will-fail.txt', size: 4096 }]);
  await sleep(500);
  const mid = await items(P);
  assert(mid.every((x) => x.status === 'uploading' || x.status === 'done'), `上传中状态（${mid.map((x) => x.status)}）`);
  const bar = await page.$eval(`${P} .nv-upload-item`, (li) => ({ v: li.style.getPropertyValue('--value'), w: getComputedStyle(li, '::after').width }));
  assert(Number(bar.v) > 0 && parseFloat(bar.w) > 0, `底部进度条有宽度（${JSON.stringify(bar)}）`);
  await sleep(4500);
  const end = await items(P);
  assert.equal(end[0].status, 'done', '完成状态');
  assert(end[0].meta.includes('已完成'), `完成文案（${end[0].meta}）`);
  assert.equal(end[1].status, 'error', '失败状态');
  assert.equal(end[1].meta, '服务器拒绝了这个文件', '失败信息');

  // —— 图片墙 —— //
  const W = '.nv-upload[data-list="picture"]';
  await feed(W, [{ name: 'p1.png', type: 'image/png' }, { name: 'p2.png', type: 'image/png' }]);
  const wall = await page.$eval(W, (el) => {
    const lis = [...el.querySelectorAll('.nv-upload-item')];
    const r0 = lis[0].getBoundingClientRect();
    const r1 = lis[1].getBoundingClientRect();
    const rm = lis[0].querySelector('.nv-upload-remove').getBoundingClientRect();
    return { row: Math.abs(r0.top - r1.top) < 1, w: Math.round(r0.width), rmInside: rm.right <= r0.right && rm.top >= r0.top, imgs: el.querySelectorAll('.nv-upload-thumb img').length };
  });
  assert(wall.row, '图片墙横向排列');
  assert.equal(wall.w, 104, '卡片宽 104');
  assert(wall.rmInside, '删除按钮在卡片内右上角');
  assert.equal(wall.imgs, 2, '缩略图');
  const revoked = await page.$eval(W, async (el) => {
    const src = el.querySelector('.nv-upload-thumb img').src;
    const seen = [];
    const orig = URL.revokeObjectURL;
    URL.revokeObjectURL = (u) => { seen.push(u); return orig.call(URL, u); };
    el.querySelector('.nv-upload-remove').click();
    await new Promise((r) => setTimeout(r, 400));
    URL.revokeObjectURL = orig;
    return seen.includes(src);
  });
  assert(revoked, '删除后释放 object URL');

  // —— 禁用 —— //
  const dis = await page.$eval('.nv-upload[data-disabled]', (el) => {
    let n = 0;
    el.querySelector('.nv-upload-input').click = () => { n++; };
    el.querySelector('.nv-upload-dragger').click();
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'x.txt'));
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    return { opened: n, items: el.querySelectorAll('.nv-upload-item').length, pe: getComputedStyle(el.querySelector('.nv-upload-dragger')).pointerEvents };
  });
  assert(dis.opened === 0 && dis.items === 0, '禁用时不能选择或拖入');

  // —— 实例与表单 —— //
  const api = await page.evaluate(async () => {
    const form = document.createElement('form');
    form.innerHTML = '<div class="nv-upload" data-multiple data-name="att"></div>';
    document.querySelector('.doc-preview').append(form);
    Nova.init(form);
    const el = form.firstElementChild;
    const up = Nova.get(el, 'upload');
    const f1 = new File(['a'], 'one.txt');
    const f2 = new File(['b'], 'two.txt');
    const added = up.add([f1, f2]);
    const fd = new FormData(form).getAll('att').map((f) => f.name).join(',');
    up.setStatus(f1, 'error', '坏了');
    const st = el.querySelector('.nv-upload-item').dataset.status;
    up.remove(f1);
    await new Promise((r) => setTimeout(r, 350));
    const left = up.files.map((f) => f.name).join(',');
    form.reset();
    await new Promise((r) => setTimeout(r, 350));
    return { added: added.length, fd, st, left, afterReset: up.files.length, liAfter: el.querySelectorAll('.nv-upload-item').length };
  });
  assert.equal(api.added, 2, 'add() 返回加入的文件');
  assert.equal(api.fd, 'one.txt,two.txt', 'FormData 带上文件');
  assert.equal(api.st, 'error', 'setStatus');
  assert.equal(api.left, 'two.txt', 'remove()');
  assert.equal(api.afterReset, 0, '表单 reset 清空');
  assert.equal(api.liAfter, 0, 'reset 后列表清空');
};
