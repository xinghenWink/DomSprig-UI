// Spinner / Loader：子元素补齐、ARIA、声明式遮罩 aria-busy 同步、Nova.loading 创建/更新/关闭、全屏锁滚动
export const components = ['spinner'];

export default async ({ page, assert, sleep }) => {
  const init = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const kids = (s) => q(s).querySelectorAll(':scope > i').length;
    const inBtn = q('.nv-btn .nv-loader');
    const inOverlay = q('#spinner-static .nv-loader');
    return {
      dots: kids('.nv-loader[data-variant="dots"]'),
      bars: kids('.nv-loader[data-variant="bars"]'),
      ring: kids('.nv-loader[data-variant="ring"]'),
      pulse: kids('.nv-loader[data-variant="pulse"]'),
      role: q('.nv-loader[data-variant="dots"]').getAttribute('role'),
      label: q('.nv-loader[data-variant="dots"]').getAttribute('aria-label'),
      btnRole: inBtn.hasAttribute('role'),
      overlayLoader: inOverlay.getAttribute('aria-hidden'),
      overlayRole: q('#spinner-static').getAttribute('role'),
      overlayLive: q('#spinner-static').getAttribute('aria-live'),
      busy: q('#spinner-card').getAttribute('aria-busy'),
    };
  });
  assert.equal([init.dots, init.bars, init.ring, init.pulse].join(), '3,4,0,1', '按变体补齐子元素');
  assert.equal(init.role, 'status', 'loader role=status');
  assert.equal(init.label, '加载中', '默认 aria-label');
  assert.equal(init.btnRole, false, 'aria-hidden 的 loader 不补 role');
  assert.equal(init.overlayLoader, 'true', '遮罩内的 loader 为装饰');
  assert.equal(init.overlayRole + '|' + init.overlayLive, 'status|polite', '遮罩 role 与 aria-live');
  assert.equal(init.busy, 'true', '宿主 aria-busy=true');

  // data-label 覆盖、动态插入自动增强
  const dyn = await page.evaluate(async () => {
    const el = Nova.h('span', { class: 'nv-loader', 'data-variant': 'bars', 'data-label': '正在上传' });
    document.body.append(el);
    await new Promise((r) => setTimeout(r, 30));
    const r = { label: el.getAttribute('aria-label'), kids: el.children.length };
    el.remove();
    return r;
  });
  assert.equal(dyn.label, '正在上传', 'data-label 覆盖文案');
  assert.equal(dyn.kids, 4, '动态插入补齐子元素');

  // 声明式遮罩：hidden 切换同步 aria-busy
  await page.click('#spinner-toggle');
  await sleep(30);
  assert.equal(await page.evaluate(() => document.getElementById('spinner-card').getAttribute('aria-busy')), 'false', '隐藏遮罩后 aria-busy=false');

  // Nova.loading：创建、复用、更新、关闭、事件、恢复样式
  const ctl = await page.evaluate(async () => {
    const host = Nova.h('div', { id: 'spinner-t-host' }, '内容');
    document.body.append(host);
    let loaded = 0;
    host.addEventListener('nv:loaded', () => loaded++);
    const c = Nova.loading(host, { text: '<b>同步</b>' });
    const again = Nova.loading(host, { text: '第二次' });
    const ov = host.querySelector('.nv-loading-overlay');
    const a = {
      same: c === again,
      count: host.querySelectorAll('.nv-loading-overlay').length,
      pos: host.style.position,
      busy: host.getAttribute('aria-busy'),
      text: ov.querySelector('.nv-loading-overlay-text').innerHTML,
      descHidden: ov.querySelector('.nv-loading-overlay-desc').hidden,
    };
    c.update('即将完成', '还剩 2 项');
    a.updated = ov.querySelector('.nv-loading-overlay-text').textContent + '|' + ov.querySelector('.nv-loading-overlay-desc').textContent;
    Nova.loading.hide(host);
    await new Promise((r) => setTimeout(r, 400));
    a.after = { left: host.querySelectorAll('.nv-loading-overlay').length, pos: host.style.position, busy: host.getAttribute('aria-busy'), loaded };
    host.remove();
    return a;
  });
  assert(ctl.same, '同一容器复用遮罩');
  assert.equal(ctl.count, 1, '只有一个遮罩');
  assert.equal(ctl.pos, 'relative', 'static 容器设为 relative');
  assert.equal(ctl.busy, 'true', '加载中 aria-busy');
  assert.equal(ctl.text, '第二次', '复用时更新文字（textContent，不解析 HTML）');
  assert.equal(ctl.descHidden, true, '无说明时隐藏');
  assert.equal(ctl.updated, '即将完成|还剩 2 项', 'update() 更新文字与说明');
  assert.equal(ctl.after.left, 0, '关闭后移除遮罩');
  assert.equal(ctl.after.pos, '', '恢复 position');
  assert.equal(ctl.after.busy, null, '恢复 aria-busy');
  assert.equal(ctl.after.loaded, 1, '派发 nv:loaded');

  // 全屏：锁定滚动，关闭后恢复
  await page.click('#spinner-fullscreen');
  await sleep(100);
  const fs = await page.evaluate(() => {
    const ov = document.querySelector('body > .nv-loading-overlay[data-fullscreen]');
    const r = ov.getBoundingClientRect();
    return { ok: !!ov, cover: r.width === innerWidth && r.height === innerHeight, lock: document.documentElement.style.overflow };
  });
  assert(fs.ok, '全屏遮罩挂到 body');
  assert(fs.cover, '全屏遮罩盖住视口');
  assert.equal(fs.lock, 'hidden', '锁定页面滚动');
  await sleep(2500);
  const fsAfter = await page.evaluate(() => ({ left: document.querySelectorAll('body > .nv-loading-overlay').length, lock: document.documentElement.style.overflow }));
  assert.equal(fsAfter.left, 0, '全屏遮罩关闭');
  assert.equal(fsAfter.lock, '', '恢复页面滚动');
};
