/* Nova UI · Border Beam
 * 为 .nv-border-beam 注入装饰层（aria-hidden）：
 * <span class="nv-border-beam-track"><span class="nv-border-beam-light"></span>…</span>
 * - 读取卡片圆角，让光束路径与边框贴合（ResizeObserver 触发时重新读取，兼容隐藏容器内初始化）
 * - 离开视口时暂停动画（data-paused），回到视口继续
 * 实例方法：refresh() 重新读取圆角与光束数；destroy()
 */
(() => {
  const { Nova } = window;

  Nova.define('border-beam', '.nv-border-beam', (el) => {
    let track = el.querySelector(':scope > .nv-border-beam-track');
    const own = !track;
    if (own) {
      track = Nova.h('span', { class: 'nv-border-beam-track', 'aria-hidden': 'true' });
      el.append(track);
    }

    const refresh = () => {
      const n = Nova.clamp(Math.round(Number(el.dataset.beams) || 1), 1, 4);
      const lights = track.querySelectorAll('.nv-border-beam-light');
      for (let i = lights.length; i < n; i++) track.append(Nova.h('span', { class: 'nv-border-beam-light' }));
      for (let i = n; i < lights.length; i++) lights[i].remove();
      track.querySelectorAll('.nv-border-beam-light').forEach((l, k) => l.style.setProperty('--_k', k));
      track.style.setProperty('--_n', n);
      // 圆角：getComputedStyle 在 display:none 时也能取到计算值
      const r = getComputedStyle(el).borderTopLeftRadius.split(' ')[0];
      if (r) track.style.setProperty('--_r', r);
    };
    refresh();

    const ro = 'ResizeObserver' in window ? new ResizeObserver(refresh) : null;
    ro && ro.observe(el);
    const stop = Nova.inView(el, (visible) => el.toggleAttribute('data-paused', !visible), { once: false, threshold: 0 });

    return {
      refresh,
      destroy() {
        stop();
        ro && ro.disconnect();
        el.removeAttribute('data-paused');
        if (own) track.remove();
      },
    };
  });
})();
