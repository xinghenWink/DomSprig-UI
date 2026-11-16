/* DomSprig-UI · Marquee
 * - 首次初始化把子元素包进 .nv-marquee-track > .nv-marquee-group（也可以自己写好这两层）。
 * - ResizeObserver 在可见时测量：副本数 = ceil(容器 / 一组) + 1，至少 2 份；副本 aria-hidden + inert，并去掉 id。
 * - data-speed（px/s）按一组的长度换算动画时长。离开视口时暂停（data-paused）。
 * 实例：Nova.get(el, 'marquee').refresh() 内容变化后重建副本。
 */
(() => {
  const { Nova } = window;

  Nova.define('marquee', '.nv-marquee', (el) => {
    let track = el.querySelector(':scope > .nv-marquee-track');
    if (!track) {
      const group = Nova.h('div', { class: 'nv-marquee-group' });
      group.append(...el.childNodes);
      track = Nova.h('div', { class: 'nv-marquee-track' }, group);
      el.append(track);
    }
    const group = track.querySelector(':scope > .nv-marquee-group:not([aria-hidden])') || track.firstElementChild;
    const clones = () => [...track.querySelectorAll(':scope > .nv-marquee-group[aria-hidden="true"]')];

    const makeClone = () => {
      const c = group.cloneNode(true);
      c.setAttribute('aria-hidden', 'true');
      c.inert = true;
      c.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
      return c;
    };
    const setCopies = (copies) => {
      const list = clones();
      for (let i = list.length + 1; i < copies; i++) track.append(makeClone());
      for (let i = copies - 1; i < list.length; i++) list[i].remove();
      track.style.setProperty('--_copies', copies);
    };

    const fill = () => {
      const vertical = el.hasAttribute('data-vertical');
      const box = vertical ? el.clientHeight : el.clientWidth;
      const size = vertical ? group.offsetHeight : group.offsetWidth;
      if (!box || !size) return; // 隐藏容器中：等可见后 ResizeObserver 再触发
      const speed = Number(el.dataset.speed);
      if (speed > 0) el.style.setProperty('--_dur', `${(size / speed).toFixed(2)}s`);
      setCopies(Math.max(2, Math.ceil(box / size) + 1));
    };

    setCopies(Math.max(2, clones().length + 1)); // 测量前先保证至少一份副本
    const ro = 'ResizeObserver' in window ? new ResizeObserver(() => fill()) : null;
    if (ro) { ro.observe(el); ro.observe(group); }
    const stopView = Nova.inView(el, (visible) => el.toggleAttribute('data-paused', !visible), { once: false, threshold: 0 });

    return {
      refresh() {
        clones().forEach((c) => c.remove());
        setCopies(2);
        fill();
      },
      destroy() {
        ro && ro.disconnect();
        stopView();
        el.removeAttribute('data-paused');
      },
    };
  });
})();
