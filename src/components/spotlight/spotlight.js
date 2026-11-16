/* DomSprig-UI · Spotlight
 * - 单张 .nv-spotlight：监听自身指针。
 * - .nv-spotlight-group：监听容器，一帧内先批量读取所有卡片位置、再批量写入 --_x/--_y，避免读写交错导致布局抖动。
 * - 指针移动与滚动都用 rAF 合并为每帧一次。
 */
(() => {
  const { Nova } = window;

  function bind(root, getCards) {
    let raf = 0;
    let px = 0;
    let py = 0;
    let inside = false;

    const frame = () => {
      raf = 0;
      const cards = getCards();
      const rects = cards.map((c) => c.getBoundingClientRect()); // 先读
      cards.forEach((c, i) => { // 后写
        c.style.setProperty('--_x', `${(px - rects[i].left).toFixed(1)}px`);
        c.style.setProperty('--_y', `${(py - rects[i].top).toFixed(1)}px`);
      });
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(frame); };
    const onMove = (e) => { px = e.clientX; py = e.clientY; schedule(); };
    const onScroll = () => inside && schedule();
    const onEnter = (e) => {
      inside = true;
      onMove(e);
      getCards().forEach((c) => c.setAttribute('data-active', ''));
      window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    };
    const onLeave = () => {
      inside = false;
      getCards().forEach((c) => c.removeAttribute('data-active'));
      window.removeEventListener('scroll', onScroll, { capture: true });
    };

    root.addEventListener('pointerenter', onEnter);
    root.addEventListener('pointermove', onMove, { passive: true });
    root.addEventListener('pointerdown', onMove, { passive: true });
    root.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      onLeave();
      root.removeEventListener('pointerenter', onEnter);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerdown', onMove);
      root.removeEventListener('pointerleave', onLeave);
    };
  }

  Nova.define('spotlight', '.nv-spotlight', (el) => {
    if (el.closest('.nv-spotlight-group')) return {}; // 由所在分组统一驱动
    return { destroy: bind(el, () => [el]) };
  });

  Nova.define('spotlight-group', '.nv-spotlight-group', (el) => ({
    destroy: bind(el, () => [...el.querySelectorAll('.nv-spotlight')]),
  }));
})();
