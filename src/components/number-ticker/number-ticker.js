/* DomSprig-UI · Number Ticker
 * <span data-nv-ticker data-value="12890" data-from="0" data-duration="1600" data-decimals="0" data-prefix="¥" data-suffix="+">
 * - 进入视口（Nova.inView）时开始；计数模式用 rAF，结束即停止；里程表模式只切换 transform（CSS 过渡）。
 * - 格式化：Intl.NumberFormat（data-locale，默认 zh-CN，千分位；data-notation="compact" 得到「1.3万」）。
 * - 读屏只读 .nv-sr-only 中的终值，动画层 aria-hidden。
 * - 减少动态：直接显示终值。
 * API：Nova.ticker.set(el, value, { duration })  Nova.ticker.play(el)  Nova.ticker.get(el)
 * 事件：nv:done（detail: { value }）动画结束时派发。
 */
(() => {
  const { Nova } = window;
  const ROLL = 20; // 里程表每列 0–9 两轮，保证任意两位数字之间都能单向滚动
  const fmtCache = new Map();
  const easeOut = (t) => 1 - Math.pow(1 - t, 4);

  function formatter(o) {
    const key = `${o.locale}|${o.decimals}|${o.grouping}|${o.notation}`;
    let nf = fmtCache.get(key);
    if (!nf) {
      const opts = {
        minimumFractionDigits: o.decimals,
        maximumFractionDigits: o.decimals,
        useGrouping: o.grouping,
        notation: o.notation === 'compact' ? 'compact' : 'standard',
      };
      try { nf = new Intl.NumberFormat(o.locale || undefined, opts); } catch (_) { nf = new Intl.NumberFormat(undefined, opts); }
      fmtCache.set(key, nf);
    }
    return nf;
  }
  const parse = (v, fallback) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^\d.eE+-]/g, ''));
    return Number.isFinite(n) ? n : fallback;
  };

  Nova.define('ticker', '[data-nv-ticker]', (el) => {
    const o = Nova.opts(el, {
      value: NaN, from: 0, duration: 1600, delay: 0, decimals: 0, prefix: '', suffix: '',
      locale: 'zh-CN', grouping: true, notation: 'standard', variant: '',
    });
    o.decimals = Nova.clamp(Math.round(o.decimals) || 0, 0, 20);
    const odometer = o.variant === 'odometer';
    const nf = formatter(o);
    const num = (v) => nf.format(v);
    const full = (v) => `${o.prefix}${num(v)}${o.suffix}`;

    let target = parse(Number.isNaN(o.value) ? el.textContent : o.value, 0);
    let shown = parse(o.from, 0);
    let started = false;
    let raf = 0;
    let doneTimer = 0;

    el.classList.add('nv-ticker');
    el.textContent = '';
    const sr = Nova.h('span', { class: 'nv-sr-only' });
    const ghost = Nova.h('span', { class: 'nv-ticker-ghost', 'aria-hidden': 'true' });
    const vis = Nova.h('span', { class: 'nv-ticker-value', 'aria-hidden': 'true' });
    el.append(sr, ghost, vis);
    el.style.setProperty('--_dur', `${Math.max(0, o.duration)}ms`);

    const syncFinal = () => {
      sr.textContent = full(target);
      ghost.textContent = full(target);
    };
    const finish = () => {
      el.removeAttribute('data-rolling');
      Nova.emit(el, 'nv:done', { value: target });
    };

    /* —— 计数模式 —— */
    const count = (from, to, duration) => {
      cancelAnimationFrame(raf);
      if (Nova.reducedMotion() || duration <= 0 || from === to) {
        shown = to;
        vis.textContent = full(to);
        finish();
        return;
      }
      const t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / duration);
        shown = from + (to - from) * easeOut(t);
        vis.textContent = full(t < 1 ? shown : to);
        if (t < 1) raf = requestAnimationFrame(step);
        else { shown = to; raf = 0; finish(); }
      };
      raf = requestAnimationFrame(step);
    };

    /* —— 里程表模式 —— */
    let cells = [];
    let shape = '';
    const shapeOf = (s) => s.replace(/\d/g, '0');
    const place = (cell, idx, instant) => {
      cell.idx = idx;
      cell.strip.style.transition = instant ? 'none' : '';
      cell.strip.style.transform = `translateY(${(-idx * 100) / ROLL}%)`;
    };
    const build = (numStr, fromStr) => {
      vis.textContent = '';
      cells = [];
      shape = shapeOf(numStr);
      if (o.prefix) vis.append(Nova.h('span', { class: 'nv-odo-sym' }, o.prefix));
      const fromDigits = fromStr.replace(/\D/g, '');
      const len = numStr.replace(/\D/g, '').length;
      const padded = fromDigits.padStart(len, '0').slice(-len);
      let k = 0;
      for (const ch of numStr) {
        if (!/\d/.test(ch)) { vis.append(Nova.h('span', { class: 'nv-odo-sym' }, ch)); continue; }
        const strip = Nova.h('span', { class: 'nv-odo-strip' });
        for (let i = 0; i < ROLL; i++) strip.append(Nova.h('span', null, String(i % 10)));
        vis.append(Nova.h('span', { class: 'nv-odo-digit' }, Nova.h('span', { class: 'nv-odo-ghost' }, '0'), strip));
        const cell = { strip, idx: 0 };
        place(cell, Number(padded[k++]), true);
        cells.push(cell);
      }
      if (o.suffix) vis.append(Nova.h('span', { class: 'nv-odo-sym' }, o.suffix));
    };
    const roll = (from, to, { entry = false, duration = o.duration } = {}) => {
      clearTimeout(doneTimer);
      const numStr = num(to);
      if (shapeOf(numStr) !== shape) build(numStr, num(from));
      const digits = numStr.replace(/\D/g, '');
      const instant = Nova.reducedMotion() || duration <= 0;
      if (instant) {
        cells.forEach((c, i) => place(c, Number(digits[i]), true));
        shown = to;
        finish();
        return;
      }
      const up = to >= from;
      // 第一步：瞬间换到「同一数字」的等价位置，保证接下来单向滚动
      const plan = cells.map((c, i) => {
        const d = c.idx % 10;
        const t = Number(digits[i]);
        if (entry) return up ? [d, t + 10] : [d + 10, t];
        if (t === d) return [c.idx, c.idx];
        return up ? [d, t > d ? t : t + 10] : [d + 10, t < d ? t + 10 : t];
      });
      plan.forEach(([base], i) => place(cells[i], base, true));
      if (cells[0]) getComputedStyle(cells[0].strip).transform; // 提交起点，过渡才会从这里开始
      el.style.setProperty('--_dur', `${duration}ms`);
      el.setAttribute('data-rolling', '');
      plan.forEach(([, next], i) => {
        cells[i].strip.style.setProperty('--_delay', `${i * 45}ms`);
        place(cells[i], next, false);
      });
      shown = to;
      doneTimer = setTimeout(finish, duration + cells.length * 45 + 50);
    };

    const run = (from, to, opts) => (odometer ? roll(from, to, opts) : count(from, to, (opts && opts.duration) ?? o.duration));

    // 初始状态：显示起始值（减少动态时直接显示终值）
    syncFinal();
    const reduced = Nova.reducedMotion();
    if (odometer) build(num(target), num(reduced ? target : shown));
    else vis.textContent = full(reduced ? target : shown);
    if (reduced) shown = target;

    let delayTimer = 0;
    const stopView = Nova.inView(el, () => {
      started = true;
      if (reduced) return;
      delayTimer = setTimeout(() => run(shown, target, { entry: true }), Math.max(0, o.delay));
    }, { threshold: 0.3 });

    const api = {
      get value() { return target; },
      set(value, { duration = o.duration } = {}) {
        const v = parse(value, NaN);
        if (!Number.isFinite(v)) return;
        target = v;
        syncFinal();
        if (!started) { // 还没进入视口：只更新目标，入场时滚动到新值
          if (Nova.reducedMotion()) run(v, v, { duration: 0 });
          return;
        }
        clearTimeout(delayTimer);
        run(shown, v, { duration });
      },
      play() {
        started = true;
        clearTimeout(delayTimer);
        const from = parse(o.from, 0);
        if (odometer) build(num(target), num(from));
        shown = from;
        run(from, target, { entry: true });
      },
      destroy() {
        stopView();
        cancelAnimationFrame(raf);
        clearTimeout(doneTimer);
        clearTimeout(delayTimer);
      },
    };
    return api;
  });

  const inst = (el) => Nova.get(el, 'ticker');
  Nova.ticker = {
    set: (el, value, opts) => inst(el)?.set(value, opts),
    play: (el) => inst(el)?.play(),
    get: (el) => inst(el)?.value,
  };
})();
