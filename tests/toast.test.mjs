// Toast：类型与 role、上限、同 id 更新、悬停暂停、常驻、关闭、Promise、操作按钮、位置配置、安全
export default async ({ page, assert, sleep }) => {
  const live = (pos = 'top-center') => page.evaluate((p) =>
    [...document.querySelectorAll(`.nv-toast-region[data-position="${p}"] .nv-toast:not([data-state="closed"])`)].map((n) => ({
      id: n.dataset.id, type: n.dataset.type, role: n.getAttribute('role'),
      title: n.querySelector('.nv-toast-title').textContent,
      desc: n.querySelector('.nv-toast-desc') ? n.querySelector('.nv-toast-desc').textContent : null,
      paused: n.hasAttribute('data-paused'), progress: !!n.querySelector('.nv-toast-progress'), close: !!n.querySelector('.nv-toast-close'),
    })), pos);
  const clear = async () => { await page.evaluate(() => Nova.toast.dismissAll()); await sleep(400); };

  // 默认位置容器预先存在，带 data-nv-layer-ignore
  const region = await page.evaluate(() => {
    const r = document.querySelector('.nv-toast-region[data-position="top-center"]');
    return r && { ignore: r.hasAttribute('data-nv-layer-ignore'), live: r.getAttribute('aria-live'), label: r.getAttribute('aria-label') };
  });
  assert(region, '页面就绪时创建默认容器');
  assert(region.ignore, '容器带 data-nv-layer-ignore');
  assert.equal(region.live, 'polite', '容器为 aria-live 区域');

  // 1. 类型与 role；接口形态
  const api = await page.evaluate(() => {
    const h = Nova.toast.success('已保存');
    Nova.toast.error('保存失败', { description: '请重试' });
    Nova.toast.warning('空间不足');
    const plain = Nova.toast('纯文本');
    return { keys: Object.keys(h).sort().join(','), fn: typeof Nova.toast, plain: plain.id,
      methods: ['show', 'success', 'error', 'warning', 'info', 'loading', 'update', 'dismiss', 'dismissAll', 'promise', 'config'].every((k) => typeof Nova.toast[k] === 'function') };
  });
  assert.equal(api.fn, 'function', 'Nova.toast 可直接调用');
  assert(api.methods, '方法齐全');
  assert.equal(api.keys, 'dismiss,id,update', 'show 返回 { id, update, dismiss }');
  await sleep(350);
  let list = await live();
  // 最多 3 条：第 4 条进来时最旧的「已保存」被移除；新提示在顶部
  assert.equal(list.length, 3, `同一位置最多 3 条（实际 ${list.length}）`);
  assert.equal(list.map((x) => x.title).join('|'), '纯文本|空间不足|保存失败', '新提示贴近顶部，最旧的被移除');
  assert.equal(list.find((x) => x.type === 'error').role, 'alert', 'error 用 role=alert');
  assert.equal(list.find((x) => x.type === 'warning').role, 'status', '其余 role=status');
  assert.equal(list[0].type, 'info', 'Nova.toast(字符串) 为 info');
  await sleep(300);
  assert.equal(await page.evaluate(() => document.querySelectorAll('.nv-toast').length), 3, '溢出的提示退场后移除');
  await clear();

  // 2. 自动关闭 + 同 id 更新
  await page.evaluate(() => {
    window.__closed = [];
    Nova.toast.info('第一次', { id: 'same', duration: 600, onClose: (e) => window.__closed.push(e) });
    Nova.toast.success('第二次', { id: 'same', description: '已更新', duration: 600 });
  });
  list = await live();
  assert.equal(list.length, 1, '同 id 不新增');
  assert.equal(list[0].title, '第二次', '同 id 更新标题');
  assert.equal(list[0].type, 'success', '同 id 更新类型');
  await sleep(450);
  assert.equal((await live()).length, 1, '600ms 内仍在');
  await sleep(500);
  assert.equal((await live()).length, 0, '到时自动关闭');
  await sleep(300);
  assert.equal(await page.evaluate(() => JSON.stringify(window.__closed)), JSON.stringify([{ id: 'same', reason: 'timeout' }]), 'onClose 回调与原因');

  // 3. 悬停暂停（进度条同步暂停），移开继续剩余时间
  await page.evaluate(() => Nova.toast.info('悬停我', { id: 'hover', duration: 700 }));
  await sleep(50);
  const box = await page.evaluate(() => { const r = document.querySelector('[data-id="hover"]').getBoundingClientRect(); return { x: r.left + 40, y: r.top + 20 }; });
  await page.mouse.move(box.x, box.y);
  await sleep(900);
  list = await live();
  assert.equal(list.length, 1, '悬停时不自动关闭');
  assert(list[0].paused, '悬停时标记 data-paused');
  const playState = await page.evaluate(() => getComputedStyle(document.querySelector('[data-id="hover"] .nv-toast-progress')).animationPlayState);
  assert.equal(playState, 'paused', '进度条动画暂停');
  await page.mouse.move(5, 800);
  await sleep(200);
  assert.equal((await live()).length, 1, '离开后继续剩余时间（未立即关闭）');
  await sleep(800);
  assert.equal((await live()).length, 0, '剩余时间结束后关闭');

  // 4. 聚焦暂停
  await page.evaluate(() => Nova.toast.info('聚焦我', { id: 'focus', duration: 500, action: { label: '查看' } }));
  await page.evaluate(() => document.querySelector('[data-id="focus"] .nv-toast-action').focus());
  await sleep(700);
  assert.equal((await live()).length, 1, '焦点在提示内时暂停');
  await page.evaluate(() => document.activeElement.blur());
  await sleep(700);
  assert.equal((await live()).length, 0, '失焦后继续并关闭');

  // 5. duration:0 常驻；loading 默认常驻；closable:false
  await page.evaluate(() => {
    Nova.toast.warning('常驻', { id: 'sticky', duration: 0 });
    Nova.toast.loading('加载中', { id: 'load' });
    Nova.toast.info('不可关闭', { id: 'noclose', closable: false });
  });
  await sleep(3300);
  list = await live();
  assert(list.some((x) => x.id === 'sticky' && !x.progress), 'duration:0 常驻且无进度条');
  assert(list.some((x) => x.id === 'load'), 'loading 默认常驻');
  assert(!list.some((x) => x.id === 'noclose'), 'closable:false 的提示按默认时长关闭');
  // 关闭按钮
  await page.click('[data-id="sticky"] .nv-toast-close');
  await sleep(300);
  assert(!(await live()).some((x) => x.id === 'sticky'), '点关闭按钮关闭');
  assert.equal(await page.evaluate(() => document.querySelector('[data-id="load"] .nv-toast-close').getAttribute('aria-label')), '关闭提示', '关闭按钮 aria-label');

  // 6. update：loading → success 并重新计时（先把鼠标移开，否则下一条滑到指针下会被悬停暂停）
  await page.mouse.move(5, 800);
  await page.evaluate(() => Nova.toast.update('load', { type: 'success', title: '完成', duration: 400 }));
  list = await live();
  assert.equal(list[0].type, 'success', 'update 改类型');
  assert.equal(list[0].role, 'status', 'role 跟随类型');
  await sleep(700);
  assert.equal((await live()).length, 0, 'update 后按新时长关闭');

  // 7. dismiss(id) / dismissAll()
  await page.evaluate(() => { Nova.toast.info('a', { id: 'a', duration: 0 }); Nova.toast.info('b', { id: 'b', duration: 0 }); Nova.toast.dismiss('a'); });
  list = await live();
  assert.equal(list.map((x) => x.id).join(), 'b', 'dismiss(id)');
  await page.evaluate(() => Nova.toast.dismissAll());
  assert.equal((await live()).length, 0, 'dismissAll');
  await sleep(300);

  // 8. promise 成功 / 失败
  await page.evaluate(() => {
    window.__ok = Nova.toast.promise(new Promise((r) => setTimeout(() => r(7), 200)), { id: 'p1', loading: '上传中', success: (n) => `上传了 ${n} 个文件`, error: '失败' });
    Nova.toast.promise(new Promise((_, j) => setTimeout(() => j(new Error('网络错误')), 200)), { id: 'p2', loading: '同步中', success: '成功', error: (e) => ({ title: '同步失败', description: e.message }) });
  });
  list = await live();
  assert.equal(list.filter((x) => x.type === 'loading').length, 2, 'promise 先显示 loading');
  await sleep(300);
  list = await live();
  const p1 = list.find((x) => x.id === 'p1');
  const p2 = list.find((x) => x.id === 'p2');
  assert(p1 && p1.type === 'success' && p1.title === '上传了 3 个文件'.replace('3', '7'), 'promise 成功文案（函数）');
  assert(p2 && p2.type === 'error' && p2.title === '同步失败' && p2.desc === '网络错误', 'promise 失败文案（对象）');
  assert.equal(p2.role, 'alert', '失败转为 role=alert');
  assert.equal(await page.evaluate(() => window.__ok.then((v) => v)), 7, 'promise 返回原 Promise');
  await clear();

  // 9. action 按钮
  await page.evaluate(() => {
    window.__acted = 0;
    Nova.toast.success('已删除', { id: 'act', duration: 0, action: { label: '撤销', onClick: () => { window.__acted++; } } });
  });
  await page.click('[data-id="act"] .nv-toast-action');
  await sleep(300);
  assert.equal(await page.evaluate(() => window.__acted), 1, 'action.onClick 被调用');
  assert.equal((await live()).length, 0, '点击操作后关闭');

  // 10. 点击提示不触发浮层栈的「点击外部关闭」
  await page.evaluate(() => {
    window.__dismissed = 0;
    window.__pop = Nova.layer.push({ el: document.createElement('div'), onDismiss: () => { window.__dismissed++; } });
    Nova.toast.info('点我', { id: 'click', duration: 0 });
  });
  const c = await page.evaluate(() => { const r = document.querySelector('[data-id="click"] .nv-toast-body').getBoundingClientRect(); return { x: r.left + 10, y: r.top + 8 }; });
  await page.mouse.click(c.x, c.y);
  assert.equal(await page.evaluate(() => window.__dismissed), 0, '点击提示不关闭其它浮层');
  await page.evaluate(() => window.__pop());
  await clear();

  // 11. config：默认位置、上限；位置参数
  await page.evaluate(() => {
    Nova.toast.config({ position: 'bottom-right', max: 2 });
    Nova.toast.info('1'); Nova.toast.info('2'); Nova.toast.info('3');
    Nova.toast.info('左上', { position: 'top-left' });
  });
  list = await live('bottom-right');
  assert.equal(list.length, 2, 'config.max 生效');
  assert.equal(list.map((x) => x.title).join(), '2,3', '底部位置新提示在最下方');
  assert.equal((await live('top-left')).length, 1, 'position 选项');
  const geo = await page.evaluate(() => {
    const r = document.querySelector('.nv-toast-region[data-position="bottom-right"]').getBoundingClientRect();
    return { right: innerWidth - r.right, bottom: innerHeight - r.bottom };
  });
  assert(Math.abs(geo.right - 20) < 2 && Math.abs(geo.bottom - 20) < 2, `右下角距边 20px（${geo.right}, ${geo.bottom}）`);
  await page.evaluate(() => Nova.toast.config({ position: 'top-center', max: 3 }));
  await clear();

  // 12. Alt+T 聚焦最新一条，Esc 关闭，焦点归还
  await page.evaluate(() => {
    const b = Nova.h('button', { id: 'toast-origin' }, 'origin');
    document.body.append(b);
    b.focus();
    Nova.toast.info('键盘', { id: 'kbd', duration: 0 });
  });
  await page.keyboard.down('Alt');
  await page.keyboard.press('KeyT');
  await page.keyboard.up('Alt');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.id), 'kbd', 'Alt+T 聚焦最新提示');
  await page.keyboard.press('Escape');
  await sleep(300);
  assert.equal((await live()).length, 0, 'Esc 关闭聚焦的提示');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'toast-origin', '焦点归还');

  // 13. 安全：标题按文本渲染；超长文本不溢出
  await page.evaluate(() => Nova.toast.error('<img src=x onerror="window.__xss=1">', { id: 'xss', description: 'x'.repeat(300), duration: 0 }));
  const safe = await page.evaluate(() => {
    const n = document.querySelector('[data-id="xss"]');
    return { img: !!n.querySelector('img'), flag: window.__xss, over: n.scrollWidth > n.clientWidth + 1 };
  });
  assert(!safe.img && !safe.flag, '不解析 HTML');
  assert(!safe.over, '超长文本换行不溢出');
  await clear();
};
