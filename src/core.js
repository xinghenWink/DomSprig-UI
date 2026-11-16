/*!
 * Nova UI · Core runtime（无依赖，挂到 window.Nova）
 * 所有组件共享：注册与自动初始化、浮层定位、浮层栈（Esc / 点击外部）、焦点陷阱、滚动锁定、
 * 列表键盘导航、图标、主题。组件文件只依赖这里的 API。
 */
(function (global) {
  'use strict';
  if (global.Nova && global.Nova.version) return;
  const Nova = (global.Nova = global.Nova || {});
  Nova.version = '1.0.0';

  /* ————————————————— 通用工具 ————————————————— */
  let uidSeed = 0;
  Nova.uid = (prefix = 'nv') => `${prefix}-${(++uidSeed).toString(36)}`;
  Nova.clamp = (v, min, max) => Math.max(min, Math.min(v, max));
  Nova.reducedMotion = () => global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  /** 转义后再拼进 innerHTML，杜绝 XSS */
  Nova.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC_MAP[c]);

  /**
   * 轻量 DOM 构造：Nova.h('button', { class: 'x', onClick: fn, 'aria-label': '关闭' }, '文字', childNode)
   * 文本一律走 textContent；只有 html 属性会写 innerHTML（仅用于可信的图标字符串）。
   */
  Nova.h = (tag, props, ...children) => {
    const el = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : String(c));
    }
    return el;
  };

  /** 派发冒泡的自定义事件；组件事件统一以 nv: 开头，如 nv:change / nv:open / nv:close */
  Nova.emit = (el, type, detail) =>
    el.dispatchEvent(new CustomEvent(type, { bubbles: true, cancelable: true, detail }));

  /**
   * 从 data-* 读取配置，按默认值的类型转换：
   * Nova.opts(el, { search: false, minuteStep: 1, placement: 'bottom' })
   * 布尔：出现即 true（data-search），写 "false" 为 false；数字：Number()；其它：字符串。
   */
  Nova.opts = (el, defaults) => {
    const o = { ...defaults };
    for (const k in defaults) {
      if (!(k in el.dataset)) continue;
      const v = el.dataset[k];
      const d = defaults[k];
      o[k] = typeof d === 'boolean' ? v !== 'false' : typeof d === 'number' ? Number(v) : v;
    }
    return o;
  };

  /** 事件委托：Nova.on(document, 'click', '[data-x]', (e, matched) => {}) */
  Nova.on = (root, type, selector, handler, options) => {
    const fn = (e) => {
      const t = e.target.closest && e.target.closest(selector);
      if (t && root.contains(t)) handler(e, t);
    };
    root.addEventListener(type, fn, options);
    return () => root.removeEventListener(type, fn, options);
  };

  /** 进入视口时回调（动效组件用），默认只触发一次 */
  Nova.inView = (el, cb, { once = true, threshold = 0.2, rootMargin = '0px' } = {}) => {
    if (!('IntersectionObserver' in global)) { cb(true); return () => {}; }
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting) { cb(true, en); if (once) io.disconnect(); }
        else if (!once) cb(false, en);
      }
    }, { threshold, rootMargin });
    io.observe(el);
    return () => io.disconnect();
  };

  /* ————————————————— 注册与自动初始化 —————————————————
   * Nova.define('select', 'select[data-nv-select]', (el) => instance)
   * - 页面就绪时扫描一次；之后通过 MutationObserver 自动初始化新插入的元素（框架渲染也生效）。
   * - 同一元素同一组件只初始化一次；Nova.get(el, 'select') 取实例。
   */
  const registry = new Map();
  const instances = new WeakMap();
  let booted = false;
  const readyQueue = [];

  function upgrade(root, names) {
    if (!root || !root.querySelectorAll) return;
    for (const name of names || registry.keys()) {
      const def = registry.get(name);
      const found = [];
      if (root.nodeType === 1 && root.matches(def.selector)) found.push(root);
      found.push(...root.querySelectorAll(def.selector));
      for (const el of found) {
        let map = instances.get(el);
        if (!map) instances.set(el, (map = new Map()));
        if (map.has(name)) continue;
        map.set(name, null); // 先占位，防止 setup 内部插入 DOM 时重入
        try {
          map.set(name, def.setup(el) || {});
        } catch (err) {
          console.error(`[Nova] ${name} 初始化失败`, err, el);
        }
      }
    }
  }

  Nova.define = (name, selector, setup) => {
    registry.set(name, { selector, setup });
    if (booted) upgrade(document, [name]);
  };
  Nova.init = (root = document) => upgrade(root);
  Nova.get = (el, name) => {
    if (typeof el === 'string') el = document.querySelector(el);
    const map = el && instances.get(el);
    if (!map) return null;
    if (name) return map.get(name) || null;
    for (const v of map.values()) if (v) return v;
    return null;
  };
  Nova.destroy = (el) => {
    const map = el && instances.get(el);
    if (!map) return;
    for (const inst of map.values()) inst && inst.destroy && inst.destroy();
    instances.delete(el);
  };
  Nova.ready = (fn) => (booted ? fn() : readyQueue.push(fn));

  function boot() {
    if (booted) return;
    booted = true;
    upgrade(document);
    readyQueue.splice(0).forEach((fn) => fn());
    let pending = [];
    let scheduled = false;
    new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) pending.push(n);
      if (scheduled || !pending.length) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        const nodes = pending;
        pending = [];
        for (const n of nodes) if (n.isConnected) upgrade(n);
      });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot);

  /* ————————————————— 浮层定位 —————————————————
   * Nova.position(panel, anchor, { placement: 'bottom-start', offset: 6, padding: 8, flip: true, arrow: false })
   * - placement：top|bottom|left|right + -start|-end（可省略，居中）
   * - 空间不足时翻转到对侧；沿交叉轴夹紧在视口内（距边缘 padding）。
   * - 写入 data-side、--nv-origin（动画原点）、--nv-anchor-width、--nv-available-height、--nv-arrow-x/y。
   * - anchor 可以是元素，也可以是 {left, top, right, bottom, width, height} 虚拟矩形（右键菜单用）。
   */
  const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  Nova.position = (panel, anchor, o = {}) => {
    const { clamp } = Nova;
    let [side, align = 'center'] = (o.placement || 'bottom-start').split('-');
    const gap = o.offset ?? 6;
    const pad = o.padding ?? 8;
    const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;
    const vw = document.documentElement.clientWidth;
    const vh = global.innerHeight;
    const vertical = side === 'top' || side === 'bottom';

    // 先移到左上角再测量：否则随内容宽度的面板会按上次的 left 被挤窄、提前换行
    panel.style.left = '0px';
    panel.style.top = '0px';
    panel.style.setProperty('--nv-anchor-width', `${r.width}px`);
    panel.style.setProperty('--nv-available-height', `${vh - pad * 2}px`);
    const w = panel.offsetWidth;
    let h = panel.offsetHeight;

    const space = {
      top: r.top - gap - pad,
      bottom: vh - r.bottom - gap - pad,
      left: r.left - gap - pad,
      right: vw - r.right - gap - pad,
    };
    const need = vertical ? h : w;
    if (o.flip !== false && space[side] < need && space[OPPOSITE[side]] > space[side]) side = OPPOSITE[side];
    if (vertical) {
      panel.style.setProperty('--nv-available-height', `${Math.max(80, space[side])}px`);
      h = panel.offsetHeight;
    }

    let x;
    let y;
    if (vertical) {
      y = side === 'top' ? r.top - gap - h : r.bottom + gap;
      x = align === 'start' ? r.left : align === 'end' ? r.right - w : r.left + r.width / 2 - w / 2;
      x = clamp(x, pad, vw - w - pad);
    } else {
      x = side === 'left' ? r.left - gap - w : r.right + gap;
      y = align === 'start' ? r.top : align === 'end' ? r.bottom - h : r.top + r.height / 2 - h / 2;
      y = clamp(y, pad, vh - h - pad);
    }
    panel.style.left = `${Math.round(x)}px`;
    panel.style.top = `${Math.round(y)}px`;
    panel.dataset.side = side;

    const cx = clamp(r.left + r.width / 2 - x, 0, w);
    const cy = clamp(r.top + r.height / 2 - y, 0, h);
    panel.style.setProperty('--nv-origin',
      side === 'top' ? `${cx}px 100%` : side === 'bottom' ? `${cx}px 0` : side === 'left' ? `100% ${cy}px` : `0 ${cy}px`);
    if (o.arrow) {
      panel.style.setProperty('--nv-arrow-x', `${clamp(cx, 14, w - 14)}px`);
      panel.style.setProperty('--nv-arrow-y', `${clamp(cy, 12, h - 12)}px`);
    }
    // 锚点完全滚出视口时隐藏面板，避免“悬空”
    const detached = r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw;
    panel.style.visibility = detached ? 'hidden' : '';
    return side;
  };

  /** 跟随滚动 / 缩放 / 锚点尺寸变化重新定位，返回取消函数 */
  Nova.autoUpdate = (anchor, update) => {
    let raf = 0;
    const run = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    global.addEventListener('scroll', run, true);
    global.addEventListener('resize', run);
    const ro = 'ResizeObserver' in global && anchor.nodeType === 1 ? new ResizeObserver(run) : null;
    ro && ro.observe(anchor);
    return () => {
      global.removeEventListener('scroll', run, true);
      global.removeEventListener('resize', run);
      ro && ro.disconnect();
      cancelAnimationFrame(raf);
    };
  };

  /** 浮层挂载点：在原生 <dialog open> 或 [data-nv-portal] 内时挂到该容器，否则挂到 body */
  Nova.portal = (node, anchor) => {
    const host = (anchor && anchor.closest && anchor.closest('dialog[open], [data-nv-portal]')) || document.body;
    host.appendChild(node);
    return host;
  };

  /**
   * 退场动画：设 data-state="closed"，等 CSS 动画结束后回调（无动画/减少动态时立即回调）。
   */
  Nova.animateOut = (el, done) => {
    el.dataset.state = 'closed';
    const name = getComputedStyle(el).animationName;
    if (!name || name === 'none' || Nova.reducedMotion()) { done && done(); return; }
    let finished = false;
    const end = (e) => {
      if (finished || (e && e.target !== el)) return;
      finished = true;
      el.removeEventListener('animationend', end);
      clearTimeout(timer);
      // 退场途中又被重新打开（data-state 已不是 closed）：放弃回调，避免把刚打开的浮层移除
      if (el.dataset.state !== 'closed') return;
      done && done();
    };
    el.addEventListener('animationend', end);
    const timer = setTimeout(end, 450);
  };

  /* ————————————————— 浮层栈 —————————————————
   * 所有可关闭的浮层（菜单、弹出面板、对话框、抽屉…）入栈。
   * - Esc 只关闭最上层；
   * - 点击外部：从最上层往下逐个关闭，直到某层包含点击目标为止（嵌套浮层天然正确）。
   * Nova.layer.push({ el, anchor, inside(node)→bool, onDismiss(reason), closeOnEsc, closeOnOutside }) → pop()
   * 带 [data-nv-layer-ignore] 的区域（Toast、Tooltip）点击不触发关闭。
   */
  const layers = [];
  const layerContains = (l, t) =>
    (l.el && l.el.contains(t)) || (l.anchor && l.anchor.contains && l.anchor.contains(t)) || (l.inside && l.inside(t));
  Nova.layer = {
    push(entry) {
      layers.push(entry);
      return () => {
        const i = layers.indexOf(entry);
        if (i >= 0) layers.splice(i, 1);
      };
    },
    top: () => layers[layers.length - 1] || null,
    get size() { return layers.length; },
  };
  document.addEventListener('pointerdown', (e) => {
    if (!layers.length) return;
    const t = e.target;
    if (t.closest && t.closest('[data-nv-layer-ignore]')) return;
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      if (!l || layerContains(l, t)) break;
      if (l.closeOnOutside === false) break;
      l.onDismiss && l.onDismiss('outside', e);
    }
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.isComposing || !layers.length) return;
    const l = layers[layers.length - 1];
    if (l.closeOnEsc === false) return;
    e.preventDefault();
    e.stopPropagation();
    l.onDismiss && l.onDismiss('escape', e);
  }, true);

  /**
   * 打开锚定浮层的一站式封装：挂载 → 定位 → 跟随滚动 → 入栈 → 进场动画。
   * const f = Nova.floating(panel, trigger, { placement, offset, arrow, onDismiss })
   * f.update() 重新定位；f.close() 退场并移除（幂等）。
   */
  Nova.floating = (panel, anchor, o = {}) => {
    Nova.portal(panel, anchor.nodeType ? anchor : null);
    panel.dataset.state = 'open';
    const update = () => Nova.position(panel, anchor, o);
    update();
    const stopAuto = anchor.nodeType ? Nova.autoUpdate(anchor, update) : () => {};
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      stopAuto();
      pop();
      Nova.animateOut(panel, () => panel.remove());
    };
    const pop = Nova.layer.push({
      el: panel,
      anchor: anchor.nodeType ? anchor : null,
      inside: o.inside,
      closeOnEsc: o.closeOnEsc,
      closeOnOutside: o.closeOnOutside,
      onDismiss: (reason, e) => (o.onDismiss ? o.onDismiss(reason, e) : close()),
    });
    return { update, close, get closed() { return closed; } };
  };

  /* ————————————————— 焦点 —————————————————— */
  const FOCUSABLE = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])', 'select:not([disabled])',
    'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])', '[contenteditable="true"]', 'summary',
  ].join(',');
  Nova.focusables = (root) =>
    [...root.querySelectorAll(FOCUSABLE)].filter(
      (el) => !el.closest('[inert]') && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'
    );

  /**
   * 焦点陷阱：Tab / Shift+Tab 在 root 内循环；返回 release()，默认把焦点还给打开前的元素。
   * 多个陷阱叠加时只有最上层生效。
   */
  const traps = [];
  Nova.trapFocus = (root, { initial, restore = true } = {}) => {
    const previous = document.activeElement;
    const trap = { root };
    traps.push(trap);
    const target = (typeof initial === 'string' ? root.querySelector(initial) : initial)
      || root.querySelector('[autofocus]') || Nova.focusables(root)[0] || root;
    if (target === root && !root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');
    const focusRaf = requestAnimationFrame(() => target.focus({ preventScroll: true }));
    const onKey = (e) => {
      if (e.key !== 'Tab' || traps[traps.length - 1] !== trap) return;
      if (!root.contains(document.activeElement) && document.activeElement !== document.body) return;
      const list = Nova.focusables(root);
      if (!list.length) { e.preventDefault(); return; }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !root.contains(active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !root.contains(active))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(focusRaf); // 打开后同一帧内就关闭：取消尚未执行的初始聚焦，避免焦点落到已关闭的浮层
      document.removeEventListener('keydown', onKey);
      const i = traps.indexOf(trap);
      if (i >= 0) traps.splice(i, 1);
      if (restore && previous && previous.focus && previous.isConnected) previous.focus({ preventScroll: true });
    };
  };

  /** 滚动锁定（引用计数，补偿滚动条宽度防抖动），返回 unlock() */
  let lockCount = 0;
  let lockSaved = null;
  Nova.lockScroll = () => {
    const de = document.documentElement;
    if (lockCount++ === 0) {
      const gap = global.innerWidth - de.clientWidth;
      lockSaved = { overflow: de.style.overflow, paddingRight: de.style.paddingRight };
      de.style.overflow = 'hidden';
      if (gap > 0) de.style.paddingRight = `${gap}px`;
    }
    let done = false;
    return () => {
      if (done) return;
      done = true;
      if (--lockCount === 0 && lockSaved) {
        de.style.overflow = lockSaved.overflow;
        de.style.paddingRight = lockSaved.paddingRight;
      }
    };
  };

  /* ————————————————— 列表键盘导航 —————————————————
   * Select / Dropdown / Command / Combobox 共用。高亮项写 data-active，并滚动到可见。
   * const nav = Nova.roving(() => panel.querySelectorAll('[role=option]'), { onChange, loop, typeahead })
   * nav.key(e) 处理 ↑ ↓ Home End PageUp PageDown 与首字母跳转，处理了返回 true。
   */
  Nova.roving = (getItems, { onChange, loop = true, typeahead = true } = {}) => {
    let active = null;
    let buffer = '';
    let bufferTimer = 0;
    const enabled = () =>
      [...getItems()].filter((el) => el.getAttribute('aria-disabled') !== 'true' && !el.hidden && el.getClientRects().length);
    const set = (el, { scroll = true } = {}) => {
      el = el || null;
      if (active === el) return;
      if (active) active.removeAttribute('data-active');
      active = el;
      if (active) {
        active.setAttribute('data-active', '');
        if (scroll) active.scrollIntoView({ block: 'nearest' });
      }
      onChange && onChange(active);
    };
    const move = (delta) => {
      const list = enabled();
      if (!list.length) return set(null);
      let i = list.indexOf(active);
      if (i < 0) i = delta > 0 ? 0 : list.length - 1;
      else i += delta;
      i = loop && Math.abs(delta) === 1 ? (i + list.length) % list.length : Nova.clamp(i, 0, list.length - 1);
      set(list[i]);
    };
    const first = () => set(enabled()[0]);
    const last = () => { const l = enabled(); set(l[l.length - 1]); };
    const type = (ch) => {
      buffer += ch.toLowerCase();
      clearTimeout(bufferTimer);
      bufferTimer = setTimeout(() => (buffer = ''), 600);
      const list = enabled();
      const start = list.indexOf(active);
      const ordered = buffer.length > 1 ? list : [...list.slice(start + 1), ...list.slice(0, start + 1)];
      const hit = ordered.find((el) => (el.dataset.text || el.textContent).trim().toLowerCase().startsWith(buffer));
      if (hit) set(hit);
    };
    const key = (e) => {
      switch (e.key) {
        case 'ArrowDown': move(1); break;
        case 'ArrowUp': move(-1); break;
        case 'Home': first(); break;
        case 'End': last(); break;
        case 'PageDown': move(8); break;
        case 'PageUp': move(-8); break;
        default:
          if (typeahead && e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            type(e.key);
            return true;
          }
          return false;
      }
      e.preventDefault();
      return true;
    };
    return { get active() { return active; }, set, move, first, last, type, key, enabled, reset: () => set(null) };
  };

  /* ————————————————— 图标 —————————————————
   * 24×24 描边图标。Nova.icon('search', { size: 16 }) 返回 SVG 字符串；
   * 声明式：<i data-nv-icon="search" data-size="18"></i> 自动替换为 SVG。
   * 扩展：Nova.icons.rocket = '<path d="…"/>'
   */
  const ICONS = {
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-up': '<path d="m18 15-6-6-6 6"/>',
    'chevron-left': '<path d="m15 18-6-6 6-6"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    'chevrons-left': '<path d="m11 17-5-5 5-5M18 17l-5-5 5-5"/>',
    'chevrons-right': '<path d="m13 17 5-5-5-5M6 17l5-5-5-5"/>',
    'chevrons-up-down': '<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>',
    'arrow-up': '<path d="M12 19V5M5 12l7-7 7 7"/>',
    'arrow-down': '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    'arrow-left': '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    'arrow-right': '<path d="M5 12h14M12 5l7 7-7 7"/>',
    'arrow-up-right': '<path d="M7 17 17 7M7 7h10v10"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    info: '<circle cx="12" cy="12" r="9.5"/><path d="M12 16v-4.5M12 8h.01"/>',
    'circle-check': '<circle cx="12" cy="12" r="9.5"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    'circle-x': '<circle cx="12" cy="12" r="9.5"/><path d="m15 9-6 6M9 9l6 6"/>',
    'circle-alert': '<circle cx="12" cy="12" r="9.5"/><path d="M12 7.5V13M12 16.5h.01"/>',
    'circle-help': '<circle cx="12" cy="12" r="9.5"/><path d="M9.2 9a3 3 0 0 1 5.8 1c0 2-3 2.8-3 2.8M12 17h.01"/>',
    'triangle-alert': '<path d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17h.01"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    'eye-off': '<path d="M9.9 4.2A10 10 0 0 1 12 4c6.4 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6C3.6 8.6 2 12 2 12s3.6 8 10 8a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2.5"/><path d="M16 8V5.5A2.5 2.5 0 0 0 13.5 3h-8A2.5 2.5 0 0 0 3 5.5v8A2.5 2.5 0 0 0 5.5 16H8"/>',
    upload: '<path d="M12 15V3M7 8l5-5 5 5M21 15v3.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5V15"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M21 15v3.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5V15"/>',
    'cloud-upload': '<path d="M12 13v8M8 17l4-4 4 4"/><path d="M20 16.6A5 5 0 0 0 18 7h-1.3A8 8 0 1 0 4 15.3"/>',
    file: '<path d="M14 2.5H6.5A2.5 2.5 0 0 0 4 5v14a2.5 2.5 0 0 0 2.5 2.5h11A2.5 2.5 0 0 0 20 19V8.5z"/><path d="M14 2.5v6h6"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4.5-4.5L6 21"/>',
    folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2z"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
    trash: '<path d="M3 6h18M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6M18.5 6l-.8 13.1a2 2 0 0 1-2 1.9H8.3a2 2 0 0 1-2-1.9L5.5 6"/>',
    pencil: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
    more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    'more-vertical': '<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20.5 14.1A8.5 8.5 0 1 1 9.9 3.5a6.6 6.6 0 0 0 10.6 10.6z"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2.5"/><path d="M8 21h8M12 17v4"/>',
    home: '<path d="M3 10.5 12 3l9 7.5V20a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H4.5A1.5 1.5 0 0 1 3 20z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 9M22 21a7 7 0 0 0-4-6.3"/>',
    settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m22 7-10 6L2 7"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    star: '<path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z"/>',
    heart: '<path d="M19.5 13.6 12 21l-7.5-7.4A5 5 0 1 1 12 7a5 5 0 1 1 7.5 6.6z"/>',
    filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
    refresh: '<path d="M21 12a9 9 0 0 1-15.4 6.4L3 16M3 12a9 9 0 0 1 15.4-6.4L21 8M21 3v5h-5M3 21v-5h5"/>',
    lock: '<rect x="4" y="10.5" width="16" height="11" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
    globe: '<circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5a14.5 14.5 0 0 1 0 19 14.5 14.5 0 0 1 0-19"/>',
    sparkles: '<path d="M11 3.5 12.6 8a2 2 0 0 0 1.3 1.3l4.6 1.6-4.6 1.6a2 2 0 0 0-1.3 1.3L11 18.5l-1.6-4.6A2 2 0 0 0 8 12.6L3.5 11l4.6-1.6A2 2 0 0 0 9.4 8zM19 2v4M21 4h-4M19.5 17v3M21 18.5h-3"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
    command: '<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>',
    'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    'credit-card': '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20"/>',
    'bar-chart': '<path d="M3 3v18h18M8 17v-4M13 17V9M18 17V5"/>',
    code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
    palette: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2a10 10 0 0 0 0 20 1.7 1.7 0 0 0 1.7-1.7c0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1a1.7 1.7 0 0 1 1.7-1.7h2A5.6 5.6 0 0 0 22 10.8C22 6 17.5 2 12 2z"/>',
    loader: '<path d="M12 3a9 9 0 1 0 9 9"/>',
  };
  Nova.icons = ICONS;
  Nova.icon = (name, { size = 16, stroke = 2, cls = '' } = {}) => {
    const body = ICONS[name];
    if (!body) return '';
    return `<svg class="nv-icon${cls ? ` ${cls}` : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
  };
  Nova.define('icon', '[data-nv-icon]', (el) => {
    const html = Nova.icon(el.dataset.nvIcon, { size: el.dataset.size || 16, stroke: el.dataset.stroke || 2, cls: el.className });
    if (html) el.outerHTML = html;
  });

  /* ————————————————— 主题 —————————————————
   * Nova.theme.set('light' | 'dark' | 'system')   Nova.theme.toggle(event?)   Nova.theme.resolved()
   * Nova.theme.setHue(272)   Nova.theme.setRadius(10)
   * toggle(event) 支持时使用 View Transitions，从点击位置圆形展开新主题。
   */
  const THEME_KEY = 'nova-theme';
  const darkQuery = global.matchMedia('(prefers-color-scheme: dark)');
  Nova.theme = {
    get: () => document.documentElement.dataset.theme || 'system',
    resolved() {
      const t = this.get();
      return t === 'system' ? (darkQuery.matches ? 'dark' : 'light') : t;
    },
    set(mode, { persist = true } = {}) {
      const de = document.documentElement;
      if (mode === 'system') delete de.dataset.theme;
      else de.dataset.theme = mode;
      if (persist) { try { localStorage.setItem(THEME_KEY, mode); } catch (_) { /* 隐私模式等 */ } }
      Nova.emit(document, 'nv:themechange', { mode, resolved: this.resolved() });
    },
    toggle(event) {
      const next = this.resolved() === 'dark' ? 'light' : 'dark';
      if (!document.startViewTransition || Nova.reducedMotion()) { this.set(next); return; }
      const x = event && event.clientX != null ? event.clientX : global.innerWidth / 2;
      const y = event && event.clientY != null ? event.clientY : 0;
      const r = Math.hypot(Math.max(x, global.innerWidth - x), Math.max(y, global.innerHeight - y));
      const vt = document.startViewTransition(() => this.set(next));
      vt.ready.then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
          { duration: 480, easing: 'cubic-bezier(.4,0,.2,1)', pseudoElement: '::view-transition-new(root)' }
        );
      }).catch(() => {});
    },
    restore() {
      try { const m = localStorage.getItem(THEME_KEY); if (m) this.set(m, { persist: false }); } catch (_) { /* ignore */ }
    },
    setHue: (h) => document.documentElement.style.setProperty('--nv-hue', h),
    setRadius: (px) => document.documentElement.style.setProperty('--nv-radius', `${px}px`),
  };
})(window);
