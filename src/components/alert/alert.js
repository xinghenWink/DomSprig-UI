/* Nova UI · Alert
 * 自动增强 .nv-alert：
 * - 按 data-color 插入默认图标（data-icon="none" 关闭，data-icon="bell" 换成其它图标）；
 * - 补齐 role：danger / warning → alert（立即播报），其它 → status（礼貌播报）；已写 role 的保持不变；
 * - data-closable：插入关闭按钮，关闭时高度收起动画，派发可取消的 nv:close，结束后设为 hidden 并派发 nv:closed。
 * Nova.alert.close(el) / Nova.alert.show(el)
 */
(() => {
  const { Nova } = window;
  const ICONS = {
    info: 'info',
    primary: 'info',
    neutral: 'info',
    success: 'circle-check',
    warning: 'triangle-alert',
    danger: 'circle-x',
  };

  // 父容器是纵向 flex / grid 时，收起过程中把与相邻元素之间的 gap 一起收掉，避免结束时跳一下
  function gapEdges(el) {
    const parent = el.parentElement;
    if (!parent) return null;
    const ps = getComputedStyle(parent);
    const vertical = (ps.display.includes('flex') && ps.flexDirection.startsWith('column')) || ps.display.includes('grid');
    const gap = vertical ? parseFloat(ps.rowGap) || 0 : 0;
    if (!gap) return null;
    const visible = (n) => n && !n.hidden && n.getClientRects().length;
    let next = el.nextElementSibling;
    while (next && !visible(next)) next = next.nextElementSibling;
    if (next) return { marginBottom: -gap };
    let prev = el.previousElementSibling;
    while (prev && !visible(prev)) prev = prev.previousElementSibling;
    return prev ? { marginTop: -gap } : null;
  }

  // 关闭后焦点不丢失：移到文档顺序中的下一个（没有则上一个）可聚焦元素
  function neighbourFocusable(el) {
    const list = Nova.focusables(document.body).filter((n) => !el.contains(n));
    const after = list.find((n) => el.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (after) return after;
    const before = list.filter((n) => el.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_PRECEDING);
    return before[before.length - 1] || null;
  }

  Nova.define('alert', '.nv-alert', (el) => {
    const o = Nova.opts(el, { color: 'info', icon: '', closable: false, closeLabel: '关闭' });

    if (!el.hasAttribute('role')) el.setAttribute('role', o.color === 'danger' || o.color === 'warning' ? 'alert' : 'status');

    let icon = el.querySelector(':scope > .nv-alert-icon');
    if (!icon && o.icon !== 'none') {
      const html = Nova.icon(o.icon || ICONS[o.color] || 'info', { size: 18, cls: 'nv-alert-icon' });
      if (html) {
        el.insertAdjacentHTML('afterbegin', html);
        icon = el.firstElementChild;
      }
    }

    let closeBtn = el.querySelector(':scope > .nv-alert-close');
    if (!closeBtn && o.closable) {
      closeBtn = Nova.h('button', { type: 'button', class: 'nv-alert-close', 'aria-label': o.closeLabel, html: Nova.icon('x', { size: 16 }) });
      el.append(closeBtn);
    }
    const onClick = () => close();
    closeBtn && closeBtn.addEventListener('click', onClick);

    let anim = null;
    const stop = () => { if (anim) { anim.cancel(); anim = null; } el.style.overflow = ''; };

    function close() {
      if (el.hidden || el.dataset.state === 'closing') return false;
      if (!Nova.emit(el, 'nv:close', { reason: 'close' })) return false;
      const focusTo = el.contains(document.activeElement) ? neighbourFocusable(el) : null;
      const finish = () => {
        stop();
        delete el.dataset.state;
        el.hidden = true;
        if (focusTo && focusTo.isConnected) focusTo.focus({ preventScroll: true });
        Nova.emit(el, 'nv:closed');
      };
      if (Nova.reducedMotion() || !el.animate || !el.getClientRects().length) { finish(); return true; }
      stop();
      el.dataset.state = 'closing';
      const cs = getComputedStyle(el);
      const h = el.getBoundingClientRect().height;
      const from = {
        height: `${h}px`, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom,
        borderTopWidth: cs.borderTopWidth, borderBottomWidth: cs.borderBottomWidth,
        marginTop: cs.marginTop, marginBottom: cs.marginBottom,
      };
      const edge = gapEdges(el) || {};
      const to = {
        height: '0px', paddingTop: '0px', paddingBottom: '0px', borderTopWidth: '0px', borderBottomWidth: '0px',
        marginTop: `${edge.marginTop || 0}px`, marginBottom: `${edge.marginBottom || 0}px`,
      };
      el.style.overflow = 'hidden';
      // 先淡出、略微上移，再收起高度
      anim = el.animate([
        { ...from, opacity: 1, transform: 'none' },
        { ...from, opacity: 0, transform: 'translateY(-4px) scale(0.99)', offset: 0.4 },
        { ...to, opacity: 0, transform: 'translateY(-4px) scale(0.99)' },
      ], { duration: 320, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' });
      anim.onfinish = finish;
      return true;
    }

    function show() {
      if (!el.hidden && el.dataset.state !== 'closing') return;
      stop();
      delete el.dataset.state;
      el.hidden = false;
      Nova.emit(el, 'nv:show');
      if (Nova.reducedMotion() || !el.animate) return;
      const cs = getComputedStyle(el);
      const h = el.getBoundingClientRect().height;
      const full = {
        height: `${h}px`, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom,
        borderTopWidth: cs.borderTopWidth, borderBottomWidth: cs.borderBottomWidth,
        marginTop: cs.marginTop, marginBottom: cs.marginBottom,
      };
      const edge = gapEdges(el) || {};
      el.style.overflow = 'hidden';
      anim = el.animate([
        {
          height: '0px', paddingTop: '0px', paddingBottom: '0px', borderTopWidth: '0px', borderBottomWidth: '0px',
          marginTop: `${edge.marginTop || 0}px`, marginBottom: `${edge.marginBottom || 0}px`, opacity: 0, transform: 'translateY(-4px)',
        },
        { ...full, opacity: 0, transform: 'translateY(-4px)', offset: 0.55 },
        { ...full, opacity: 1, transform: 'none' },
      ], { duration: 340, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
      anim.onfinish = stop;
    }

    return {
      close,
      show,
      destroy() {
        stop();
        closeBtn && closeBtn.removeEventListener('click', onClick);
      },
    };
  });

  const inst = (el) => Nova.get(el, 'alert');
  Nova.alert = {
    close: (el) => { const i = inst(el); return i ? i.close() : false; },
    show: (el) => { const i = inst(el); i && i.show(); },
  };
})();
