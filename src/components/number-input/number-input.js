/* Nova UI · Number Input
 * <input type="number" class="nv-number" min="0" max="100" step="1">
 * - 独立的 input 会被包进 .nv-control.nv-number-box；已在 .nv-control 里（带前后缀）则直接增强。
 * - data-controls  stacked（默认，右侧上下箭头）| sides（左减右加）| none
 * - data-precision 固定小数位（失焦时补齐，如 1 → 1.00）；不写时按 step / min 的小数位四舍五入，消除浮点误差。
 * - 键盘（WAI-ARIA spinbutton）：↑ ↓ 步进，Shift 或 PageUp / PageDown ×10，Home / End 到 min / max。
 * - 按住按钮连续步进；到边界时对应按钮禁用。
 * - 用户输入越界的值，在原生 change 派发前就被夹回范围内，监听者拿到的是修正后的值。
 * 事件：按钮和键盘修改时派发原生 input、change，并在 input 上派发 nv:change { value }。
 * 实例：Nova.get(input, 'number-input') → { value, stepUp(n), stepDown(n), refresh(), destroy() }
 */
(() => {
  const decimals = (n) => {
    const s = String(n);
    if (s.includes('e-')) return Number(s.split('e-')[1]);
    const i = s.indexOf('.');
    return i < 0 ? 0 : s.length - i - 1;
  };
  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));

  Nova.define('number-input', 'input.nv-number', (input) => {
    const o = Nova.opts(input, { controls: 'stacked', precision: -1, incLabel: '增加', decLabel: '减少' });

    const attr = (name) => {
      const v = input.getAttribute(name);
      return v === null || v === '' ? NaN : Number(v);
    };
    const min = () => attr('min');
    const max = () => attr('max');
    const step = () => {
      const s = attr('step');
      return Number.isFinite(s) && s > 0 ? s : 1;
    };
    const precision = () => (o.precision >= 0
      ? o.precision
      : Math.max(decimals(step()), Number.isFinite(min()) ? decimals(min()) : 0));
    const read = () => (input.value === '' ? NaN : Number(input.value));
    const clamp = (v) => {
      if (Number.isFinite(min()) && v < min()) v = min();
      if (Number.isFinite(max()) && v > max()) v = max();
      return v;
    };
    const format = (v) => {
      const fixed = clamp(Number(v.toFixed(precision())));
      return o.precision >= 0 ? fixed.toFixed(o.precision) : String(fixed);
    };

    /* —— 外框 —— */
    let box = input.parentElement;
    let wrapped = false;
    if (!box || !box.classList.contains('nv-control')) {
      box = Nova.h('div', { class: 'nv-control' });
      for (const k of ['size', 'variant']) if (input.dataset[k]) box.dataset[k] = input.dataset[k];
      input.before(box);
      box.append(input);
      wrapped = true;
    }
    box.classList.add('nv-number-box');
    box.dataset.controls = o.controls;

    const stacked = o.controls !== 'sides';
    const mkBtn = (dir) => Nova.h('button', {
      type: 'button',
      class: 'nv-number-btn',
      'data-dir': dir > 0 ? 'up' : 'down',
      tabindex: '-1',
      'aria-label': dir > 0 ? o.incLabel : o.decLabel,
      html: Nova.icon(stacked ? (dir > 0 ? 'chevron-up' : 'chevron-down') : (dir > 0 ? 'plus' : 'minus'), { size: stacked ? 12 : 15, stroke: stacked ? 2.4 : 2 }),
    });
    const up = mkBtn(1);
    const down = mkBtn(-1);
    let steppers = null;
    if (o.controls === 'sides') {
      box.prepend(down);
      box.append(up);
    } else if (o.controls !== 'none') {
      steppers = Nova.h('span', { class: 'nv-number-steppers' }, up, down);
      box.append(steppers);
    }

    /* —— 状态 —— */
    const sync = () => {
      const v = read();
      const off = input.disabled || input.readOnly;
      up.disabled = off || (Number.isFinite(max()) && Number.isFinite(v) && v >= max());
      down.disabled = off || (Number.isFinite(min()) && Number.isFinite(v) && v <= min());
      if (up.disabled && repeatDir > 0) stopRepeat();
      if (down.disabled && repeatDir < 0) stopRepeat();
    };

    const commit = (v, emit = true) => {
      const next = Number.isFinite(v) ? format(v) : '';
      if (next === input.value) { sync(); return; }
      input.value = next;
      sync();
      if (emit) {
        fire(input, 'input');
        fire(input, 'change');
        Nova.emit(input, 'nv:change', { value: read() });
      }
    };

    const stepBy = (n) => {
      if (input.disabled || input.readOnly) return;
      const cur = read();
      const next = Number.isFinite(cur)
        ? cur + n * step()
        : (n > 0 && Number.isFinite(min()) ? min() : n * step());
      commit(next);
    };

    /* —— 按住连续步进 —— */
    let delayTimer = 0;
    let repeatTimer = 0;
    let repeatDir = 0;
    const stopRepeat = () => {
      clearTimeout(delayTimer);
      clearInterval(repeatTimer);
      repeatDir = 0;
    };
    const bindButton = (btn, dir) => {
      btn.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || btn.disabled) return;
        e.preventDefault(); // 不抢焦点
        stepBy(dir);
        stopRepeat();
        repeatDir = dir;
        delayTimer = setTimeout(() => { repeatTimer = setInterval(() => stepBy(dir), 60); }, 400);
        try { btn.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => btn.addEventListener(t, stopRepeat));
      // 读屏的虚拟光标激活按钮时只有 click（detail 为 0），没有 pointerdown
      btn.addEventListener('click', (e) => { if (e.detail === 0) stepBy(dir); });
    };
    bindButton(up, 1);
    bindButton(down, -1);

    /* —— 键盘 —— */
    const onKey = (e) => {
      if (input.disabled || input.readOnly || e.altKey || e.ctrlKey || e.metaKey) return;
      switch (e.key) {
        case 'ArrowUp': stepBy(e.shiftKey ? 10 : 1); break;
        case 'ArrowDown': stepBy(e.shiftKey ? -10 : -1); break;
        case 'PageUp': stepBy(10); break;
        case 'PageDown': stepBy(-10); break;
        case 'Home': if (!Number.isFinite(min())) return; commit(min()); break;
        case 'End': if (!Number.isFinite(max())) return; commit(max()); break;
        default: return;
      }
      e.preventDefault();
    };

    // 原生 change（用户输入后失焦 / 回车）：捕获阶段先修正，不再额外派发
    const onNativeChange = (e) => {
      if (!e.isTrusted) return;
      const v = read();
      if (Number.isFinite(v)) {
        const next = format(v);
        if (next !== input.value) input.value = next;
      }
      sync();
      Nova.emit(input, 'nv:change', { value: read() });
    };
    // 某些浏览器在输入框获得焦点时滚轮会改值；只在聚焦且指针在框内时拦截
    const onWheel = (e) => {
      if (document.activeElement === input) e.preventDefault();
    };

    input.addEventListener('keydown', onKey);
    input.addEventListener('input', sync);
    input.addEventListener('change', onNativeChange, true);
    input.addEventListener('wheel', onWheel, { passive: false });
    const form = input.form;
    const onReset = () => setTimeout(sync);
    form?.addEventListener('reset', onReset);
    const mo = new MutationObserver(sync);
    mo.observe(input, { attributes: true, attributeFilter: ['min', 'max', 'step', 'disabled', 'readonly'] });

    // 初始值只补齐固定小数位，不夹范围（保留服务端回填的越界值，交给校验提示）
    if (o.precision >= 0 && Number.isFinite(read())) input.value = read().toFixed(o.precision);
    sync();

    return {
      get value() { return read(); },
      set value(v) { commit(v === '' || v == null ? NaN : Number(v), false); },
      stepUp: (n = 1) => stepBy(n),
      stepDown: (n = 1) => stepBy(-n),
      refresh: sync,
      destroy() {
        stopRepeat();
        mo.disconnect();
        input.removeEventListener('keydown', onKey);
        input.removeEventListener('input', sync);
        input.removeEventListener('change', onNativeChange, true);
        input.removeEventListener('wheel', onWheel);
        form?.removeEventListener('reset', onReset);
        up.remove();
        down.remove();
        steppers?.remove();
        box.classList.remove('nv-number-box');
        delete box.dataset.controls;
        if (wrapped) { box.before(input); box.remove(); }
      },
    };
  });
})();
