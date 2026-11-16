/* Nova UI · Button
 * 纯 CSS 即可使用；本文件只提供两项增强：
 * 1. data-ripple：按压水波纹（任意元素可用，事件委托，动态元素自动生效）
 * 2. Nova.button.loading(el, true|false)：切换加载态并同步 aria-busy
 */
(() => {
  const { Nova } = window;

  document.addEventListener('pointerdown', (e) => {
    const host = e.target.closest && e.target.closest('[data-ripple]');
    if (!host || host.disabled || host.hasAttribute('data-loading') || Nova.reducedMotion()) return;
    const r = host.getBoundingClientRect();
    const size = Math.hypot(r.width, r.height) * 2;
    const dot = document.createElement('span');
    dot.className = 'nv-ripple';
    Object.assign(dot.style, {
      width: `${size}px`,
      height: `${size}px`,
      left: `${e.clientX - r.left - size / 2}px`,
      top: `${e.clientY - r.top - size / 2}px`,
    });
    host.appendChild(dot);
    dot.addEventListener('animationend', () => dot.remove(), { once: true });
  });

  Nova.button = {
    loading(el, on = true) {
      if (typeof el === 'string') el = document.querySelector(el);
      if (!el) return;
      el.toggleAttribute('data-loading', on);
      el.setAttribute('aria-busy', String(on));
    },
  };
})();
