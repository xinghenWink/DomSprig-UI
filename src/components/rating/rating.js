/* Nova UI · Rating
 * <div class="nv-rating" data-name="score" data-value="3.5" data-half aria-label="评分"></div>
 * 每颗星是一个原生 radio（半星模式左右各一个，值为 n-0.5 和 n），表单提交、方向键、读屏都由浏览器完成。
 * JS 只做三件事：按 data-value 生成 radio、用 --_fill 画填充比例、悬停时预览。
 * - data-max 几颗星（默认 5）；data-value 初始分；data-half 允许半星；data-clearable 再点当前值清空。
 * - data-readonly 只读（radio 禁用）；容器上的 disabled 属性或 .is-disabled 同样禁用。
 * - data-show-value 在末尾显示当前分数。
 * 事件：原生 change；另外派发 nv:change { value }。
 * 实例：Nova.get(el, 'rating') → { value, clear(), destroy() }
 */
(() => {
  Nova.define('rating', '.nv-rating', (el) => {
    const o = Nova.opts(el, {
      name: '',
      value: 0,
      max: 5,
      half: false,
      clearable: false,
      readonly: false,
      showValue: false,
      size: '',
      color: '',
    });
    const max = Math.max(1, o.max);
    const name = o.name || Nova.uid('nv-rating');
    if (!el.hasAttribute('role')) el.setAttribute('role', 'radiogroup');

    const inputs = [];
    for (let i = 1; i <= max; i++) {
      const item = Nova.h('span', { class: 'nv-rating-item' });
      const steps = o.half ? [i - 0.5, i] : [i];
      for (const v of steps) {
        const input = Nova.h('input', {
          type: 'radio',
          name,
          value: String(v),
          'aria-label': o.half && v % 1 ? `${v} 星` : `${v} 星`,
        });
        if (o.readonly) input.disabled = true;
        inputs.push(input);
        item.append(input);
      }
      el.append(item);
    }

    const valueEl = o.showValue ? Nova.h('span', { class: 'nv-rating-value', 'aria-hidden': 'true' }) : null;
    if (valueEl) el.append(valueEl);

    const current = () => {
      const hit = inputs.find((i) => i.checked);
      return hit ? Number(hit.value) : 0;
    };

    /* —— 填充 —— */
    const paint = (value) => {
      el.querySelectorAll('.nv-rating-item').forEach((item, idx) => {
        const star = idx + 1;
        const fill = Math.max(0, Math.min(1, value - (star - 1)));
        item.style.setProperty('--_fill', String(fill));
      });
      if (valueEl) valueEl.textContent = value ? String(value) : '';
    };

    /* —— 悬停预览 —— */
    const clearPreview = () => {
      el.classList.remove('is-preview');
      el.querySelectorAll('.nv-rating-item').forEach((item) => {
        item.removeAttribute('data-preview');
        item.removeAttribute('data-hover');
        item.style.removeProperty('--_hover-fill');
      });
    };
    const preview = (input) => {
      if (o.readonly || input.disabled) return;
      const v = Number(input.value);
      el.classList.add('is-preview');
      el.querySelectorAll('.nv-rating-item').forEach((item, idx) => {
        const star = idx + 1;
        const fill = Math.max(0, Math.min(1, v - (star - 1)));
        item.style.setProperty('--_hover-fill', String(fill));
        item.toggleAttribute('data-preview', fill > 0 && star < Math.ceil(v));
        item.toggleAttribute('data-hover', star === Math.ceil(v));
      });
    };

    /* —— 事件 —— */
    const onChange = (e) => {
      if (e.target.type !== 'radio') return;
      paint(current());
      Nova.emit(el, 'nv:change', { value: current() });
    };
    // clearable：再点当前选中的 radio 时清空。radio 的 click 在 change 之后，checked 已经是 true。
    const onClick = (e) => {
      const input = e.target.closest('input[type="radio"]');
      if (!input || !o.clearable || input.disabled) return;
      if (input.dataset.wasChecked === 'true') {
        input.checked = false;
        delete input.dataset.wasChecked;
        paint(0);
        Nova.emit(el, 'nv:change', { value: 0 });
      }
    };
    const onPointerDown = (e) => {
      const input = e.target.closest('input[type="radio"]');
      if (input) input.dataset.wasChecked = String(input.checked);
    };
    const onOver = (e) => {
      const input = e.target.closest('input[type="radio"]');
      if (input) preview(input);
    };
    const onLeave = () => clearPreview();

    el.addEventListener('change', onChange);
    el.addEventListener('click', onClick);
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointerover', onOver);
    el.addEventListener('pointerleave', onLeave);

    const form = el.closest('form');
    const onReset = () => setTimeout(() => paint(current()));
    form?.addEventListener('reset', onReset);

    // 初始值：data-value 优先，其次是已 checked 的 radio
    if (o.value > 0) {
      const hit = inputs.find((i) => Number(i.value) === o.value);
      if (hit) hit.checked = true;
    }
    paint(current());

    return {
      get value() { return current(); },
      set value(v) {
        const n = Number(v) || 0;
        const hit = inputs.find((i) => Number(i.value) === n);
        inputs.forEach((i) => { i.checked = i === hit; });
        paint(n);
      },
      clear() {
        inputs.forEach((i) => { i.checked = false; });
        paint(0);
      },
      destroy() {
        el.removeEventListener('change', onChange);
        el.removeEventListener('click', onClick);
        el.removeEventListener('pointerdown', onPointerDown);
        el.removeEventListener('pointerover', onOver);
        el.removeEventListener('pointerleave', onLeave);
        form?.removeEventListener('reset', onReset);
        el.querySelectorAll('.nv-rating-item, .nv-rating-value').forEach((n) => n.remove());
      },
    };
  });
})();
