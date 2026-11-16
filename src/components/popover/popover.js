/* Nova UI · Popover 弹出层
 * <button data-nv-popover="#pop1" data-placement="bottom" data-arrow>…</button>
 * <div class="nv-popover" id="pop1" hidden>任意可交互内容 <button data-nv-popover-close>…</button></div>
 * data-trigger="click|hover"（hover：带开关延迟，鼠标可移入面板；点击 / 键盘聚焦同样可用）
 * Nova.popover.open(trigger) / close(trigger) / toggle(trigger)；事件（在触发器上）：nv:open、nv:close（detail: { panel, reason }）
 */
(() => {
  const { Nova } = window;
  const panels = new Map(); // 选择器 → 面板（关闭后面板会从 DOM 移除，这里保留引用）
  const owners = new WeakMap(); // 面板 → 当前打开它的实例（同一面板可被多个触发器共用）

  const findPanel = (sel) => {
    if (!sel) return null;
    const el = document.querySelector(sel) || panels.get(sel) || null;
    if (el) panels.set(sel, el);
    return el;
  };

  const DEFAULTS = { trigger: 'click', placement: 'bottom', offset: -1, arrow: false, openDelay: 120, closeDelay: 180 };

  Nova.define('popover', '[data-nv-popover]', (trigger) => {
    const panel = findPanel(trigger.dataset.nvPopover);
    if (!panel) { console.warn('[Nova] popover：找不到面板', trigger.dataset.nvPopover); return {}; }
    const o = Nova.opts(trigger, Nova.opts(panel, DEFAULTS));
    const offset = o.offset >= 0 ? o.offset : o.arrow ? 11 : 8;

    panel.classList.add('nv-panel');
    if (!panel.id) panel.id = Nova.uid('nv-popover');
    if (!panel.hasAttribute('role')) panel.setAttribute('role', 'dialog');
    if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
    if (!trigger.id) trigger.id = Nova.uid('nv-popover-trigger');
    if (!panel.hasAttribute('aria-label') && !panel.hasAttribute('aria-labelledby')) {
      const title = panel.querySelector('.nv-popover-title');
      if (title && !title.id) title.id = `${panel.id}-title`;
      panel.setAttribute('aria-labelledby', title ? title.id : trigger.id);
    }
    if (o.arrow && !panel.querySelector(':scope > .nv-popover-arrow')) {
      panel.prepend(Nova.h('span', { class: 'nv-popover-arrow', 'aria-hidden': 'true' }));
    }
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', panel.id);

    let f = null; // Nova.floating 句柄
    let release = null; // 焦点陷阱
    let pinned = false; // hover 模式下被点击「钉住」：鼠标离开不再自动关闭
    let timer = 0;

    const disabled = () => trigger.disabled || trigger.getAttribute('aria-disabled') === 'true';

    function open({ focus = true } = {}) {
      clearTimeout(timer);
      if (disabled()) return;
      if (f) {
        if (focus && !release) { pinned = true; release = Nova.trapFocus(panel, { restore: false }); }
        return;
      }
      const owner = owners.get(panel);
      if (owner && owner !== inst) owner.close({ reason: 'replace', restore: false });
      owners.set(panel, inst);
      panel.hidden = false;
      f = Nova.floating(panel, trigger, {
        placement: o.placement,
        offset,
        arrow: o.arrow,
        onDismiss: (reason) => close({ reason }),
      });
      pinned = focus;
      trigger.setAttribute('aria-expanded', 'true');
      trigger.dataset.state = 'open';
      if (focus) release = Nova.trapFocus(panel, { restore: false });
      Nova.emit(trigger, 'nv:open', { panel });
    }

    function close({ reason = 'api', restore } = {}) {
      clearTimeout(timer);
      if (!f) return;
      const hadFocus = panel.contains(document.activeElement);
      f.close();
      f = null;
      pinned = false;
      if (release) { release(); release = null; }
      if (owners.get(panel) === inst) owners.delete(panel);
      trigger.setAttribute('aria-expanded', 'false');
      delete trigger.dataset.state;
      // Esc / 关闭按钮 / 焦点原本在面板内：还焦给触发器；点击外部时尊重用户新的点击目标
      const back = restore ?? (reason !== 'outside' && (reason === 'escape' || hadFocus));
      if (back && trigger.isConnected) trigger.focus({ preventScroll: true });
      Nova.emit(trigger, 'nv:close', { panel, reason });
    }

    const toggle = () => (f && (pinned || o.trigger !== 'hover') ? close({ reason: 'trigger', restore: true }) : open());
    const onClick = (e) => {
      if (disabled()) return;
      if (trigger.tagName === 'A') e.preventDefault();
      toggle();
    };
    const onKey = (e) => {
      // 非 button 触发器（如 span[tabindex]）也支持 Enter / 空格
      if (trigger.tagName !== 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(); }
    };
    trigger.addEventListener('click', onClick);
    trigger.addEventListener('keydown', onKey);

    // —— hover 模式 —— 鼠标进入触发器 / 面板保持打开，离开后延迟关闭；键盘聚焦时打开但不抢焦点
    const cleanups = [];
    if (o.trigger === 'hover') {
      const enter = (e) => {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        clearTimeout(timer);
        if (!f) timer = setTimeout(() => open({ focus: false }), o.openDelay);
      };
      const leave = (e) => {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        clearTimeout(timer);
        if (f && !pinned) timer = setTimeout(() => close({ reason: 'hover' }), o.closeDelay);
      };
      const panelEnter = (e) => { if (owners.get(panel) === inst) enter(e); };
      const panelLeave = (e) => { if (owners.get(panel) === inst) leave(e); };
      const focusIn = () => { if (!f && trigger.matches(':focus-visible')) open({ focus: false }); };
      const focusOut = (e) => {
        if (f && !pinned && !panel.contains(e.relatedTarget)) timer = setTimeout(() => close({ reason: 'blur' }), o.closeDelay);
      };
      trigger.addEventListener('pointerenter', enter);
      trigger.addEventListener('pointerleave', leave);
      panel.addEventListener('pointerenter', panelEnter);
      panel.addEventListener('pointerleave', panelLeave);
      trigger.addEventListener('focusin', focusIn);
      trigger.addEventListener('focusout', focusOut);
      cleanups.push(() => {
        trigger.removeEventListener('pointerenter', enter);
        trigger.removeEventListener('pointerleave', leave);
        panel.removeEventListener('pointerenter', panelEnter);
        panel.removeEventListener('pointerleave', panelLeave);
        trigger.removeEventListener('focusin', focusIn);
        trigger.removeEventListener('focusout', focusOut);
      });
    }

    const inst = {
      open: () => open(),
      close: (opt) => close(opt),
      toggle,
      update: () => f && f.update(),
      get isOpen() { return !!f; },
      panel,
      destroy() {
        close({ restore: false });
        trigger.removeEventListener('click', onClick);
        trigger.removeEventListener('keydown', onKey);
        cleanups.forEach((fn) => fn());
      },
    };
    return inst;
  });

  // 面板内的关闭按钮
  Nova.on(document, 'click', '[data-nv-popover-close]', (e, btn) => {
    const panel = btn.closest('.nv-popover');
    const inst = panel && owners.get(panel);
    if (inst) inst.close({ reason: 'close-button', restore: true });
  });

  const get = (t) => {
    const el = typeof t === 'string' ? document.querySelector(t) : t;
    if (!el) return null;
    return Nova.get(el, 'popover') || (Nova.init(el), Nova.get(el, 'popover'));
  };
  Nova.popover = {
    open: (t) => get(t)?.open(),
    close: (t) => get(t)?.close({ reason: 'api', restore: true }),
    toggle: (t) => { const i = get(t); if (i) (i.isOpen ? i.close({ reason: 'api', restore: true }) : i.open()); },
    update: (t) => get(t)?.update(),
    isOpen: (t) => !!get(t)?.isOpen,
  };
})();
