/* DomSprig-UI · Shimmer Button
 * .nv-shimmer 与 [data-glow] 是纯 CSS；本文件只为 [data-shine] 注入装饰光层：
 * <span class="nv-shine" aria-hidden="true"></span>（放在元素末尾，不参与布局，不影响读屏）
 */
(() => {
  const { Nova } = window;

  Nova.define('shine', '[data-shine]', (el) => {
    let layer = el.querySelector(':scope > .nv-shine');
    const own = !layer;
    if (own) {
      layer = Nova.h('span', { class: 'nv-shine', 'aria-hidden': 'true' });
      el.append(layer);
    }
    return { destroy: () => own && layer.remove() };
  });
})();
