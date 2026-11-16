// Progress：ARIA、数值显示、set() 平滑过渡、不确定态、分段、环形 SVG、属性同步、纯 CSS 用法
export const components = ['progress'];

export default async ({ page, assert, sleep }) => {
  // 初始化：role / aria / --value / 标签关联 / 自动数值
  const init = await page.evaluate(() => {
    const field = document.querySelector('.nv-progress-field');
    const bar = field.querySelector('.nv-progress');
    const label = field.querySelector('.nv-progress-label');
    const fill = parseFloat(getComputedStyle(bar, '::before').width) / bar.getBoundingClientRect().width;
    return {
      role: bar.getAttribute('role'),
      now: bar.getAttribute('aria-valuenow'),
      min: bar.getAttribute('aria-valuemin'),
      max: bar.getAttribute('aria-valuemax'),
      labelled: bar.getAttribute('aria-labelledby') === label.id && !!label.id,
      text: field.querySelector('.nv-progress-value').textContent,
      v: bar.style.getPropertyValue('--value'),
      fill: Math.round(fill * 100),
    };
  });
  assert.equal(init.role, 'progressbar', 'role=progressbar');
  assert.equal(init.now, '38', 'aria-valuenow');
  assert.equal(init.min + '/' + init.max, '0/100', 'aria-valuemin/max');
  assert(init.labelled, 'aria-labelledby 关联标签');
  assert.equal(init.text, '38%', '自动显示数值');
  assert.equal(init.v, '38', '写入 --value');
  assert.equal(init.fill, 38, '填充宽度 38%');

  // data-max 与手写数值文字不被覆盖
  const maxed = await page.evaluate(() => {
    const bar = document.querySelector('[aria-label="已完成课程"]');
    return { now: bar.getAttribute('aria-valuenow'), max: bar.getAttribute('aria-valuemax'), v: bar.style.getPropertyValue('--value'), text: bar.parentElement.querySelector('.nv-progress-value').textContent };
  });
  assert.equal(maxed.max, '12', 'data-max');
  assert.equal(maxed.v, '58.33', '按 value/max 计算百分比');
  assert.equal(maxed.text, '7 / 12', '手写数值保持不变');

  // 纯 CSS 用法：style="--value:84" 也能读取
  const pure = await page.evaluate(() => {
    const bar = document.querySelector('[aria-label="服务可用性"]');
    return { now: bar.getAttribute('aria-valuenow'), w: Math.round(parseFloat(getComputedStyle(bar, '::before').width) / bar.getBoundingClientRect().width * 100) };
  });
  assert.equal(pure.now, '84', '读取 style --value');
  assert.equal(pure.w, 84, '纯 CSS 宽度');

  // Nova.progress.set：数值滚动过渡、宽度过渡、clamp、aria-valuetext
  const setRes = await page.evaluate(async () => {
    const field = document.querySelector('.nv-progress-field');
    const bar = field.querySelector('.nv-progress');
    const out = field.querySelector('.nv-progress-value');
    Nova.progress.set(bar, 90);
    await new Promise((r) => setTimeout(r, 120));
    const mid = parseInt(out.textContent, 10);
    const midW = parseFloat(getComputedStyle(bar, '::before').width) / bar.getBoundingClientRect().width * 100;
    await new Promise((r) => setTimeout(r, 520));
    const end = out.textContent;
    Nova.progress.set(bar, 150);
    const clamped = [bar.getAttribute('aria-valuenow'), bar.style.getPropertyValue('--value')];
    Nova.progress.set(bar, 30, { text: '30 GB / 100 GB' });
    const vt = [bar.getAttribute('aria-valuetext'), out.textContent];
    Nova.progress.set(bar, 40);
    return { mid, midW, end, clamped, vt, vtGone: bar.getAttribute('aria-valuetext'), get: Nova.progress.get(bar) };
  });
  assert(setRes.mid > 38 && setRes.mid < 90, `数值滚动中（${setRes.mid}）`);
  assert(setRes.midW > 38 && setRes.midW < 90, `宽度过渡中（${setRes.midW}）`);
  assert.equal(setRes.end, '90%', '过渡结束显示 90%');
  assert.equal(setRes.clamped.join(), '100,100', '超出最大值被夹紧');
  assert.equal(setRes.vt.join(), '30 GB / 100 GB,30 GB / 100 GB', 'text 写入 aria-valuetext 与数值');
  assert.equal(setRes.vtGone, null, '不传 text 时移除 aria-valuetext');
  assert.equal(setRes.get, 40, 'Nova.progress.get');

  // 不确定态：移除 aria-valuenow，set(null) 进入，set(n) 退出
  const ind = await page.evaluate(() => {
    const bar = document.querySelector('[aria-label="正在同步"]');
    const a = { now: bar.hasAttribute('aria-valuenow'), anim: getComputedStyle(bar, '::before').animationName };
    Nova.progress.set(bar, 50);
    const b = { now: bar.getAttribute('aria-valuenow'), ind: bar.hasAttribute('data-indeterminate') };
    Nova.progress.set(bar, null);
    const c = { now: bar.hasAttribute('aria-valuenow'), ind: bar.hasAttribute('data-indeterminate'), get: Nova.progress.get(bar) };
    return { a, b, c };
  });
  assert.equal(ind.a.now, false, '不确定态无 aria-valuenow');
  assert.equal(ind.a.anim, 'nv-progress-indeterminate', '不确定态动画');
  assert.equal(ind.b.now + '|' + ind.b.ind, '50|false', 'set(50) 退出不确定态');
  assert.equal(ind.c.now + '|' + ind.c.ind + '|' + ind.c.get, 'false|true|null', 'set(null) 进入不确定态');

  // 分段：生成 N 段，当前段部分填充
  const seg = await page.evaluate(async () => {
    const bar = document.querySelector('.nv-progress[data-segments="5"]');
    const segs = [...bar.querySelectorAll('.nv-progress-segment')];
    const fills = () => segs.map((s) => s.style.getPropertyValue('--_fill')).join();
    const a = fills();
    Nova.progress.set(bar, 50);
    const b = fills();
    const delays = segs.map((s) => s.style.getPropertyValue('--_delay')).join();
    return { n: segs.length, a, b, delays, hidden: segs.every((s) => s.getAttribute('aria-hidden') === 'true') };
  });
  assert.equal(seg.n, 5, '生成 5 段');
  assert.equal(seg.a, '1,1,1,0,0', '60% → 前 3 段填满');
  assert.equal(seg.b, '1,1,0.5,0,0', '50% → 第 3 段半满');
  assert(seg.hidden, '分段 aria-hidden');

  // 密码强度示例：输入驱动分段与颜色
  await page.type('#progress-pwd-input', 'Nova2026!');
  const pwd = await page.evaluate(() => {
    const box = document.getElementById('progress-pwd');
    const bar = box.querySelector('.nv-progress');
    return { color: box.dataset.color, now: bar.getAttribute('aria-valuenow'), vt: bar.getAttribute('aria-valuetext') };
  });
  assert.equal(pwd.color, 'success', '强密码为成功色');
  assert.equal(pwd.now, '100', '强度 100');
  assert.equal(pwd.vt, '强度：很强', '强度文字写入 aria-valuetext');

  // 环形：SVG 生成、周长、dashoffset、数值、xs 不显示数值
  await sleep(50);
  const ring = await page.evaluate(() => {
    const el = document.querySelector('.nv-progress-circle[data-value="68"]');
    const bar = el.querySelector('.nv-progress-circle-bar');
    const r = Number(bar.getAttribute('r'));
    const circ = Number(el.style.getPropertyValue('--_circ'));
    const offset = parseFloat(getComputedStyle(bar).strokeDashoffset);
    const xs = document.querySelector('.nv-progress-circle[data-size="xs"]');
    const grad = document.querySelector('.nv-progress-circle[data-variant="gradient"][data-value]');
    return {
      role: el.getAttribute('role'),
      r, circ, offset,
      size: el.getBoundingClientRect().width,
      text: el.querySelector('.nv-progress-circle-value').textContent,
      xsText: !!xs.querySelector('.nv-progress-circle-value'),
      grad: !!grad.querySelector('linearGradient') && getComputedStyle(grad.querySelector('.nv-progress-circle-bar')).stroke.includes('url('),
      custom: document.querySelector('[aria-label="今日目标"] .nv-progress-circle-value').textContent,
    };
  });
  assert.equal(ring.role, 'progressbar', '环形 role');
  assert.equal(ring.size, 72, '默认 72px');
  assert.equal(ring.r, 33, '半径 = (72 - 6) / 2');
  assert(Math.abs(ring.circ - 2 * Math.PI * 33) < 0.01, '周长');
  assert(Math.abs(ring.offset - ring.circ * 0.32) < 0.5, `dashoffset 对应 68%（${ring.offset}）`);
  assert.equal(ring.text, '68%', '圆心数值');
  assert.equal(ring.xsText, false, 'xs 不生成数值');
  assert(ring.grad, '渐变环形使用 SVG 渐变');
  assert.equal(ring.custom, '3/5', '自定义圆心文字保留');

  // 隐藏容器中初始化：显示后 ResizeObserver 补算几何
  const hidden = await page.evaluate(async () => {
    const wrap = Nova.h('div', { hidden: true }, Nova.h('span', { class: 'nv-progress-circle', 'data-value': '50', 'data-size': 'lg', 'aria-label': 'x' }));
    document.body.append(wrap);
    await new Promise((r) => setTimeout(r, 30));
    const el = wrap.firstChild;
    const before = el.style.getPropertyValue('--_circ');
    wrap.hidden = false;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const after = Number(el.style.getPropertyValue('--_circ'));
    wrap.remove();
    return { before, after };
  });
  assert.equal(hidden.before, '', '隐藏时不测量');
  assert(Math.abs(hidden.after - 2 * Math.PI * (120 - 9) / 2) < 0.01, `显示后补算周长（${hidden.after}）`);

  // 直接修改 data-value 属性同步
  const attr = await page.evaluate(async () => {
    const bar = document.querySelector('[aria-label="小号"]');
    bar.dataset.value = '75';
    await new Promise((r) => setTimeout(r, 20));
    return bar.getAttribute('aria-valuenow');
  });
  assert.equal(attr, '75', '修改 data-value 自动更新');

  // 上传示例：开始后进度增加，最终完成与失败状态
  await page.click('#progress-upload-start');
  await sleep(1200);
  const up1 = await page.evaluate(() => [...document.querySelectorAll('#progress-upload .nv-progress')].map((b) => Number(b.getAttribute('aria-valuenow'))));
  assert(up1.every((v) => v > 0), `上传进行中 ${up1}`);
  await sleep(9000);
  const up2 = await page.evaluate(() => [...document.querySelectorAll('#progress-upload .nv-progress-field')].map((f) => f.dataset.color).join());
  assert.equal(up2, 'success,success,danger', `上传结束状态 ${up2}`);
};
