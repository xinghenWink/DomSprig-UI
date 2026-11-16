/* DomSprig-UI · Skeleton
 * 纯 CSS 即可使用；本文件提供：
 * 1. data-lines="N" 生成 N 行文本占位；data-width / data-height / data-size(数字) / data-ratio 写入尺寸变量
 * 2. 占位骨架自动加 aria-hidden="true"（包裹模式除外）
 * 3. Nova.skeleton.loading(host, on) / Nova.skeleton.replace(host, content)：加载完成后的淡入替换
 */
(() => {
  const { Nova } = window;
  const NUM = /^\d+(\.\d+)?$/;
  const LEN = /^\d+(\.\d+)?(px|%|em|rem|ch|vw|vh)?$/;
  const RATIO = /^\d+(\.\d+)?(\s*\/\s*\d+(\.\d+)?)?$/;
  const MAX_LINES = 50;

  const isWrap = (el) => !el.hasAttribute('data-lines') && (el.children.length > 0 || el.textContent.trim() !== '');
  const resolve = (el) => (typeof el === 'string' ? document.querySelector(el) : el);

  Nova.define('skeleton', '.nv-skeleton', (el) => {
    const owned = new Set(); // 由本组件写入的内联变量，refresh 时只清理这些
    let ownAria = false;

    const setVar = (prop, raw, re, unit) => {
      const v = raw == null ? '' : String(raw).trim();
      if (v && re.test(v)) {
        el.style.setProperty(prop, unit && NUM.test(v) ? `${v}px` : v);
        owned.add(prop);
      } else if (owned.has(prop)) {
        el.style.removeProperty(prop);
        owned.delete(prop);
      }
    };

    function refresh() {
      const d = el.dataset;
      // 只含空白的占位元素清空，保证 :empty 生效
      if (!el.children.length && el.firstChild && !el.textContent.trim()) el.textContent = '';
      setVar('--nv-skeleton-w', d.width, LEN, true);
      setVar('--nv-skeleton-h', d.height, LEN, true);
      setVar('--nv-skeleton-size', NUM.test(d.size || '') ? d.size : '', NUM, true);
      setVar('--nv-skeleton-ratio', d.ratio, RATIO, false);

      if ('lines' in d) {
        const n = Nova.clamp(parseInt(d.lines, 10) || 0, 0, MAX_LINES);
        // data-lines 为空或非数字时保留作者手写的 .nv-skeleton-line（纯 CSS 写法）
        if (n > 0) {
          const lines = [];
          for (let i = 0; i < n; i++) lines.push(Nova.h('span', { class: 'nv-skeleton-line' }));
          el.replaceChildren(...lines);
        }
      }

      if (!isWrap(el) && !el.hasAttribute('aria-hidden')) {
        el.setAttribute('aria-hidden', 'true');
        ownAria = true;
      }
    }
    refresh();

    return {
      refresh,
      destroy() {
        owned.forEach((p) => el.style.removeProperty(p));
        owned.clear();
        if (ownAria) el.removeAttribute('aria-hidden');
        if (el.hasAttribute('data-lines') && NUM.test(el.dataset.lines || '')) el.replaceChildren();
      },
    };
  });

  /* —— 加载完成后的淡入替换 —— */
  const saved = new WeakMap(); // host → 被替换下来的骨架节点，loading(host, true) 时还原

  const fadeIn = (nodes) => {
    if (Nova.reducedMotion()) return;
    const dur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nv-dur-3')) || 260;
    for (const n of nodes) {
      if (n.nodeType !== 1 || !n.animate) continue;
      n.animate(
        [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }],
        { duration: dur, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
      );
    }
  };

  const toNodes = (content) => {
    if (content == null) return [];
    if (typeof content === 'string') return [document.createTextNode(content)]; // 字符串一律按文本处理
    if (content instanceof HTMLTemplateElement) return [...content.content.cloneNode(true).childNodes];
    if (content instanceof DocumentFragment) return [...content.childNodes];
    if (Array.isArray(content) || content instanceof NodeList) return [...content];
    return [content];
  };

  const wrapped = (host) =>
    [host, ...host.querySelectorAll('.nv-skeleton')].filter((s) => s.classList && s.classList.contains('nv-skeleton') && isWrap(s));

  Nova.skeleton = {
    refresh: (el) => Nova.get(resolve(el), 'skeleton')?.refresh(),

    /** 切换加载态：同步 aria-busy；包裹模式的骨架切换 data-loaded；replace 过的容器还原骨架 */
    loading(host, on = true) {
      host = resolve(host);
      if (!host) return;
      host.setAttribute('aria-busy', String(on));
      if (on && saved.has(host)) {
        host.replaceChildren(...saved.get(host));
        saved.delete(host);
      }
      for (const s of wrapped(host)) s.toggleAttribute('data-loaded', !on);
      if (!on) Nova.emit(host, 'nv:loaded', { host });
    },

    /** 用真实内容替换容器内的骨架并淡入。content：Node / DocumentFragment / <template> / 节点数组 / 文本 */
    replace(host, content) {
      host = resolve(host);
      if (!host) return;
      const nodes = toNodes(content);
      if (!saved.has(host)) saved.set(host, [...host.childNodes]);
      host.replaceChildren(...nodes);
      host.setAttribute('aria-busy', 'false');
      fadeIn(nodes);
      Nova.emit(host, 'nv:loaded', { host });
    },
  };
})();
