/* Nova UI · Backdrop
 * [data-nv-meteors="12"]  生成 12 颗流星（.nv-meteor，aria-hidden）；起点、时长、延迟随机，
 *                         飞行距离按容器尺寸计算（ResizeObserver 更新）；离开视口暂停（data-paused）。
 *                         可选 data-speed（时长倍率，默认 1，越大越慢）。实例方法：refresh() / destroy()
 * .nv-bg-aurora           纯 CSS；这里只负责离开视口时暂停动画。
 * 减少动态偏好：不生成流星，极光由 CSS 定格。
 */
(() => {
  const { Nova } = window;

  const pauseOffscreen = (el) => Nova.inView(el, (v) => el.toggleAttribute('data-paused', !v), { once: false, threshold: 0 });

  Nova.define('meteors', '[data-nv-meteors]', (el) => {
    el.setAttribute('aria-hidden', 'true');
    let ro = null;
    const stop = pauseOffscreen(el);

    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w && h) el.style.setProperty('--_dist', `${Math.round(Math.hypot(w, h) * 0.9)}px`);
    };

    const refresh = () => {
      el.querySelectorAll(':scope > .nv-meteor').forEach((m) => m.remove());
      if (Nova.reducedMotion()) return;
      const n = Nova.clamp(Math.round(Number(el.dataset.nvMeteors) || 12), 0, 60);
      const speed = Math.max(0.2, Number(el.dataset.speed) || 1);
      const frag = document.createDocumentFragment();
      for (let i = 0; i < n; i++) {
        const m = Nova.h('span', { class: 'nv-meteor' });
        // 起点铺在顶边与右侧（含容器外），让流星从右上斜向划入
        const onTop = Math.random() < 0.7;
        m.style.setProperty('--_x', `${(onTop ? 10 + Math.random() * 100 : 100 + Math.random() * 15).toFixed(1)}%`);
        m.style.setProperty('--_y', `${(onTop ? -6 - Math.random() * 6 : Math.random() * 55).toFixed(1)}%`);
        m.style.setProperty('--_dur', `${((6 + Math.random() * 6) * speed).toFixed(2)}s`);
        m.style.setProperty('--_delay', `${(-Math.random() * 12 + i * 0.35).toFixed(2)}s`);
        frag.append(m);
      }
      el.append(frag);
      measure();
    };

    refresh();
    if ('ResizeObserver' in window) {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }

    return {
      refresh,
      destroy() {
        stop();
        ro && ro.disconnect();
        el.querySelectorAll(':scope > .nv-meteor').forEach((m) => m.remove());
        el.removeAttribute('data-paused');
      },
    };
  });

  Nova.define('aurora', '.nv-bg-aurora', (el) => {
    const stop = pauseOffscreen(el);
    return { destroy() { stop(); el.removeAttribute('data-paused'); } };
  });
})();
