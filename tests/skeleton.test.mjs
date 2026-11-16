// Skeleton：多行生成、尺寸变量、aria-hidden、包裹模式、淡入替换与还原
export const components = ['skeleton'];

export default async ({ page, assert, sleep }) => {
  // 多行：生成 N 行，末行变短；尺寸属性写入变量
  const basic = await page.evaluate(async () => {
    const box = document.createElement('div');
    box.innerHTML = `
      <div class="nv-skeleton" id="t-lines" data-lines="4" style="width:400px"></div>
      <span class="nv-skeleton" id="t-size" data-width="120" data-height="2em"></span>
      <span class="nv-skeleton" id="t-circle" data-shape="circle" data-size="24"></span>
      <span class="nv-skeleton" id="t-bad" data-width="red;background:url(x)"></span>
      <div class="nv-skeleton" id="t-many" data-lines="9999"></div>
      <div class="nv-skeleton" id="t-css" data-lines><span class="nv-skeleton-line"></span><span class="nv-skeleton-line"></span></div>`;
    document.body.append(box);
    await new Promise((r) => setTimeout(r, 30));
    const lines = [...document.querySelectorAll('#t-lines .nv-skeleton-line')];
    const w = lines.map((l) => l.getBoundingClientRect().width);
    const size = document.getElementById('t-size');
    const circle = document.getElementById('t-circle').getBoundingClientRect();
    return {
      count: lines.length,
      firstW: w[0],
      lastW: w[w.length - 1],
      sizeW: size.getBoundingClientRect().width,
      sizeVar: size.style.getPropertyValue('--nv-skeleton-h'),
      circle: [circle.width, circle.height],
      bad: document.getElementById('t-bad').style.getPropertyValue('--nv-skeleton-w'),
      many: document.querySelectorAll('#t-many .nv-skeleton-line').length,
      css: document.querySelectorAll('#t-css .nv-skeleton-line').length,
      hidden: document.getElementById('t-lines').getAttribute('aria-hidden'),
      anim: getComputedStyle(lines[0]).animationName,
    };
  });
  assert.equal(basic.count, 4, '生成 4 行');
  assert(Math.abs(basic.firstW - 400) < 1, `首行撑满（${basic.firstW}）`);
  assert(Math.abs(basic.lastW - 240) < 1, `末行 60%（${basic.lastW}）`);
  assert.equal(basic.sizeW, 120, '纯数字宽度按 px');
  assert.equal(basic.sizeVar, '2em', '带单位高度原样写入');
  assert.equal(basic.circle.join(','), '24,24', '圆形数字尺寸');
  assert.equal(basic.bad, '', '非法尺寸值被忽略');
  assert.equal(basic.many, 50, '行数上限 50');
  assert.equal(basic.css, 2, 'data-lines 为空时保留手写行');
  assert.equal(basic.hidden, 'true', '占位骨架 aria-hidden');
  assert.equal(basic.anim, 'nv-shimmer', '默认 wave 动画');

  // 动画变体：组上的 pulse / none 作用到内部
  const anim = await page.evaluate(async () => {
    const box = document.createElement('div');
    box.innerHTML = `
      <div class="nv-skeleton-group" data-animate="pulse"><span class="nv-skeleton" id="t-p"></span><div class="nv-skeleton" data-lines="2" id="t-pl"></div></div>
      <div class="nv-skeleton-group" data-animate="none"><span class="nv-skeleton" id="t-n"></span></div>`;
    document.body.append(box);
    await new Promise((r) => setTimeout(r, 30));
    const a = (s) => getComputedStyle(document.querySelector(s)).animationName;
    return [a('#t-p'), a('#t-pl .nv-skeleton-line'), a('#t-n')];
  });
  assert.equal(anim.join(','), 'nv-skeleton-pulse,nv-skeleton-pulse,none', `动画变体 ${anim}`);

  // 刷新：改 data-lines 后重新生成
  const refreshed = await page.evaluate(() => {
    const el = document.getElementById('t-lines');
    el.dataset.lines = '2';
    Nova.skeleton.refresh(el);
    return el.querySelectorAll('.nv-skeleton-line').length;
  });
  assert.equal(refreshed, 2, 'refresh 后为 2 行');

  // 包裹模式：内容隐藏且不设 aria-hidden；loading(false) 后显示
  const wrap = await page.evaluate(async () => {
    const host = document.createElement('div');
    host.setAttribute('aria-busy', 'true');
    host.innerHTML = '<span class="nv-skeleton" id="t-wrap"><b>张三</b></span>';
    document.body.append(host);
    await new Promise((r) => setTimeout(r, 30));
    const el = document.getElementById('t-wrap');
    const before = { vis: getComputedStyle(el.firstElementChild).visibility, aria: el.getAttribute('aria-hidden'), w: el.getBoundingClientRect().width };
    let fired = 0;
    host.addEventListener('nv:loaded', () => fired++);
    Nova.skeleton.loading(host, false);
    const after = { vis: getComputedStyle(el.firstElementChild).visibility, loaded: el.hasAttribute('data-loaded'), busy: host.getAttribute('aria-busy'), w: el.getBoundingClientRect().width };
    Nova.skeleton.loading(host, true);
    return { before, after, fired, again: el.hasAttribute('data-loaded') };
  });
  assert.equal(wrap.before.vis, 'hidden', '包裹内容加载前不可见');
  assert.equal(wrap.before.aria, null, '包裹模式不加 aria-hidden');
  assert(wrap.before.w > 0 && Math.abs(wrap.before.w - wrap.after.w) < 0.5, `尺寸贴合内容且无跳动（${wrap.before.w} → ${wrap.after.w}）`);
  assert.equal(wrap.after.vis, 'visible', '加载后可见');
  assert.equal(wrap.after.loaded, true, 'data-loaded');
  assert.equal(wrap.after.busy, 'false', 'aria-busy 同步');
  assert.equal(wrap.fired, 1, 'nv:loaded 派发');
  assert.equal(wrap.again, false, 'loading(true) 恢复骨架');

  // 替换：template 克隆、字符串按文本、loading(true) 还原骨架
  const rep = await page.evaluate(async () => {
    const host = document.createElement('div');
    host.innerHTML = '<span class="nv-skeleton" id="t-r1"></span><span class="nv-skeleton" id="t-r2"></span>';
    const tpl = document.createElement('template');
    tpl.innerHTML = '<p id="t-real">真实内容</p>';
    document.body.append(host, tpl);
    await new Promise((r) => setTimeout(r, 30));
    Nova.skeleton.replace(host, tpl);
    const a = { real: !!host.querySelector('#t-real'), sk: host.querySelectorAll('.nv-skeleton').length, busy: host.getAttribute('aria-busy'), tplKept: !!tpl.content.querySelector('#t-real') };
    Nova.skeleton.replace(host, '<img src=x onerror="window.__xss=1">');
    const b = { text: host.textContent, img: host.querySelector('img') };
    Nova.skeleton.loading(host, true);
    const c = { sk: host.querySelectorAll('.nv-skeleton').length, busy: host.getAttribute('aria-busy') };
    return { a, b: { text: b.text, img: !!b.img }, c, xss: window.__xss };
  });
  assert.equal(rep.a.real, true, 'template 内容被换入');
  assert.equal(rep.a.sk, 0, '骨架被移除');
  assert.equal(rep.a.busy, 'false', '替换后 aria-busy=false');
  assert.equal(rep.a.tplKept, true, 'template 未被消耗');
  assert.equal(rep.b.img, false, '字符串不作为 HTML 解析');
  assert(rep.b.text.includes('<img'), '字符串按文本显示');
  assert.equal(rep.c.sk, 2, 'loading(true) 还原原始骨架');
  assert.equal(rep.c.busy, 'true', '还原后 aria-busy=true');
  assert.equal(rep.xss, undefined, '无脚本执行');

  // 文档示例：自动加载后出现真实内容
  await sleep(1900);
  const demo = await page.evaluate(() => {
    const host = document.getElementById('skeleton-feed');
    return { busy: host.getAttribute('aria-busy'), btn: !!host.querySelector('.nv-btn'), log: document.getElementById('skeleton-feed-log').textContent };
  });
  assert.equal(demo.busy, 'false', '示例加载完成');
  assert.equal(demo.btn, true, '示例内容换入');
  assert.equal(demo.log, 'nv:loaded', '示例事件');

  await page.click('#skeleton-feed-reload');
  assert.equal(await page.evaluate(() => document.querySelectorAll('#skeleton-feed .nv-skeleton').length > 0), true, '重新加载显示骨架');
};
