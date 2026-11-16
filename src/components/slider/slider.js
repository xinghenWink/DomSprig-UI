/* DomSprig-UI · Slider
 * 单值 input[type=range].nv-slider：包进 .nv-slider-box，写入填充比例、数值气泡、刻度。原生 input / change 照常。
 * 范围 .nv-slider-range：两个 role="slider" 拇指（方向键、Shift ×10、PageUp/Down、Home/End），不会交叉；
 *      data-name 时生成隐藏 input（值 "20,80"）；拖动时派发 input，松手 / 键盘派发 change 与 nv:change（detail.value = [a, b]）。
 * 实例：Nova.get(el, 'slider') → { value, set(v), refresh(), destroy() }；Nova.slider.set(el, v)
 */
(() => {
  const { Nova } = window;
  const num = (v, d) => (v === '' || v == null || Number.isNaN(Number(v)) ? d : Number(v));
  const decimals = (s) => { const t = String(s); const i = t.indexOf('.'); return i < 0 ? 0 : t.length - i - 1; };
  const SHARED = ['size', 'color', 'tooltip'];

  const makeFormat = (o, prec) => (v) => `${o.prefix}${Number(v).toFixed(prec)}${o.suffix}`;

  // "0,50,100" 或 "0:低,100:高"；带文字的刻度才显示标签
  const parseMarks = (s, min, max) => (s || '').split(',').map((part) => {
    const [v, ...rest] = part.split(':');
    const value = Number(v.trim());
    if (part.trim() === '' || Number.isNaN(value)) return null;
    return { value: Nova.clamp(value, min, max), label: rest.join(':').trim() };
  }).filter(Boolean);

  const buildMarks = (body, marks, ratio) => {
    const dots = [];
    const labels = [];
    for (const m of marks) {
      const r = ratio(m.value);
      const dot = Nova.h('span', { class: 'nv-slider-mark', 'aria-hidden': 'true' });
      dot.style.setProperty('--_m', r);
      body.append(dot);
      dots.push({ el: dot, r });
      if (m.label) {
        const lab = Nova.h('span', { class: 'nv-slider-label', text: m.label });
        lab.style.setProperty('--_m', r);
        if (r <= 0.02) lab.dataset.edge = 'start';
        else if (r >= 0.98) lab.dataset.edge = 'end';
        labels.push({ el: lab, r });
      }
    }
    const wrap = labels.length ? Nova.h('div', { class: 'nv-slider-labels', 'aria-hidden': 'true' }, labels.map((l) => l.el)) : null;
    const all = dots.concat(labels);
    return {
      wrap,
      update(a, b) { for (const m of all) m.el.toggleAttribute('data-active', m.r >= a - 1e-9 && m.r <= b + 1e-9); },
      remove() { all.forEach((m) => m.el.remove()); wrap && wrap.remove(); },
    };
  };

  /* ———————— 单值 ———————— */
  const single = (input) => {
    const o = Nova.opts(input, { prefix: '', suffix: '', tooltip: '', marks: '' });
    const min = () => num(input.min, 0);
    const max = () => num(input.max, 100);
    const prec = decimals(input.step && input.step !== 'any' ? input.step : 1);
    const fmt = makeFormat(o, prec);
    const ratio = (v) => (max() > min() ? Nova.clamp((v - min()) / (max() - min()), 0, 1) : 0);

    const fill = Nova.h('div', { class: 'nv-slider-fill' });
    const track = Nova.h('div', { class: 'nv-slider-track', 'aria-hidden': 'true' }, fill);
    const body = Nova.h('div', { class: 'nv-slider-body' });
    const box = Nova.h('div', { class: 'nv-slider-box' });
    for (const k of SHARED) if (k in input.dataset) box.dataset[k] = input.dataset[k];
    input.before(box);
    box.append(body);
    body.append(track, input);
    const bubble = 'tooltip' in input.dataset ? Nova.h('div', { class: 'nv-slider-bubble', 'aria-hidden': 'true' }) : null;
    if (bubble) body.append(bubble);
    const marks = buildMarks(body, parseMarks(o.marks, min(), max()), ratio);
    if (marks.wrap) box.append(marks.wrap);

    const refresh = () => {
      const v = Number(input.value);
      const p = ratio(v);
      input.style.setProperty('--_p', p);
      fill.style.setProperty('--_b', p);
      body.style.setProperty('--_v', p);
      if (bubble) bubble.textContent = fmt(v);
      if (o.prefix || o.suffix) input.setAttribute('aria-valuetext', fmt(v));
      marks.update(0, p);
    };
    const onDown = () => {
      body.dataset.dragging = '';
      const up = () => { delete body.dataset.dragging; document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); };
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', up);
    };
    input.addEventListener('input', refresh);
    input.addEventListener('change', refresh);
    input.addEventListener('pointerdown', onDown);
    refresh();

    return {
      get value() { return Number(input.value); },
      set(v) { input.value = v; refresh(); },
      refresh,
      destroy() {
        input.removeEventListener('input', refresh);
        input.removeEventListener('change', refresh);
        input.removeEventListener('pointerdown', onDown);
        input.style.removeProperty('--_p');
        if (o.prefix || o.suffix) input.removeAttribute('aria-valuetext');
        box.before(input);
        box.remove();
      },
    };
  };

  /* ———————— 范围 ———————— */
  const range = (root) => {
    const o = Nova.opts(root, { min: 0, max: 100, step: 1, value: '', name: '', prefix: '', suffix: '', tooltip: '', marks: '', disabled: false, labels: '最小值,最大值' });
    const { min, max } = o;
    const step = o.step > 0 ? o.step : 1;
    const prec = decimals(root.dataset.step || step);
    const fmt = makeFormat(o, prec);
    const ratio = (v) => (max > min ? Nova.clamp((v - min) / (max - min), 0, 1) : 0);
    const snap = (v) => Number(Nova.clamp(min + Math.round((v - min) / step) * step, min, max).toFixed(prec));
    const parse = (v) => {
      const arr = (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => num(String(x).trim(), NaN));
      const a = snap(Number.isNaN(arr[0]) ? min : arr[0]);
      const b = snap(Number.isNaN(arr[1]) ? max : arr[1]);
      return a <= b ? [a, b] : [b, a];
    };
    let val = parse(o.value);
    const names = o.labels.split(',');
    const disabled = () => root.hasAttribute('data-disabled');

    const fill = Nova.h('div', { class: 'nv-slider-fill' });
    const track = Nova.h('div', { class: 'nv-slider-track', 'aria-hidden': 'true' }, fill);
    const thumbs = [0, 1].map((i) => {
      const t = Nova.h('div', {
        class: 'nv-slider-thumb', role: 'slider', tabindex: '0',
        'aria-label': (names[i] || '').trim() || (i ? '最大值' : '最小值'), 'aria-orientation': 'horizontal',
      });
      if ('tooltip' in root.dataset) t.append(Nova.h('span', { class: 'nv-slider-bubble', 'aria-hidden': 'true' }));
      return t;
    });
    const body = Nova.h('div', { class: 'nv-slider-body' }, track, thumbs);
    const hidden = o.name ? Nova.h('input', { type: 'hidden', name: o.name }) : null;
    const prevRole = root.getAttribute('role');
    if (!prevRole) root.setAttribute('role', 'group');
    root.append(body);
    if (hidden) root.append(hidden);
    const marks = buildMarks(body, parseMarks(o.marks, min, max), ratio);
    if (marks.wrap) root.append(marks.wrap);

    const render = () => {
      const [a, b] = val;
      fill.style.setProperty('--_a', ratio(a));
      fill.style.setProperty('--_b', ratio(b));
      thumbs.forEach((t, i) => {
        const v = val[i];
        t.style.setProperty('--_v', ratio(v));
        t.setAttribute('aria-valuemin', i ? a : min);
        t.setAttribute('aria-valuemax', i ? max : b);
        t.setAttribute('aria-valuenow', v);
        t.setAttribute('aria-valuetext', fmt(v));
        t.tabIndex = disabled() ? -1 : 0;
        if (disabled()) t.setAttribute('aria-disabled', 'true');
        else t.removeAttribute('aria-disabled');
        const bub = t.firstElementChild;
        if (bub) bub.textContent = fmt(v);
      });
      if (hidden) { hidden.value = val.join(','); hidden.disabled = disabled(); }
      root.dataset.value = val.join(',');
      marks.update(ratio(a), ratio(b));
    };
    const emit = (type) => {
      if (type === 'change') Nova.emit(root, 'nv:change', { value: val.slice() });
      root.dispatchEvent(new Event(type, { bubbles: true }));
    };
    // 拇指 i 设为 v（不越过另一个拇指）；返回是否变化
    const setThumb = (i, v) => {
      v = snap(v);
      v = i ? Math.max(v, val[0]) : Math.min(v, val[1]);
      if (v === val[i]) return false;
      val = i ? [val[0], v] : [v, val[1]];
      render();
      return true;
    };
    const activate = (i) => thumbs.forEach((t, k) => t.toggleAttribute('data-active', k === i));

    const onKey = (e) => {
      const i = thumbs.indexOf(e.currentTarget);
      if (disabled()) return;
      const big = Math.max(step, snap(min + (max - min) / 10) - min);
      const mul = e.shiftKey ? 10 : 1;
      const cur = val[i];
      const map = {
        ArrowRight: cur + step * mul, ArrowUp: cur + step * mul,
        ArrowLeft: cur - step * mul, ArrowDown: cur - step * mul,
        PageUp: cur + big, PageDown: cur - big,
        Home: i ? val[0] : min, End: i ? max : val[1],
      };
      if (!(e.key in map)) return;
      e.preventDefault();
      activate(i);
      if (setThumb(i, map[e.key])) { emit('input'); emit('change'); }
    };

    let drag = null;
    const valueAt = (x) => {
      const rect = body.getBoundingClientRect();
      const tw = thumbs[0].offsetWidth || 18;
      const p = rect.width > tw ? (x - rect.left - tw / 2) / (rect.width - tw) : 0;
      return min + Nova.clamp(p, 0, 1) * (max - min);
    };
    const onDown = (e) => {
      if (disabled() || e.button > 0) return;
      const v = valueAt(e.clientX);
      const hit = thumbs.indexOf(e.target.closest('.nv-slider-thumb'));
      let i = hit;
      if (i < 0) {
        const [a, b] = val;
        i = a === b ? (v < a ? 0 : 1) : Math.abs(v - a) <= Math.abs(v - b) ? 0 : 1;
      }
      e.preventDefault();
      thumbs[i].focus({ preventScroll: true });
      activate(i);
      const start = val.join(',');
      drag = { i, start, id: e.pointerId };
      body.setPointerCapture?.(e.pointerId);
      body.dataset.dragging = '';
      thumbs[i].dataset.dragging = '';
      if (hit < 0 && setThumb(i, v)) emit('input');
    };
    const onMove = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (setThumb(drag.i, valueAt(e.clientX))) emit('input');
    };
    const onUp = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      delete body.dataset.dragging;
      delete thumbs[drag.i].dataset.dragging;
      const changed = val.join(',') !== drag.start;
      drag = null;
      if (changed) emit('change');
    };
    thumbs.forEach((t) => t.addEventListener('keydown', onKey));
    body.addEventListener('pointerdown', onDown);
    body.addEventListener('pointermove', onMove);
    body.addEventListener('pointerup', onUp);
    body.addEventListener('pointercancel', onUp);
    const mo = new MutationObserver(render);
    mo.observe(root, { attributes: true, attributeFilter: ['data-disabled'] });
    render();

    return {
      get value() { return val.slice(); },
      set(v) { val = parse(v); render(); },
      refresh: render,
      destroy() {
        mo.disconnect();
        body.remove();
        hidden && hidden.remove();
        marks.remove();
        if (!prevRole) root.removeAttribute('role');
      },
    };
  };

  Nova.define('slider', 'input[type="range"].nv-slider, .nv-slider-range', (el) => (el.matches('input') ? single(el) : range(el)));

  Nova.slider = {
    set: (el, v) => Nova.get(el, 'slider')?.set(v),
  };
})();
