/* Nova UI · Segmented
 * 给 .nv-segmented 加一个滑动指示器，跟随选中的 radio 移动；尺寸变化（字体加载、容器缩放）时重新定位。
 * 原生 change 事件照常冒泡；另外在容器上派发 nv:change { value }。
 * 用 JS 改 input.checked 不会触发事件，改完调用 Nova.get(el, 'segmented').refresh()，或用 .value = 'x'。
 */
(() => {
  Nova.define('segmented', '.nv-segmented', (el) => {
    if (!el.hasAttribute('role')) el.setAttribute('role', 'radiogroup');
    const indicator = Nova.h('span', { class: 'nv-segmented-indicator', 'aria-hidden': 'true' });
    el.prepend(indicator);
    const inputs = () => [...el.querySelectorAll(':scope > label > input[type="radio"]')];

    const place = () => {
      const input = inputs().find((i) => i.checked);
      if (!input) { indicator.style.opacity = '0'; return; }
      const label = input.parentElement;
      indicator.style.opacity = '';
      el.style.setProperty('--_x', `${label.offsetLeft}px`);
      el.style.setProperty('--_w', `${label.offsetWidth}px`);
    };

    place();
    el.classList.add('is-ready');
    // 首次定位后再开启过渡，避免页面加载时指示器从左边滑过来
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-animated')));

    const onChange = (e) => {
      if (!e.target.matches('input[type="radio"]') || !el.contains(e.target)) return;
      place();
      Nova.emit(el, 'nv:change', { value: e.target.value });
    };
    el.addEventListener('change', onChange);
    // 表单 reset 后浏览器在事件之后才恢复 checked，下一帧再定位
    const form = el.closest('form');
    const onReset = () => setTimeout(place);
    form?.addEventListener('reset', onReset);
    const ro = new ResizeObserver(place);
    ro.observe(el);

    return {
      refresh: place,
      get value() { return inputs().find((i) => i.checked)?.value ?? null; },
      set value(v) {
        const hit = inputs().find((i) => i.value === String(v));
        if (hit) { hit.checked = true; place(); }
      },
      destroy() {
        el.removeEventListener('change', onChange);
        form?.removeEventListener('reset', onReset);
        ro.disconnect();
        indicator.remove();
        el.classList.remove('is-ready', 'is-animated');
      },
    };
  });
})();
