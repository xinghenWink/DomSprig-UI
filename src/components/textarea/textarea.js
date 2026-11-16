/* Nova UI · Textarea
 * data-autosize                 随内容自动增高；data-min-rows（默认取 rows 或 2）/ data-max-rows（超过后出现滚动条）
 * maxlength + data-count         右下角字数统计
 * 实例：Nova.get(el, 'textarea') → { resize, refresh, destroy }；Nova.textarea.resize(el) 脚本改值后调用
 */
(() => {
  const { Nova } = window;
  const COPY = ['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'wordSpacing',
    'textIndent', 'textTransform', 'tabSize', 'whiteSpace', 'wordBreak', 'overflowWrap'];
  let shadow = null;
  // 共用一个隐藏的测量 textarea：不改动真实元素高度，避免页面跳动
  const measure = (ta, rows) => {
    if (!shadow) {
      shadow = Nova.h('textarea', { 'aria-hidden': 'true', tabindex: '-1', class: 'nv-textarea-shadow' });
      Object.assign(shadow.style, { position: 'absolute', top: '0', left: '-9999px', height: '0', minHeight: '0', overflow: 'hidden', visibility: 'hidden', pointerEvents: 'none', resize: 'none' });
    }
    if (!shadow.isConnected) document.body.append(shadow);
    const cs = getComputedStyle(ta);
    for (const k of COPY) shadow.style[k] = cs[k];
    shadow.style.width = `${ta.getBoundingClientRect().width}px`;
    const bord = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    shadow.value = 'x';
    const line = shadow.scrollHeight - pad;
    shadow.value = ta.value || ta.placeholder || 'x';
    const content = shadow.scrollHeight - pad;
    return { content, line, extra: pad + bord, rows };
  };

  Nova.define('textarea', 'textarea:is([data-autosize], [data-count])', (ta) => {
    const o = Nova.opts(ta, { autosize: false, count: false, minRows: Number(ta.getAttribute('rows')) || 2, maxRows: 0 });
    const cleanups = [];
    const on = (t, type, fn) => { t.addEventListener(type, fn); cleanups.push(() => t.removeEventListener(type, fn)); };
    let box = null;
    let countEl = null;
    const max = Number(ta.getAttribute('maxlength')) || 0;

    if (o.count) {
      box = Nova.h('div', { class: 'nv-textarea-box' });
      ta.before(box);
      box.append(ta);
      countEl = box.appendChild(Nova.h('span', { class: 'nv-textarea-count', 'aria-hidden': 'true' }));
    }

    let lastWidth = 0;
    const resize = () => {
      if (!o.autosize || !ta.getClientRects().length) return;
      const m = measure(ta);
      const lines = Math.max(1, m.line);
      const min = o.minRows * lines;
      const maxH = o.maxRows > 0 ? o.maxRows * lines : Infinity;
      const h = Math.min(Math.max(m.content, min), maxH);
      ta.style.height = `${Math.ceil(h + m.extra)}px`;
      ta.style.overflowY = m.content > maxH ? 'auto' : 'hidden';
    };
    const refresh = () => {
      if (countEl) {
        const len = [...ta.value].length;
        countEl.textContent = max ? `${len}/${max}` : String(len);
        countEl.toggleAttribute('data-full', !!max && len >= max);
      }
      resize();
    };
    on(ta, 'input', refresh);
    if (ta.form) on(ta.form, 'reset', () => setTimeout(refresh));

    // 宽度变化（含从隐藏变为可见）时重新计算
    let ro = null;
    if (o.autosize && 'ResizeObserver' in window) {
      ro = new ResizeObserver((entries) => {
        const w = entries[0].contentRect.width;
        if (w && w !== lastWidth) { lastWidth = w; resize(); }
      });
      ro.observe(ta);
    }
    refresh();

    return {
      resize,
      refresh,
      destroy() {
        cleanups.forEach((f) => f());
        ro && ro.disconnect();
        ta.style.height = '';
        ta.style.overflowY = '';
        if (box) { box.before(ta); box.remove(); }
      },
    };
  });

  Nova.textarea = {
    resize: (el) => Nova.get(el, 'textarea')?.refresh(),
  };
})();
