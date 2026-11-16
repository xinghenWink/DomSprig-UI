/* DomSprig-UI · Switch
 * 纯 CSS 即可使用；本文件只提供：
 * 1. data-loading 时拦截点击与空格键（保持当前状态），并同步 aria-busy
 * 2. Nova.switch.loading(el, true|false)
 */
(() => {
  const { Nova } = window;
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t && t.matches && t.matches('.nv-switch[data-loading]')) e.preventDefault();
  }, true);

  Nova.switch = {
    loading(el, on = true) {
      if (typeof el === 'string') el = document.querySelector(el);
      if (!el) return;
      el.toggleAttribute('data-loading', on);
      el.setAttribute('aria-busy', String(on));
    },
  };
})();
