/* Nova UI · Progress
 * 增强 .nv-progress（线性）与 .nv-progress-circle（环形）：
 * - 写入 role="progressbar"、aria-valuemin/max/now（不确定态移除 valuenow）与 --value；
 * - 同一 .nv-progress-field 内的 .nv-progress-label 自动关联为 aria-labelledby，.nv-progress-value 自动显示数值（数字滚动过渡）；
 * - data-segments="5" 生成分段；环形生成 SVG（ResizeObserver 测量尺寸，按像素计算粗细）；
 * - 监听 data-value / data-max / data-indeterminate 属性变化（框架直接改属性也会更新）。
 * Nova.progress.set(el, value, { text })   value 为 null 时进入不确定态
 * Nova.progress.get(el) → 当前值
 */
(() => {
  const { Nova } = window;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs) => {
    const n = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };
  const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
  const fmt = (pct) => `${Math.round(pct)}%`;

  Nova.define('progress', '.nv-progress, .nv-progress-circle', (el) => {
    const circle = el.classList.contains('nv-progress-circle');
    const o = Nova.opts(el, { segments: 0, label: '进度', showValue: true, thickness: 0 });
    const field = circle ? null : el.closest('.nv-progress-field');

    const readValue = () => {
      if (el.hasAttribute('data-indeterminate')) return null;
      const raw = el.dataset.value ?? el.style.getPropertyValue('--value');
      const n = parseFloat(raw);
      return Number.isFinite(n) ? n : 0;
    };
    const readMax = () => {
      const m = parseFloat(el.dataset.max);
      return Number.isFinite(m) && m > 0 ? m : 100;
    };

    let value = readValue();
    let max = readMax();
    let text = null;            // 自定义数值文字（同时作为 aria-valuetext）
    let shown = null;           // 数值文字当前显示的百分比（用于数字滚动）
    let raf = 0;

    // —— ARIA ——
    el.setAttribute('role', 'progressbar');
    el.setAttribute('aria-valuemin', '0');
    const label = field && field.querySelector('.nv-progress-label');
    if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) {
      if (label) {
        if (!label.id) label.id = Nova.uid('nv-progress-label');
        el.setAttribute('aria-labelledby', label.id);
      } else el.setAttribute('aria-label', o.label);
    }

    // —— 数值文字 ——
    let valueEl = circle ? el.querySelector('.nv-progress-circle-value') : field && field.querySelector('.nv-progress-value');
    if (circle && !valueEl && !el.children.length && o.showValue && el.dataset.size !== 'xs') {
      valueEl = Nova.h('span', { class: 'nv-progress-circle-value', 'aria-hidden': 'true' });
      el.append(valueEl);
    }
    // 只有为空或写着 {value} 占位的数值元素才由组件接管
    const autoText = valueEl && (!valueEl.textContent.trim() || valueEl.hasAttribute('data-auto'));
    if (autoText) valueEl.setAttribute('data-auto', '');

    // —— 分段 ——
    let segs = [];
    if (!circle && o.segments > 1) {
      const n = Math.min(Math.round(o.segments), 50);
      el.style.setProperty('--_n', n);
      segs = Array.from({ length: n }, (_, i) => {
        const s = Nova.h('span', { class: 'nv-progress-segment', 'aria-hidden': 'true' });
        s.style.setProperty('--_i', i);
        return s;
      });
      el.replaceChildren(...segs);
    }

    // —— 环形 SVG ——
    let ro = null;
    let geo = '';
    if (circle) {
      const s = svg('svg', { class: 'nv-progress-circle-svg', 'aria-hidden': 'true', focusable: 'false' });
      const track = svg('circle', { class: 'nv-progress-circle-track' });
      const bar = svg('circle', { class: 'nv-progress-circle-bar' });
      if (el.dataset.variant === 'gradient') {
        const id = Nova.uid('nv-progress-grad');
        const grad = svg('linearGradient', { id, x1: '0', y1: '0', x2: '1', y2: '1' });
        grad.append(svg('stop', { offset: '0', class: 'nv-progress-circle-stop-1' }), svg('stop', { offset: '1', class: 'nv-progress-circle-stop-2' }));
        const defs = svg('defs', {});
        defs.append(grad);
        s.append(defs);
        el.style.setProperty('--_grad-url', `url(#${id})`);
      }
      s.append(track, bar);
      el.prepend(s);
      const layout = (size) => {
        if (!size) return;
        const cssThick = parseFloat(getComputedStyle(el).getPropertyValue('--_thick'));
        const t = Nova.clamp(o.thickness || cssThick || size * 0.085, 1, size / 2);
        const key = `${size}|${t}`;
        if (key === geo) return;
        geo = key;
        const r = (size - t) / 2;
        s.setAttribute('viewBox', `0 0 ${size} ${size}`);
        for (const c of [track, bar]) {
          c.setAttribute('cx', size / 2);
          c.setAttribute('cy', size / 2);
          c.setAttribute('r', r);
          c.setAttribute('stroke-width', t);
        }
        // 首次布局时不做过渡，避免从 0 扫到当前值
        bar.style.transition = 'none';
        el.style.setProperty('--_circ', round(2 * Math.PI * r, 3));
        bar.getBoundingClientRect();
        bar.style.transition = '';
      };
      if ('ResizeObserver' in window) {
        ro = new ResizeObserver((entries) => {
          const box = entries[entries.length - 1].contentRect;
          layout(Math.round(Math.min(box.width, box.height)));
        });
        ro.observe(el);
      }
    }

    // —— 渲染 ——
    const paintText = (pct) => {
      if (!autoText) return;
      valueEl.textContent = text != null ? text : pct == null ? '' : fmt(pct);
    };
    const animateText = (from, to) => {
      cancelAnimationFrame(raf);
      if (from == null || to == null || text != null || Nova.reducedMotion() || Math.abs(to - from) < 1 || !el.getClientRects().length) {
        shown = to;
        paintText(to);
        return;
      }
      const t0 = performance.now();
      const dur = 420;
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        const e = 1 - (1 - k) ** 3;
        shown = from + (to - from) * e;
        paintText(shown);
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };

    function render({ animate = true } = {}) {
      const indeterminate = value == null;
      const pct = indeterminate ? null : Nova.clamp((value / max) * 100, 0, 100);
      el.toggleAttribute('data-indeterminate', indeterminate);
      el.setAttribute('aria-valuemax', String(max));
      if (indeterminate) {
        el.removeAttribute('aria-valuenow');
        el.style.removeProperty('--value');
      } else {
        el.setAttribute('aria-valuenow', String(round(Nova.clamp(value, 0, max))));
        el.style.setProperty('--value', round(pct));
      }
      if (text != null) el.setAttribute('aria-valuetext', text);
      else el.removeAttribute('aria-valuetext');
      if (circle) el.toggleAttribute('data-empty', pct === 0);
      if (segs.length) {
        const n = segs.length;
        const prev = segs.map((s) => parseFloat(s.style.getPropertyValue('--_fill')) || 0);
        const fills = segs.map((_, i) => (pct == null ? 0 : Nova.clamp((pct / 100) * n - i, 0, 1)));
        // 依次填充：增长时从左到右，回退时从右到左
        const growing = fills.reduce((a, b) => a + b, 0) >= prev.reduce((a, b) => a + b, 0);
        const order = segs.map((_, i) => (growing ? i : n - 1 - i));
        let k = 0;
        for (const j of order) {
          const changed = Math.abs(fills[j] - prev[j]) > 0.001;
          segs[j].style.setProperty('--_delay', `${animate && changed ? k++ * 60 : 0}ms`);
          segs[j].style.setProperty('--_fill', round(fills[j], 4));
        }
      }
      if (animate) animateText(shown, pct);
      else { shown = pct; paintText(pct); }
    }

    // —— 属性同步（外部直接改 data-value 也生效） ——
    let syncing = false;
    const mo = new MutationObserver(() => {
      if (syncing) return;
      const v = readValue();
      const m = readMax();
      if (v === value && m === max) return;
      value = v;
      max = m;
      render();
    });
    mo.observe(el, { attributes: true, attributeFilter: ['data-value', 'data-max', 'data-indeterminate'] });

    function set(v, opts = {}) {
      value = v == null || v === '' ? null : Number(v);
      if (value != null && !Number.isFinite(value)) value = 0;
      if (opts.max != null) max = Number(opts.max) > 0 ? Number(opts.max) : max;
      text = opts.text != null ? String(opts.text) : null;
      syncing = true;
      if (value == null) {
        el.removeAttribute('data-value');
        el.setAttribute('data-indeterminate', '');
      } else {
        el.dataset.value = String(value);
        el.removeAttribute('data-indeterminate');
      }
      if (opts.max != null) el.dataset.max = String(max);
      mo.takeRecords();
      syncing = false;
      render({ animate: opts.animate !== false });
    }

    // 首次渲染不做宽度/弧长过渡：临时关闭 transition，强制计算一次样式后恢复
    el.setAttribute('data-instant', '');
    render({ animate: false });
    void getComputedStyle(el).width;
    el.removeAttribute('data-instant');

    return {
      set,
      get value() { return value; },
      get max() { return max; },
      destroy() {
        mo.disconnect();
        ro && ro.disconnect();
        cancelAnimationFrame(raf);
      },
    };
  });

  const resolveEl = (el) => (typeof el === 'string' ? document.querySelector(el) : el);
  Nova.progress = {
    set(el, value, opts) {
      el = resolveEl(el);
      if (!el) return;
      const inst = Nova.get(el, 'progress');
      if (inst) inst.set(value, opts);
      else if (value == null) el.setAttribute('data-indeterminate', '');
      else { el.removeAttribute('data-indeterminate'); el.dataset.value = String(value); }
    },
    get(el) {
      const inst = Nova.get(resolveEl(el), 'progress');
      return inst ? inst.value : null;
    },
  };
})();
