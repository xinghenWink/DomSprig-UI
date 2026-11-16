/* Nova UI · Modal 对话框
 * 声明式：<div class="nv-modal" id="m1" hidden aria-labelledby="m1-title"><div class="nv-modal-panel">…</div></div>
 *   打开：[data-nv-modal-open="#m1"]；关闭：[data-nv-modal-close] / .nv-modal-close、Esc、点击遮罩（data-static 时不关闭）
 * 命令式：Nova.modal.open(el) / close(el) / toggle(el) / isOpen(el)
 *         Nova.confirm(opts) → Promise<boolean>     Nova.alert(opts) → Promise<void>
 * 事件（在 .nv-modal 上）：nv:open；nv:close（detail.reason：escape | outside | close-button | confirm | cancel | api）
 *
 * 内部接口（Drawer 等复用）：Nova.modal._register(kind)
 *   按约定 .nv-<kind> / .nv-<kind>-panel / -body / -title / -desc / -close 与 [data-nv-<kind>-open] / [data-nv-<kind>-close]
 *   注册一类模态容器（初始化、焦点陷阱、滚动锁定、浮层栈、嵌套层次、退场动画），返回 { open, close, toggle, isOpen, get }。
 *   实例额外字段：busy（为 true 时忽略 Esc / 遮罩关闭）、onAfterClose（退场动画结束后回调）。
 */
(() => {
  const { Nova } = window;
  const stack = []; // 打开中的模态实例（modal 与 drawer 共用），决定嵌套层次

  const $el = (t) => (typeof t === 'string' ? document.querySelector(t) : t);

  function register(kind) {
    const sel = (part) => `.nv-${kind}${part ? `-${part}` : ''}`;
    const openAttr = `data-nv-${kind}-open`;
    const closeAttr = `data-nv-${kind}-close`;

    function setup(el) {
      const panel = el.querySelector(sel('panel')) || el.firstElementChild || el;
      const body = () => panel.querySelector(`:scope > ${sel('body')}`);
      if (!el.id) el.id = Nova.uid(kind);
      if (!el.hasAttribute('role')) el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      const title = el.querySelector(sel('title'));
      if (title && !el.hasAttribute('aria-labelledby') && !el.hasAttribute('aria-label')) {
        if (!title.id) title.id = `${el.id}-title`;
        el.setAttribute('aria-labelledby', title.id);
      }
      const desc = el.querySelector(sel('desc'));
      if (desc && !el.hasAttribute('aria-describedby')) {
        if (!desc.id) desc.id = `${el.id}-desc`;
        el.setAttribute('aria-describedby', desc.id);
      }
      if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
      for (const b of el.querySelectorAll(sel('close'))) {
        if (!b.hasAttribute('aria-label') && !b.textContent.trim()) b.setAttribute('aria-label', el.dataset.closeLabel || '关闭');
        if (!b.children.length && !b.textContent.trim()) b.innerHTML = Nova.icon('x', { size: 18 });
        if (b.tagName === 'BUTTON' && !b.hasAttribute('type')) b.type = 'button';
      }
      const startOpen = el.hasAttribute('data-open');
      el.hidden = true;

      let st = null; // 打开期间持有的资源
      const edges = () => {
        const b = body();
        if (!b) return;
        panel.toggleAttribute('data-scroll-top', b.scrollTop > 1);
        panel.toggleAttribute('data-scroll-bottom', b.scrollHeight - b.clientHeight - b.scrollTop > 1);
      };
      const bounce = () => {
        if (Nova.reducedMotion()) return;
        panel.removeAttribute('data-bounce');
        void panel.offsetWidth; // 重新触发动画
        panel.setAttribute('data-bounce', '');
        clearTimeout(inst._bounceTimer);
        inst._bounceTimer = setTimeout(() => panel.removeAttribute('data-bounce'), 400);
      };
      const dismiss = (reason, e) => {
        // 按在本层遮罩上：阻止随后 mousedown 的默认聚焦，否则刚还给触发器的焦点会落到 body（静态遮罩时也不丢焦点）
        if (reason === 'outside' && e && e.target === el && e.cancelable) e.preventDefault();
        if (inst.busy) return;
        if (reason === 'outside' && el.hasAttribute('data-static')) { bounce(); return; }
        close(reason);
      };
      const initialFocus = () => {
        const auto = panel.querySelector('[data-autofocus], [autofocus]');
        if (auto) return auto;
        return Nova.focusables(panel).filter((n) => !n.matches(sel('close')))[0] || panel;
      };

      function open() {
        if (st) return inst;
        document.body.appendChild(el); // 移到 body 末尾：脱离 overflow/transform 容器，并位于已打开的模态之上
        el.hidden = false;
        el.dataset.state = 'open';
        const below = stack[stack.length - 1];
        if (below) below.el.setAttribute('data-behind', '');
        stack.push(inst);
        const b = body();
        if (b) b.addEventListener('scroll', edges, { passive: true });
        window.addEventListener('resize', edges);
        st = {
          unlock: Nova.lockScroll(),
          // 点在叠在上方的其它模态（含其遮罩）上：对本层不算「外部」，避免嵌套时一次点击关掉多层
          pop: Nova.layer.push({ el: panel, inside: (t) => { const m = t.closest && t.closest('[aria-modal="true"]'); return !!m && m !== el; }, onDismiss: dismiss }),
          release: Nova.trapFocus(panel, { initial: initialFocus() }),
          body: b,
        };
        requestAnimationFrame(edges);
        Nova.emit(el, 'nv:open');
        return inst;
      }

      function close(reason = 'api') {
        if (!st) return inst;
        const s = st;
        st = null;
        s.pop();
        s.unlock();
        if (s.body) s.body.removeEventListener('scroll', edges);
        window.removeEventListener('resize', edges);
        const i = stack.indexOf(inst);
        if (i >= 0) stack.splice(i, 1);
        el.removeAttribute('data-behind');
        const top = stack[stack.length - 1];
        if (top) top.el.removeAttribute('data-behind');
        s.release(); // 还焦给打开前的元素
        Nova.animateOut(el, () => {
          el.hidden = true;
          el.removeAttribute('data-state');
          panel.removeAttribute('data-bounce');
          if (inst.onAfterClose) inst.onAfterClose();
        });
        Nova.emit(el, 'nv:close', { reason });
        return inst;
      }

      const inst = {
        el,
        panel,
        open,
        close,
        toggle: () => (st ? close() : open()),
        get isOpen() { return !!st; },
        busy: false,
        onAfterClose: null,
        destroy: () => close('destroy'),
      };
      if (startOpen) queueMicrotask(open);
      return inst;
    }

    Nova.define(kind, sel(), setup);
    // 打开按钮：补充 aria-haspopup / aria-controls
    Nova.define(`${kind}-trigger`, `[${openAttr}]`, (t) => {
      if (!t.hasAttribute('aria-haspopup')) t.setAttribute('aria-haspopup', 'dialog');
      const v = t.getAttribute(openAttr);
      if (v && v.startsWith('#') && !t.hasAttribute('aria-controls')) t.setAttribute('aria-controls', v.slice(1));
    });

    const get = (t) => {
      const el = $el(t);
      if (!el) return null;
      return Nova.get(el, kind) || (Nova.init(el), Nova.get(el, kind));
    };
    document.addEventListener('click', (e) => {
      const t = e.target.closest && e.target.closest(`[${openAttr}], [${closeAttr}], ${sel('close')}`);
      if (!t || t.disabled || t.getAttribute('aria-disabled') === 'true') return;
      if (t.hasAttribute(openAttr)) {
        const inst = get(t.getAttribute(openAttr));
        if (!inst) return;
        if (t.tagName === 'A') e.preventDefault();
        inst.open();
        return;
      }
      const v = t.getAttribute(closeAttr);
      const inst = get(v ? v : t.closest(sel()));
      if (!inst) return;
      if (t.tagName === 'A') e.preventDefault();
      inst.close('close-button');
    });

    return {
      open: (t) => get(t)?.open(),
      close: (t, reason) => get(t)?.close(reason),
      toggle: (t) => get(t)?.toggle(),
      isOpen: (t) => !!get(t)?.isOpen,
      get,
    };
  }

  /* ————————————— 命令式确认框 / 提示框 ————————————— */
  function quick(mode, o = {}) {
    if (typeof o === 'string') o = { title: o };
    const isConfirm = mode === 'confirm';
    return new Promise((resolve) => {
      const color = o.color || (o.danger ? 'danger' : isConfirm ? 'primary' : 'info');
      const iconName = o.icon === false ? null : o.icon || (o.danger ? 'triangle-alert' : isConfirm ? 'circle-help' : 'info');
      const tid = Nova.uid('nv-dialog-title');
      const did = Nova.uid('nv-dialog-desc');
      const hasContent = o.content != null && o.content !== '';
      const okBtn = Nova.h('button', { type: 'button', class: 'nv-btn', 'data-color': o.danger ? 'danger' : null },
        o.confirmText || (isConfirm ? '确定' : '知道了'));
      const cancelBtn = isConfirm
        ? Nova.h('button', { type: 'button', class: 'nv-btn', 'data-variant': 'outline' }, o.cancelText || '取消')
        : null;
      // 危险操作默认聚焦「取消」，其余聚焦主按钮
      (o.danger && cancelBtn ? cancelBtn : okBtn).setAttribute('data-autofocus', '');
      const root = Nova.h('div', {
        class: 'nv-modal',
        role: 'alertdialog',
        'aria-labelledby': tid,
        'aria-describedby': hasContent ? did : null,
        'data-size': o.size || 'sm',
        'data-static': o.maskClosable ? null : '',
        'data-nv-dialog': mode,
        hidden: true,
      },
      Nova.h('div', { class: 'nv-modal-panel' },
        Nova.h('div', { class: 'nv-modal-header' },
          iconName ? Nova.h('span', { class: 'nv-modal-icon', 'data-color': color, html: Nova.icon(iconName, { size: 20 }) }) : null,
          Nova.h('h2', { class: 'nv-modal-title', id: tid }, o.title || (isConfirm ? '确认操作' : '提示')),
          hasContent ? Nova.h('div', { class: 'nv-modal-desc', id: did }, o.content.nodeType ? o.content : String(o.content)) : null),
        Nova.h('div', { class: 'nv-modal-footer' }, cancelBtn, okBtn)));
      document.body.appendChild(root);
      Nova.init(root);
      const m = Nova.get(root, 'modal');
      let result = false;
      m.onAfterClose = () => root.remove();
      // 事件会冒泡：只处理对话框自身的关闭（content 里若有下拉菜单等，其 nv:close 也会冒泡上来）
      root.addEventListener('nv:close', (e) => { if (e.target === root) resolve(isConfirm ? result : undefined); });

      const setBusy = (on) => {
        m.busy = on;
        okBtn.toggleAttribute('data-loading', on);
        okBtn.setAttribute('aria-busy', String(on));
        if (cancelBtn) cancelBtn.disabled = on;
      };
      okBtn.addEventListener('click', async () => {
        if (m.busy) return;
        let r;
        try {
          r = o.onConfirm ? o.onConfirm() : undefined;
        } catch (err) {
          queueMicrotask(() => { throw err; }); // 同步异常照常抛出，对话框保持打开
          return;
        }
        if (r && typeof r.then === 'function') {
          setBusy(true);
          try {
            r = await r;
          } catch (_) {
            setBusy(false); // 失败：保持打开，可在 onConfirm 内自行提示（如 Nova.toast.error）
            return;
          }
          setBusy(false);
        }
        if (r === false) return; // 返回 false：阻止关闭
        result = true;
        m.close('confirm');
      });
      if (cancelBtn) cancelBtn.addEventListener('click', () => m.close('cancel'));
      m.open();
    });
  }

  Nova.modal = {
    ...register('modal'),
    confirm: (o) => quick('confirm', o),
    alert: (o) => quick('alert', o),
    _register: register,
  };
  Nova.confirm = Nova.modal.confirm;
  Nova.alert = Nova.modal.alert;
})();
