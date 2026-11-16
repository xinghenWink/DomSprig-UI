/* DomSprig-UI · Confetti 彩带
 * Nova.confetti({ x, y, particleCount, spread, angle, velocity, gravity, drag, scalar, colors, shapes }) → Promise
 *   x / y 是视口比例（0–1），默认 0.5 / 0.6（屏幕中央偏下）；angle 90 表示朝上，spread 为扇形张角（度）。
 * Nova.confetti.burst(el, opts)   从元素中心喷出（颜色读取该元素所在处的 --nv-hue）
 * Nova.confetti.reset()           立即清空并移除画布
 * <button data-confetti>          点击时从按钮喷出；data-confetti="screen" 从屏幕中央偏下喷出；
 *                                 其余配置写成 data-particle-count / data-spread / data-colors="a|b" 等
 * - 一张共享画布（按 devicePixelRatio 缩放，最高 2 倍），所有粒子落完即停止 rAF 并移除画布
 * - 物理：初速度 + 空气阻力 + 重力（接近终端速度后缓慢飘落）+ 左右摆动 + 旋转 + 翻面（按 cos 缩放）
 * - 减少动态偏好：不播放，Promise 立即 resolve
 */
(() => {
  const { Nova } = window;
  const SHAPES = ['square', 'circle', 'strip'];
  const DEFAULTS = {
    x: 0.5, y: 0.6, particleCount: 80, spread: 60, angle: 90,
    velocity: 30, gravity: 1, drag: 0.92, scalar: 1, colors: null, shapes: SHAPES,
  };
  // 默认配色：主色 + 主色相两侧偏移 + 语义色，全部从 token 推导，随 --nv-hue 与明暗主题变化
  const PALETTE = [
    'var(--nv-primary)',
    'oklch(0.72 0.18 calc(var(--nv-hue) + 60))',
    'oklch(0.68 0.19 calc(var(--nv-hue) - 60))',
    'var(--nv-warning)',
    'var(--nv-success)',
  ];
  const FRAME = 1000 / 60;
  const MAX_DPR = 2;

  let canvas = null;
  let ctx = null;
  let raf = 0;
  let last = 0;
  let dpr = 1;
  let W = 0;
  let H = 0;
  let dirty = true;
  let parts = [];
  let waiters = [];

  const onResize = () => { dirty = true; };

  /** 把任意 CSS 颜色表达式（含 var() / light-dark()）解析成画布可用的颜色串 */
  function resolveColors(list, ctxEl) {
    const host = ctxEl && ctxEl.isConnected ? ctxEl : document.body;
    const probe = Nova.h('span', { 'aria-hidden': 'true', hidden: true });
    host.append(probe);
    const out = [];
    for (const c of list) {
      probe.style.color = '';
      probe.style.color = c;
      if (probe.style.color) out.push(getComputedStyle(probe).color);
    }
    probe.remove();
    return out.length ? out : ['currentColor'];
  }

  function ensureCanvas() {
    if (canvas) return;
    canvas = Nova.h('canvas', { class: 'nv-confetti-canvas', 'aria-hidden': 'true', popover: 'manual' });
    document.body.append(canvas);
    // 进入顶层，保证在模态对话框之上也可见；不支持 popover 时依赖 CSS 的 z-index
    try { canvas.showPopover && canvas.showPopover(); } catch (e) { /* 忽略 */ }
    ctx = canvas.getContext('2d');
    dirty = true;
    window.addEventListener('resize', onResize);
  }

  function teardown() {
    cancelAnimationFrame(raf);
    raf = 0;
    parts = [];
    if (canvas) {
      window.removeEventListener('resize', onResize);
      canvas.remove();
      canvas = ctx = null;
    }
    const list = waiters;
    waiters = [];
    list.forEach((fn) => fn());
  }

  function fit() {
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    dirty = false;
  }

  function frame(now) {
    raf = 0;
    if (!canvas) return;
    if (dirty) fit();
    const dt = Math.min(now - last, 50);
    last = now;
    const k = dt / FRAME;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let alive = 0;
    for (const p of parts) {
      p.age += dt;
      const d = Math.pow(p.drag, k);
      p.vx *= d;
      p.vy = p.vy * d + p.g * k;
      p.wob += p.wobSpeed * k;
      p.x += (p.vx + Math.cos(p.wob) * p.sway) * k;
      p.y += p.vy * k;
      p.rot += p.spin * k;
      p.flip += p.flipSpeed * k;
      const fade = Math.min(1, (p.life - p.age) / 700);
      if (fade <= 0 || p.y > H + 40) continue;
      parts[alive++] = p;

      const c = Math.cos(p.rot) * dpr;
      const s = Math.sin(p.rot) * dpr;
      const f = Math.cos(p.flip);
      ctx.setTransform(c, s, -s * f, c * f, p.x * dpr, p.y * dpr);
      ctx.globalAlpha = fade;
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'strip') {
        ctx.fillRect(-p.size * 0.22, -p.size * 0.85, p.size * 0.44, p.size * 1.7);
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      }
    }
    parts.length = alive;
    ctx.globalAlpha = 1;
    if (alive) raf = requestAnimationFrame(frame);
    else teardown();
  }

  function fire(opts = {}, ctxEl) {
    const o = { ...DEFAULTS, ...opts };
    if (Nova.reducedMotion()) return Promise.resolve();
    const count = Nova.clamp(Math.round(Number(o.particleCount) || 0), 0, 600);
    if (!count) return Promise.resolve();
    const toList = (v) => (Array.isArray(v) ? v : String(v).split('|')).map((s) => String(s).trim()).filter(Boolean);
    const colors = resolveColors(o.colors ? toList(o.colors) : PALETTE, ctxEl);
    let shapes = toList(o.shapes || SHAPES).filter((s) => SHAPES.includes(s));
    if (!shapes.length) shapes = SHAPES;

    ensureCanvas();
    if (dirty) fit();
    const ox = Number(o.x) * W;
    const oy = Number(o.y) * H;
    const angle = (Number(o.angle) * Math.PI) / 180;
    const spread = (Number(o.spread) * Math.PI) / 180;
    const drag = Nova.clamp(Number(o.drag), 0.5, 0.995);
    const g = 0.32 * Number(o.gravity);
    const scalar = Math.max(0.1, Number(o.scalar) || 1);
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const speed = Number(o.velocity) * (0.55 + Math.random() * 0.45);
      parts.push({
        x: ox, y: oy,
        vx: Math.cos(a) * speed,
        vy: -Math.sin(a) * speed,
        g: g * (0.75 + Math.random() * 0.5),
        drag,
        size: (6 + Math.random() * 5) * scalar,
        color: colors[i % colors.length],
        shape: shapes[Math.floor(Math.random() * shapes.length)],
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.3,
        flip: Math.random() * Math.PI * 2,
        flipSpeed: 0.08 + Math.random() * 0.12,
        wob: Math.random() * Math.PI * 2,
        wobSpeed: 0.04 + Math.random() * 0.06,
        sway: 0.3 + Math.random() * 0.5,
        age: 0,
        life: 3000 + Math.random() * 1600,
      });
    }
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    return new Promise((resolve) => waiters.push(resolve));
  }

  const confetti = (opts) => fire(opts, null);

  confetti.burst = (el, opts = {}) => {
    if (typeof el === 'string') el = document.querySelector(el);
    if (!el) return Promise.resolve();
    const r = el.getBoundingClientRect();
    return fire({
      particleCount: 60, spread: 70, velocity: 24,
      ...opts,
      x: (r.left + r.width / 2) / window.innerWidth,
      y: (r.top + r.height / 2) / window.innerHeight,
    }, el);
  };

  confetti.reset = () => teardown();

  Nova.confetti = confetti;

  // 声明式：<button data-confetti>，配置从 data-* 读取
  const DATA = { particleCount: 0, spread: 0, angle: 0, velocity: 0, gravity: 0, drag: 0, scalar: 0, colors: '', shapes: '', x: 0, y: 0 };
  document.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('[data-confetti]');
    if (!el || el.matches(':disabled, [aria-disabled="true"]')) return;
    const read = Nova.opts(el, DATA);
    const o = {};
    for (const key in DATA) if (key in el.dataset && el.dataset[key] !== '') o[key] = read[key];
    if (el.dataset.confetti === 'screen') fire(o, el);
    else confetti.burst(el, o);
  });
})();
