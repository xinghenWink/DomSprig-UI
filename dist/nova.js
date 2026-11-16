/*! DomSprig-UI v1.0.0 · MIT · 由 scripts/build.mjs 生成，请勿直接修改 */
/* src/core.js */
/*!
 * DomSprig-UI · Core runtime（无依赖，挂到 window.Nova）
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

;
/* src/components/button/button.js */
/* DomSprig-UI · Button
 * 纯 CSS 即可使用；本文件只提供两项增强：
 * 1. data-ripple：按压水波纹（任意元素可用，事件委托，动态元素自动生效）
 * 2. Nova.button.loading(el, true|false)：切换加载态并同步 aria-busy
 */
(() => {
  const { Nova } = window;

  document.addEventListener('pointerdown', (e) => {
    const host = e.target.closest && e.target.closest('[data-ripple]');
    if (!host || host.disabled || host.hasAttribute('data-loading') || Nova.reducedMotion()) return;
    const r = host.getBoundingClientRect();
    const size = Math.hypot(r.width, r.height) * 2;
    const dot = document.createElement('span');
    dot.className = 'nv-ripple';
    Object.assign(dot.style, {
      width: `${size}px`,
      height: `${size}px`,
      left: `${e.clientX - r.left - size / 2}px`,
      top: `${e.clientY - r.top - size / 2}px`,
    });
    host.appendChild(dot);
    dot.addEventListener('animationend', () => dot.remove(), { once: true });
  });

  Nova.button = {
    loading(el, on = true) {
      if (typeof el === 'string') el = document.querySelector(el);
      if (!el) return;
      el.toggleAttribute('data-loading', on);
      el.setAttribute('aria-busy', String(on));
    },
  };
})();

;
/* src/components/input/input.js */
/* DomSprig-UI · Input
 * 增强 <input> 的三项能力（纯外观无需 JS）：
 *   data-clearable                 有内容时显示清除按钮（data-clear-label 覆盖文案）
 *   type="password" data-toggle     显示/隐藏密码（data-show-label / data-hide-label）
 *   maxlength + data-count          字数统计「12/50」；无 maxlength 时只显示字数
 * 独立的 <input class="nv-input"> 会被包进 <div class="nv-control nv-input-box">（data-size / data-variant 一并转移）。
 * 实例：Nova.get(input, 'input') → { clear, refresh, destroy }
 */
(() => {
  const { Nova } = window;
  const FEATURES = ':is([data-clearable], [data-toggle], [data-count])';

  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));

  Nova.define('input', `input.nv-input${FEATURES}, .nv-control > input${FEATURES}`, (input) => {
    const o = Nova.opts(input, {
      clearable: false,
      toggle: false,
      count: false,
      clearLabel: '清除',
      showLabel: '显示密码',
      hideLabel: '隐藏密码',
    });
    let box = input.parentElement && input.parentElement.classList.contains('nv-control') ? input.parentElement : null;
    let wrapped = false;
    if (!box) {
      box = Nova.h('div', { class: 'nv-control nv-input-box' });
      for (const k of ['size', 'variant']) if (input.dataset[k]) box.dataset[k] = input.dataset[k];
      input.before(box);
      box.append(input);
      wrapped = true;
    }
    const added = [];
    const cleanups = [];
    const on = (t, type, fn) => { t.addEventListener(type, fn); cleanups.push(() => t.removeEventListener(type, fn)); };
    let anchor = input;
    const place = (node) => { anchor.after(node); anchor = node; added.push(node); return node; };

    let clearBtn = null;
    if (o.clearable) {
      clearBtn = place(Nova.h('button', {
        type: 'button',
        class: 'nv-control-btn nv-input-clear',
        tabindex: '-1',
        'aria-label': o.clearLabel,
        html: Nova.icon('x', { size: 14 }),
        hidden: true,
      }));
      // pointerdown 阻止默认：点清除时输入框不失焦
      on(clearBtn, 'pointerdown', (e) => e.preventDefault());
      on(clearBtn, 'click', () => clear());
    }

    let countEl = null;
    const max = Number(input.getAttribute('maxlength')) || 0;
    if (o.count) {
      countEl = place(Nova.h('span', { class: 'nv-input-count', 'aria-hidden': 'true' }));
    }

    let toggleBtn = null;
    if (o.toggle && input.type === 'password') {
      toggleBtn = place(Nova.h('button', {
        type: 'button',
        class: 'nv-control-btn nv-input-toggle',
        'aria-label': o.showLabel,
        'aria-pressed': 'false',
        html: Nova.icon('eye'),
      }));
      if (input.id) toggleBtn.setAttribute('aria-controls', input.id);
      on(toggleBtn, 'click', () => {
        const show = input.type === 'password';
        // 保持光标位置
        const { selectionStart: s, selectionEnd: e } = input;
        input.type = show ? 'text' : 'password';
        toggleBtn.setAttribute('aria-pressed', String(show));
        toggleBtn.setAttribute('aria-label', show ? o.hideLabel : o.showLabel);
        toggleBtn.innerHTML = Nova.icon(show ? 'eye-off' : 'eye');
        if (document.activeElement === input) { try { input.setSelectionRange(s, e); } catch (_) { /* ignore */ } }
      });
    }

    // 点击包装空白处聚焦输入框
    if (wrapped) on(box, 'pointerdown', (e) => {
      if (e.target === box) { e.preventDefault(); input.focus(); }
    });

    const refresh = () => {
      const len = [...input.value].length;
      if (clearBtn) clearBtn.hidden = !len || input.disabled || input.readOnly;
      if (countEl) {
        countEl.textContent = max ? `${len}/${max}` : String(len);
        countEl.toggleAttribute('data-full', !!max && len >= max);
      }
    };
    function clear() {
      if (input.disabled || input.readOnly || !input.value) return;
      input.value = '';
      fire(input, 'input');
      fire(input, 'change');
      Nova.emit(input, 'nv:clear');
      input.focus();
      refresh();
    }
    on(input, 'input', refresh);
    on(input, 'change', refresh);
    const form = input.form;
    if (form) on(form, 'reset', () => setTimeout(refresh));
    // 有些浏览器在自动填充时不派发 input
    on(input, 'animationstart', refresh);
    refresh();

    // 屏幕阅读器字数提示：接近上限时朗读
    if (countEl && max) {
      const live = place(Nova.h('span', { class: 'nv-sr-only', 'aria-live': 'polite' }));
      let lastSpoken = -1;
      on(input, 'input', () => {
        const left = max - [...input.value].length;
        if (left <= Math.min(10, Math.ceil(max * 0.1)) && left !== lastSpoken) {
          live.textContent = left > 0 ? `还可输入 ${left} 字` : '已达到字数上限';
          lastSpoken = left;
        }
      });
    }

    return {
      clear,
      refresh,
      destroy() {
        cleanups.forEach((f) => f());
        added.forEach((n) => n.remove());
        if (toggleBtn) input.type = 'password';
        if (wrapped) { box.before(input); box.remove(); }
      },
    };
  });

  Nova.input = {
    clear: (el) => Nova.get(el, 'input')?.clear(),
    refresh: (el) => Nova.get(el, 'input')?.refresh(),
  };
})();

;
/* src/components/field/field.js */
/* DomSprig-UI · Field
 * 自动关联：label[for] ↔ 控件 id；说明 / 错误的 id → 控件 aria-describedby；有错误文字 → aria-invalid="true"。
 * 错误文字可随时改写（textContent / hidden），MutationObserver 自动同步。
 * 控件查找：[data-field-control] 优先，否则取字段内第一个可见输入元素或复合控件。
 * Nova.field.setError(field, '文字' | null)
 */
(() => {
  const { Nova } = window;
  const CONTROL = [
    '[data-field-control]',
    'input:not([type="hidden"]):not([tabindex="-1"])',
    'textarea', 'select',
    '[role="radiogroup"]', '[role="slider"]', '[role="group"]',
  ].join(',');

  const visible = (el) => !!el && !el.hidden && el.textContent.trim() !== '';

  Nova.define('field', '.nv-field', (el) => {
    let control = null;
    let ownInvalid = false;
    let ownDescribed = [];

    const sync = () => {
      const next = el.querySelector('[data-field-control]') || el.querySelector(CONTROL);
      // 控件被替换（如 TagInput 增强后）时清理旧控件上我们写入的属性
      if (control && control !== next) cleanup(control);
      control = next;
      const label = el.querySelector(':scope > .nv-field-label, :scope > .nv-field-head > .nv-field-label');
      const desc = el.querySelector(':scope > .nv-field-desc');
      const error = el.querySelector(':scope > .nv-field-error');
      const invalid = visible(error);
      el.toggleAttribute('data-invalid', invalid);
      if (!control) return;

      if (label) {
        if (!label.id) label.id = Nova.uid('nv-field-label');
        const labelable = control.matches('input, textarea, select, button, meter, output, progress');
        if (labelable && label.tagName === 'LABEL') {
          if (!control.id) control.id = Nova.uid('nv-field-ctl');
          if (!label.htmlFor) label.htmlFor = control.id;
        } else if (!control.hasAttribute('aria-labelledby') && !control.hasAttribute('aria-label')) {
          control.setAttribute('aria-labelledby', label.id);
          control.dataset.nvFieldLabelled = '';
        }
      }

      const ids = [];
      if (desc && !desc.hidden) ids.push(desc.id || (desc.id = Nova.uid('nv-field-desc')));
      if (error && invalid) ids.push(error.id || (error.id = Nova.uid('nv-field-error')));
      if (error && !error.hasAttribute('aria-live')) error.setAttribute('aria-live', 'polite');
      const others = (control.getAttribute('aria-describedby') || '').split(/\s+/)
        .filter((t) => t && !ownDescribed.includes(t));
      const all = [...others, ...ids];
      if (all.length) control.setAttribute('aria-describedby', all.join(' '));
      else control.removeAttribute('aria-describedby');
      ownDescribed = ids;

      if (invalid) {
        if (control.getAttribute('aria-invalid') !== 'true') {
          control.setAttribute('aria-invalid', 'true');
          ownInvalid = true;
        }
      } else if (ownInvalid) {
        control.removeAttribute('aria-invalid');
        ownInvalid = false;
      }
    };

    function cleanup(c) {
      if (ownInvalid) c.removeAttribute('aria-invalid');
      ownInvalid = false;
      const rest = (c.getAttribute('aria-describedby') || '').split(/\s+/).filter((t) => t && !ownDescribed.includes(t));
      if (rest.length) c.setAttribute('aria-describedby', rest.join(' '));
      else c.removeAttribute('aria-describedby');
      ownDescribed = [];
      if ('nvFieldLabelled' in c.dataset) { c.removeAttribute('aria-labelledby'); delete c.dataset.nvFieldLabelled; }
    }

    let queued = false;
    const schedule = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => { queued = false; sync(); });
    };
    const mo = new MutationObserver(schedule);
    mo.observe(el, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'data-field-control'] });
    sync();

    return {
      refresh: sync,
      get control() { return control; },
      setError(msg) { Nova.field.setError(el, msg); },
      destroy() { mo.disconnect(); if (control) cleanup(control); el.removeAttribute('data-invalid'); },
    };
  });

  Nova.field = {
    /** 设置或清除错误文字；没有 .nv-field-error 时自动创建 */
    setError(field, msg) {
      if (typeof field === 'string') field = document.querySelector(field);
      if (!field) return;
      let err = field.querySelector(':scope > .nv-field-error');
      if (!err && msg) err = field.appendChild(Nova.h('p', { class: 'nv-field-error' }));
      if (err) err.textContent = msg || '';
      Nova.get(field, 'field')?.refresh();
    },
  };
})();

;
/* src/components/textarea/textarea.js */
/* DomSprig-UI · Textarea
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

;
/* src/components/switch/switch.js */
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

;
/* src/components/slider/slider.js */
/* DomSprig-UI · Slider
 * 单值 input[type=range].nv-slider：包进 .nv-slider-box，写入填充比例、数值气泡、刻度。原生 input / change 照常。
 * 范围 .nv-slider-range：两个 role="slider" 拇指（方向键、Shift ×10、PageUp/Down、Home/End），不会交叉；
 *      data-name 时生成隐藏 input（值 "20,80"）；拖动时派发 input，松手 / 键盘派发 change 与 nv:change（detail.value = [a, b]）。
 * 实例：Nova.get(el, 'slider') → { value, set(v), refresh(), destroy() }；Nova.slider.set(el, v)
 */
(() => {
  const { Nova } = window;
  const num = (v, d) => (v === '' || v == null || Number.isNaN(Number(v)) ? d : Number(v));
  const decimals = (s) => { const t = String(s); const i = t.indexOf('.'); return i < 0 ? 0 : t.length - i - 1; };
  const SHARED = ['size', 'color', 'tooltip'];

  const makeFormat = (o, prec) => (v) => `${o.prefix}${Number(v).toFixed(prec)}${o.suffix}`;

  // "0,50,100" 或 "0:低,100:高"；带文字的刻度才显示标签
  const parseMarks = (s, min, max) => (s || '').split(',').map((part) => {
    const [v, ...rest] = part.split(':');
    const value = Number(v.trim());
    if (part.trim() === '' || Number.isNaN(value)) return null;
    return { value: Nova.clamp(value, min, max), label: rest.join(':').trim() };
  }).filter(Boolean);

  const buildMarks = (body, marks, ratio) => {
    const dots = [];
    const labels = [];
    for (const m of marks) {
      const r = ratio(m.value);
      const dot = Nova.h('span', { class: 'nv-slider-mark', 'aria-hidden': 'true' });
      dot.style.setProperty('--_m', r);
      body.append(dot);
      dots.push({ el: dot, r });
      if (m.label) {
        const lab = Nova.h('span', { class: 'nv-slider-label', text: m.label });
        lab.style.setProperty('--_m', r);
        if (r <= 0.02) lab.dataset.edge = 'start';
        else if (r >= 0.98) lab.dataset.edge = 'end';
        labels.push({ el: lab, r });
      }
    }
    const wrap = labels.length ? Nova.h('div', { class: 'nv-slider-labels', 'aria-hidden': 'true' }, labels.map((l) => l.el)) : null;
    const all = dots.concat(labels);
    return {
      wrap,
      update(a, b) { for (const m of all) m.el.toggleAttribute('data-active', m.r >= a - 1e-9 && m.r <= b + 1e-9); },
      remove() { all.forEach((m) => m.el.remove()); wrap && wrap.remove(); },
    };
  };

  /* ———————— 单值 ———————— */
  const single = (input) => {
    const o = Nova.opts(input, { prefix: '', suffix: '', tooltip: '', marks: '' });
    const min = () => num(input.min, 0);
    const max = () => num(input.max, 100);
    const prec = decimals(input.step && input.step !== 'any' ? input.step : 1);
    const fmt = makeFormat(o, prec);
    const ratio = (v) => (max() > min() ? Nova.clamp((v - min()) / (max() - min()), 0, 1) : 0);

    const fill = Nova.h('div', { class: 'nv-slider-fill' });
    const track = Nova.h('div', { class: 'nv-slider-track', 'aria-hidden': 'true' }, fill);
    const body = Nova.h('div', { class: 'nv-slider-body' });
    const box = Nova.h('div', { class: 'nv-slider-box' });
    for (const k of SHARED) if (k in input.dataset) box.dataset[k] = input.dataset[k];
    input.before(box);
    box.append(body);
    body.append(track, input);
    const bubble = 'tooltip' in input.dataset ? Nova.h('div', { class: 'nv-slider-bubble', 'aria-hidden': 'true' }) : null;
    if (bubble) body.append(bubble);
    const marks = buildMarks(body, parseMarks(o.marks, min(), max()), ratio);
    if (marks.wrap) box.append(marks.wrap);

    const refresh = () => {
      const v = Number(input.value);
      const p = ratio(v);
      input.style.setProperty('--_p', p);
      fill.style.setProperty('--_b', p);
      body.style.setProperty('--_v', p);
      if (bubble) bubble.textContent = fmt(v);
      if (o.prefix || o.suffix) input.setAttribute('aria-valuetext', fmt(v));
      marks.update(0, p);
    };
    const onDown = () => {
      body.dataset.dragging = '';
      const up = () => { delete body.dataset.dragging; document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); };
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', up);
    };
    input.addEventListener('input', refresh);
    input.addEventListener('change', refresh);
    input.addEventListener('pointerdown', onDown);
    refresh();

    return {
      get value() { return Number(input.value); },
      set(v) { input.value = v; refresh(); },
      refresh,
      destroy() {
        input.removeEventListener('input', refresh);
        input.removeEventListener('change', refresh);
        input.removeEventListener('pointerdown', onDown);
        input.style.removeProperty('--_p');
        if (o.prefix || o.suffix) input.removeAttribute('aria-valuetext');
        box.before(input);
        box.remove();
      },
    };
  };

  /* ———————— 范围 ———————— */
  const range = (root) => {
    const o = Nova.opts(root, { min: 0, max: 100, step: 1, value: '', name: '', prefix: '', suffix: '', tooltip: '', marks: '', disabled: false, labels: '最小值,最大值' });
    const { min, max } = o;
    const step = o.step > 0 ? o.step : 1;
    const prec = decimals(root.dataset.step || step);
    const fmt = makeFormat(o, prec);
    const ratio = (v) => (max > min ? Nova.clamp((v - min) / (max - min), 0, 1) : 0);
    const snap = (v) => Number(Nova.clamp(min + Math.round((v - min) / step) * step, min, max).toFixed(prec));
    const parse = (v) => {
      const arr = (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => num(String(x).trim(), NaN));
      const a = snap(Number.isNaN(arr[0]) ? min : arr[0]);
      const b = snap(Number.isNaN(arr[1]) ? max : arr[1]);
      return a <= b ? [a, b] : [b, a];
    };
    let val = parse(o.value);
    const names = o.labels.split(',');
    const disabled = () => root.hasAttribute('data-disabled');

    const fill = Nova.h('div', { class: 'nv-slider-fill' });
    const track = Nova.h('div', { class: 'nv-slider-track', 'aria-hidden': 'true' }, fill);
    const thumbs = [0, 1].map((i) => {
      const t = Nova.h('div', {
        class: 'nv-slider-thumb', role: 'slider', tabindex: '0',
        'aria-label': (names[i] || '').trim() || (i ? '最大值' : '最小值'), 'aria-orientation': 'horizontal',
      });
      if ('tooltip' in root.dataset) t.append(Nova.h('span', { class: 'nv-slider-bubble', 'aria-hidden': 'true' }));
      return t;
    });
    const body = Nova.h('div', { class: 'nv-slider-body' }, track, thumbs);
    const hidden = o.name ? Nova.h('input', { type: 'hidden', name: o.name }) : null;
    const prevRole = root.getAttribute('role');
    if (!prevRole) root.setAttribute('role', 'group');
    root.append(body);
    if (hidden) root.append(hidden);
    const marks = buildMarks(body, parseMarks(o.marks, min, max), ratio);
    if (marks.wrap) root.append(marks.wrap);

    const render = () => {
      const [a, b] = val;
      fill.style.setProperty('--_a', ratio(a));
      fill.style.setProperty('--_b', ratio(b));
      thumbs.forEach((t, i) => {
        const v = val[i];
        t.style.setProperty('--_v', ratio(v));
        t.setAttribute('aria-valuemin', i ? a : min);
        t.setAttribute('aria-valuemax', i ? max : b);
        t.setAttribute('aria-valuenow', v);
        t.setAttribute('aria-valuetext', fmt(v));
        t.tabIndex = disabled() ? -1 : 0;
        if (disabled()) t.setAttribute('aria-disabled', 'true');
        else t.removeAttribute('aria-disabled');
        const bub = t.firstElementChild;
        if (bub) bub.textContent = fmt(v);
      });
      if (hidden) { hidden.value = val.join(','); hidden.disabled = disabled(); }
      root.dataset.value = val.join(',');
      marks.update(ratio(a), ratio(b));
    };
    const emit = (type) => {
      if (type === 'change') Nova.emit(root, 'nv:change', { value: val.slice() });
      root.dispatchEvent(new Event(type, { bubbles: true }));
    };
    // 拇指 i 设为 v（不越过另一个拇指）；返回是否变化
    const setThumb = (i, v) => {
      v = snap(v);
      v = i ? Math.max(v, val[0]) : Math.min(v, val[1]);
      if (v === val[i]) return false;
      val = i ? [val[0], v] : [v, val[1]];
      render();
      return true;
    };
    const activate = (i) => thumbs.forEach((t, k) => t.toggleAttribute('data-active', k === i));

    const onKey = (e) => {
      const i = thumbs.indexOf(e.currentTarget);
      if (disabled()) return;
      const big = Math.max(step, snap(min + (max - min) / 10) - min);
      const mul = e.shiftKey ? 10 : 1;
      const cur = val[i];
      const map = {
        ArrowRight: cur + step * mul, ArrowUp: cur + step * mul,
        ArrowLeft: cur - step * mul, ArrowDown: cur - step * mul,
        PageUp: cur + big, PageDown: cur - big,
        Home: i ? val[0] : min, End: i ? max : val[1],
      };
      if (!(e.key in map)) return;
      e.preventDefault();
      activate(i);
      if (setThumb(i, map[e.key])) { emit('input'); emit('change'); }
    };

    let drag = null;
    const valueAt = (x) => {
      const rect = body.getBoundingClientRect();
      const tw = thumbs[0].offsetWidth || 18;
      const p = rect.width > tw ? (x - rect.left - tw / 2) / (rect.width - tw) : 0;
      return min + Nova.clamp(p, 0, 1) * (max - min);
    };
    const onDown = (e) => {
      if (disabled() || e.button > 0) return;
      const v = valueAt(e.clientX);
      const hit = thumbs.indexOf(e.target.closest('.nv-slider-thumb'));
      let i = hit;
      if (i < 0) {
        const [a, b] = val;
        i = a === b ? (v < a ? 0 : 1) : Math.abs(v - a) <= Math.abs(v - b) ? 0 : 1;
      }
      e.preventDefault();
      thumbs[i].focus({ preventScroll: true });
      activate(i);
      const start = val.join(',');
      drag = { i, start, id: e.pointerId };
      body.setPointerCapture?.(e.pointerId);
      body.dataset.dragging = '';
      thumbs[i].dataset.dragging = '';
      if (hit < 0 && setThumb(i, v)) emit('input');
    };
    const onMove = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (setThumb(drag.i, valueAt(e.clientX))) emit('input');
    };
    const onUp = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      delete body.dataset.dragging;
      delete thumbs[drag.i].dataset.dragging;
      const changed = val.join(',') !== drag.start;
      drag = null;
      if (changed) emit('change');
    };
    thumbs.forEach((t) => t.addEventListener('keydown', onKey));
    body.addEventListener('pointerdown', onDown);
    body.addEventListener('pointermove', onMove);
    body.addEventListener('pointerup', onUp);
    body.addEventListener('pointercancel', onUp);
    const mo = new MutationObserver(render);
    mo.observe(root, { attributes: true, attributeFilter: ['data-disabled'] });
    render();

    return {
      get value() { return val.slice(); },
      set(v) { val = parse(v); render(); },
      refresh: render,
      destroy() {
        mo.disconnect();
        body.remove();
        hidden && hidden.remove();
        marks.remove();
        if (!prevRole) root.removeAttribute('role');
      },
    };
  };

  Nova.define('slider', 'input[type="range"].nv-slider, .nv-slider-range', (el) => (el.matches('input') ? single(el) : range(el)));

  Nova.slider = {
    set: (el, v) => Nova.get(el, 'slider')?.set(v),
  };
})();

;
/* src/components/segmented/segmented.js */
/* DomSprig-UI · Segmented
 * 给 .nv-segmented 加一个滑动指示器，跟随选中的 radio 移动；尺寸变化（字体加载、容器缩放）时重新定位。
 * 原生 change 事件照常冒泡；另外在容器上派发 nv:change { value }。
 * 用 JS 改 input.checked 不会触发事件，改完调用 Nova.get(el, 'segmented').refresh()，或用 .value = 'x'。
 */
(() => {
  Nova.define('segmented', '.nv-segmented', (el) => {
    if (!el.hasAttribute('role')) el.setAttribute('role', 'radiogroup');
    const indicator = Nova.h('span', { class: 'nv-segmented-indicator', 'aria-hidden': 'true' });
    el.prepend(indicator);
    const inputs = () => [...el.querySelectorAll(':scope > label > input[type="radio"]')];

    const place = () => {
      const input = inputs().find((i) => i.checked);
      if (!input) { indicator.style.opacity = '0'; return; }
      const label = input.parentElement;
      indicator.style.opacity = '';
      el.style.setProperty('--_x', `${label.offsetLeft}px`);
      el.style.setProperty('--_w', `${label.offsetWidth}px`);
    };

    place();
    el.classList.add('is-ready');
    // 首次定位后再开启过渡，避免页面加载时指示器从左边滑过来
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-animated')));

    const onChange = (e) => {
      if (!e.target.matches('input[type="radio"]') || !el.contains(e.target)) return;
      place();
      Nova.emit(el, 'nv:change', { value: e.target.value });
    };
    el.addEventListener('change', onChange);
    // 表单 reset 后浏览器在事件之后才恢复 checked，下一帧再定位
    const form = el.closest('form');
    const onReset = () => setTimeout(place);
    form?.addEventListener('reset', onReset);
    const ro = new ResizeObserver(place);
    ro.observe(el);

    return {
      refresh: place,
      get value() { return inputs().find((i) => i.checked)?.value ?? null; },
      set value(v) {
        const hit = inputs().find((i) => i.value === String(v));
        if (hit) { hit.checked = true; place(); }
      },
      destroy() {
        el.removeEventListener('change', onChange);
        form?.removeEventListener('reset', onReset);
        ro.disconnect();
        indicator.remove();
        el.classList.remove('is-ready', 'is-animated');
      },
    };
  });
})();

;
/* src/components/number-input/number-input.js */
/* DomSprig-UI · Number Input
 * <input type="number" class="nv-number" min="0" max="100" step="1">
 * - 独立的 input 会被包进 .nv-control.nv-number-box；已在 .nv-control 里（带前后缀）则直接增强。
 * - data-controls  stacked（默认，右侧上下箭头）| sides（左减右加）| none
 * - data-precision 固定小数位（失焦时补齐，如 1 → 1.00）；不写时按 step / min 的小数位四舍五入，消除浮点误差。
 * - 键盘（WAI-ARIA spinbutton）：↑ ↓ 步进，Shift 或 PageUp / PageDown ×10，Home / End 到 min / max。
 * - 按住按钮连续步进；到边界时对应按钮禁用。
 * - 用户输入越界的值，在原生 change 派发前就被夹回范围内，监听者拿到的是修正后的值。
 * 事件：按钮和键盘修改时派发原生 input、change，并在 input 上派发 nv:change { value }。
 * 实例：Nova.get(input, 'number-input') → { value, stepUp(n), stepDown(n), refresh(), destroy() }
 */
(() => {
  const decimals = (n) => {
    const s = String(n);
    if (s.includes('e-')) return Number(s.split('e-')[1]);
    const i = s.indexOf('.');
    return i < 0 ? 0 : s.length - i - 1;
  };
  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));

  Nova.define('number-input', 'input.nv-number', (input) => {
    const o = Nova.opts(input, { controls: 'stacked', precision: -1, incLabel: '增加', decLabel: '减少' });

    const attr = (name) => {
      const v = input.getAttribute(name);
      return v === null || v === '' ? NaN : Number(v);
    };
    const min = () => attr('min');
    const max = () => attr('max');
    const step = () => {
      const s = attr('step');
      return Number.isFinite(s) && s > 0 ? s : 1;
    };
    const precision = () => (o.precision >= 0
      ? o.precision
      : Math.max(decimals(step()), Number.isFinite(min()) ? decimals(min()) : 0));
    const read = () => (input.value === '' ? NaN : Number(input.value));
    const clamp = (v) => {
      if (Number.isFinite(min()) && v < min()) v = min();
      if (Number.isFinite(max()) && v > max()) v = max();
      return v;
    };
    const format = (v) => {
      const fixed = clamp(Number(v.toFixed(precision())));
      return o.precision >= 0 ? fixed.toFixed(o.precision) : String(fixed);
    };

    /* —— 外框 —— */
    let box = input.parentElement;
    let wrapped = false;
    if (!box || !box.classList.contains('nv-control')) {
      box = Nova.h('div', { class: 'nv-control' });
      for (const k of ['size', 'variant']) if (input.dataset[k]) box.dataset[k] = input.dataset[k];
      input.before(box);
      box.append(input);
      wrapped = true;
    }
    box.classList.add('nv-number-box');
    box.dataset.controls = o.controls;

    const stacked = o.controls !== 'sides';
    const mkBtn = (dir) => Nova.h('button', {
      type: 'button',
      class: 'nv-number-btn',
      'data-dir': dir > 0 ? 'up' : 'down',
      tabindex: '-1',
      'aria-label': dir > 0 ? o.incLabel : o.decLabel,
      html: Nova.icon(stacked ? (dir > 0 ? 'chevron-up' : 'chevron-down') : (dir > 0 ? 'plus' : 'minus'), { size: stacked ? 12 : 15, stroke: stacked ? 2.4 : 2 }),
    });
    const up = mkBtn(1);
    const down = mkBtn(-1);
    let steppers = null;
    if (o.controls === 'sides') {
      box.prepend(down);
      box.append(up);
    } else if (o.controls !== 'none') {
      steppers = Nova.h('span', { class: 'nv-number-steppers' }, up, down);
      box.append(steppers);
    }

    /* —— 状态 —— */
    const sync = () => {
      const v = read();
      const off = input.disabled || input.readOnly;
      up.disabled = off || (Number.isFinite(max()) && Number.isFinite(v) && v >= max());
      down.disabled = off || (Number.isFinite(min()) && Number.isFinite(v) && v <= min());
      if (up.disabled && repeatDir > 0) stopRepeat();
      if (down.disabled && repeatDir < 0) stopRepeat();
    };

    const commit = (v, emit = true) => {
      const next = Number.isFinite(v) ? format(v) : '';
      if (next === input.value) { sync(); return; }
      input.value = next;
      sync();
      if (emit) {
        fire(input, 'input');
        fire(input, 'change');
        Nova.emit(input, 'nv:change', { value: read() });
      }
    };

    const stepBy = (n) => {
      if (input.disabled || input.readOnly) return;
      const cur = read();
      const next = Number.isFinite(cur)
        ? cur + n * step()
        : (n > 0 && Number.isFinite(min()) ? min() : n * step());
      commit(next);
    };

    /* —— 按住连续步进 —— */
    let delayTimer = 0;
    let repeatTimer = 0;
    let repeatDir = 0;
    const stopRepeat = () => {
      clearTimeout(delayTimer);
      clearInterval(repeatTimer);
      repeatDir = 0;
    };
    const bindButton = (btn, dir) => {
      btn.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || btn.disabled) return;
        e.preventDefault(); // 不抢焦点
        stepBy(dir);
        stopRepeat();
        repeatDir = dir;
        delayTimer = setTimeout(() => { repeatTimer = setInterval(() => stepBy(dir), 60); }, 400);
        try { btn.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => btn.addEventListener(t, stopRepeat));
      // 读屏的虚拟光标激活按钮时只有 click（detail 为 0），没有 pointerdown
      btn.addEventListener('click', (e) => { if (e.detail === 0) stepBy(dir); });
    };
    bindButton(up, 1);
    bindButton(down, -1);

    /* —— 键盘 —— */
    const onKey = (e) => {
      if (input.disabled || input.readOnly || e.altKey || e.ctrlKey || e.metaKey) return;
      switch (e.key) {
        case 'ArrowUp': stepBy(e.shiftKey ? 10 : 1); break;
        case 'ArrowDown': stepBy(e.shiftKey ? -10 : -1); break;
        case 'PageUp': stepBy(10); break;
        case 'PageDown': stepBy(-10); break;
        case 'Home': if (!Number.isFinite(min())) return; commit(min()); break;
        case 'End': if (!Number.isFinite(max())) return; commit(max()); break;
        default: return;
      }
      e.preventDefault();
    };

    // 原生 change（用户输入后失焦 / 回车）：捕获阶段先修正，不再额外派发
    const onNativeChange = (e) => {
      if (!e.isTrusted) return;
      const v = read();
      if (Number.isFinite(v)) {
        const next = format(v);
        if (next !== input.value) input.value = next;
      }
      sync();
      Nova.emit(input, 'nv:change', { value: read() });
    };
    // 某些浏览器在输入框获得焦点时滚轮会改值；只在聚焦且指针在框内时拦截
    const onWheel = (e) => {
      if (document.activeElement === input) e.preventDefault();
    };

    input.addEventListener('keydown', onKey);
    input.addEventListener('input', sync);
    input.addEventListener('change', onNativeChange, true);
    input.addEventListener('wheel', onWheel, { passive: false });
    const form = input.form;
    const onReset = () => setTimeout(sync);
    form?.addEventListener('reset', onReset);
    const mo = new MutationObserver(sync);
    mo.observe(input, { attributes: true, attributeFilter: ['min', 'max', 'step', 'disabled', 'readonly'] });

    // 初始值只补齐固定小数位，不夹范围（保留服务端回填的越界值，交给校验提示）
    if (o.precision >= 0 && Number.isFinite(read())) input.value = read().toFixed(o.precision);
    sync();

    return {
      get value() { return read(); },
      set value(v) { commit(v === '' || v == null ? NaN : Number(v), false); },
      stepUp: (n = 1) => stepBy(n),
      stepDown: (n = 1) => stepBy(-n),
      refresh: sync,
      destroy() {
        stopRepeat();
        mo.disconnect();
        input.removeEventListener('keydown', onKey);
        input.removeEventListener('input', sync);
        input.removeEventListener('change', onNativeChange, true);
        input.removeEventListener('wheel', onWheel);
        form?.removeEventListener('reset', onReset);
        up.remove();
        down.remove();
        steppers?.remove();
        box.classList.remove('nv-number-box');
        delete box.dataset.controls;
        if (wrapped) { box.before(input); box.remove(); }
      },
    };
  });
})();

;
/* src/components/pin-input/pin-input.js */
/* DomSprig-UI · Pin Input
 * <input class="nv-pin" name="code" data-length="6" aria-label="验证码">
 * 只有一个真实 input（透明地盖在格子上），所以下面这些都由浏览器原生完成：
 *   表单提交与校验、短信验证码自动填充（autocomplete="one-time-code"）、撤销、读屏朗读。
 * - data-length   位数，默认取 maxlength，再没有时为 6
 * - data-type     numeric（默认）| alphanumeric | any；不允许的字符输入或粘贴时直接丢弃（粘贴 "123 456" 得到 123456）
 * - data-group    每 n 格插一个分隔符；data-mask 用圆点显示；placeholder 的第 i 个字符显示在第 i 个空格子里
 * - data-autosubmit 填满后自动提交所在表单
 * - 光标始终在末尾：输入向后填、退格从后删；Ctrl/⌘ + A 全选后输入会整体替换。
 * 事件：原生 input / change；另外派发 nv:change { value, complete }，填满时派发 nv:complete { value }。
 * 实例：Nova.get(input, 'pin-input') → { value, clear(), focus(), destroy() }
 */
(() => {
  const FILTERS = {
    numeric: /[^0-9]/g,
    alphanumeric: /[^0-9a-z]/gi,
    any: /[\s]/g,
  };
  const PATTERNS = { numeric: '[0-9]', alphanumeric: '[0-9A-Za-z]', any: '\\S' };

  Nova.define('pin-input', 'input.nv-pin', (input) => {
    const o = Nova.opts(input, { length: 0, type: 'numeric', group: 0, mask: false, autosubmit: false });
    const n = Math.max(1, o.length || (input.maxLength > 0 ? input.maxLength : 6));
    const type = FILTERS[o.type] ? o.type : 'numeric';
    const clean = (s) => String(s ?? '').replace(FILTERS[type], '').slice(0, n);

    /* —— 原生属性：只补没写的 —— */
    const added = [];
    const ensure = (name, value) => {
      if (input.hasAttribute(name)) return;
      input.setAttribute(name, value);
      added.push(name);
    };
    input.maxLength = n;
    ensure('autocomplete', 'one-time-code');
    ensure('inputmode', type === 'numeric' ? 'numeric' : 'text');
    ensure('pattern', `${PATTERNS[type]}{${n}}`);
    ensure('spellcheck', 'false');
    ensure('autocapitalize', 'off');
    ensure('autocorrect', 'off');

    /* —— 结构 —— */
    const box = Nova.h('div', { class: 'nv-pin-box' });
    for (const k of ['size', 'variant']) if (input.dataset[k]) box.dataset[k] = input.dataset[k];
    const slotsEl = Nova.h('div', { class: 'nv-pin-slots', 'aria-hidden': 'true' });
    const slots = [];
    for (let i = 0; i < n; i++) {
      if (o.group > 0 && i > 0 && i % o.group === 0) slotsEl.append(Nova.h('span', { class: 'nv-pin-sep' }));
      const s = Nova.h('span', { class: 'nv-pin-slot' });
      slots.push(s);
      slotsEl.append(s);
    }
    input.before(box);
    box.append(input, slotsEl);

    /* —— 渲染 —— */
    let lastLen = input.value.length;
    const render = () => {
      const v = input.value;
      const ph = input.getAttribute('placeholder') || '';
      const focused = document.activeElement === input;
      const all = focused && v.length > 0 && input.selectionStart === 0 && input.selectionEnd === v.length;
      const at = Math.min(v.length, n - 1);
      slots.forEach((s, i) => {
        const ch = v[i];
        s.textContent = ch ? (o.mask ? '•' : ch) : (ph[i] || '');
        s.toggleAttribute('data-filled', !!ch);
        s.toggleAttribute('data-active', focused && (all ? i < v.length : i === at));
        s.toggleAttribute('data-caret', focused && !all && i === v.length);
      });
      // 新输入的那一格弹一下
      if (v.length > lastLen && v.length <= n) {
        const s = slots[v.length - 1];
        s.classList.remove('is-pop');
        void s.offsetWidth;
        s.classList.add('is-pop');
      }
      lastLen = v.length;
    };

    // 光标固定在末尾（全选除外），格子的高亮才能和真实光标一致
    const pinCaret = () => {
      if (document.activeElement !== input) return;
      const len = input.value.length;
      const all = len > 0 && input.selectionStart === 0 && input.selectionEnd === len;
      if (!all && (input.selectionStart !== len || input.selectionEnd !== len)) {
        try { input.setSelectionRange(len, len); } catch (_) { /* ignore */ }
      }
      render();
    };

    const emitChange = (prevComplete) => {
      const value = input.value;
      const complete = value.length === n;
      Nova.emit(input, 'nv:change', { value, complete });
      if (complete && !prevComplete) {
        Nova.emit(input, 'nv:complete', { value });
        if (o.autosubmit && input.form) {
          if (input.form.requestSubmit) input.form.requestSubmit();
          else input.form.submit();
        }
      }
    };

    /* —— 事件 —— */
    let wasComplete = input.value.length === n;
    const onInput = () => {
      const v = clean(input.value);
      if (v !== input.value) input.value = v;
      pinCaret();
      emitChange(wasComplete);
      wasComplete = v.length === n;
    };

    const onPaste = (e) => {
      if (input.readOnly || input.disabled) return;
      const text = clean(e.clipboardData?.getData('text') ?? '');
      e.preventDefault();
      if (!text) return;
      const len = input.value.length;
      const all = input.selectionStart === 0 && input.selectionEnd === len;
      const next = all || text.length >= n ? text : (input.value + text).slice(0, n);
      if (next === input.value) return;
      input.value = next;
      // 走一遍原生 input，让表单框架、撤销以外的监听者都能收到
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const onKey = (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) e.preventDefault();
    };

    const onSelChange = () => { if (document.activeElement === input) pinCaret(); };
    const onFocus = () => { requestAnimationFrame(pinCaret); render(); };
    const onBlur = () => render();

    input.addEventListener('input', onInput);
    input.addEventListener('paste', onPaste);
    input.addEventListener('keydown', onKey);
    input.addEventListener('keyup', pinCaret);
    input.addEventListener('pointerup', pinCaret);
    input.addEventListener('select', pinCaret);
    input.addEventListener('focus', onFocus);
    input.addEventListener('blur', onBlur);
    document.addEventListener('selectionchange', onSelChange);
    const form = input.form;
    const onReset = () => setTimeout(() => { lastLen = input.value.length; wasComplete = lastLen === n; render(); });
    form?.addEventListener('reset', onReset);
    const mo = new MutationObserver(render);
    mo.observe(input, { attributes: true, attributeFilter: ['placeholder', 'disabled'] });

    input.value = clean(input.value);
    lastLen = input.value.length;
    render();

    return {
      get value() { return input.value; },
      set value(v) {
        input.value = clean(v);
        lastLen = input.value.length;
        wasComplete = lastLen === n;
        render();
      },
      clear() {
        input.value = '';
        lastLen = 0;
        wasComplete = false;
        render();
      },
      focus() { input.focus(); },
      destroy() {
        input.removeEventListener('input', onInput);
        input.removeEventListener('paste', onPaste);
        input.removeEventListener('keydown', onKey);
        input.removeEventListener('keyup', pinCaret);
        input.removeEventListener('pointerup', pinCaret);
        input.removeEventListener('select', pinCaret);
        input.removeEventListener('focus', onFocus);
        input.removeEventListener('blur', onBlur);
        document.removeEventListener('selectionchange', onSelChange);
        form?.removeEventListener('reset', onReset);
        mo.disconnect();
        added.forEach((a) => input.removeAttribute(a));
        box.before(input);
        box.remove();
      },
    };
  });
})();

;
/* src/components/avatar/avatar.js */
/* DomSprig-UI · Avatar
 * - data-name：生成文字头像。中文取最后两个字（xs 尺寸取一个），英文取前两个单词的首字母；
 *   色相由名字哈希得出，同名同色。写了 data-color 则不自动配色。
 * - 图片加载失败：回退为文字头像（名字取 data-name 或 img 的 alt），都没有时显示 user 图标。
 * - .nv-avatar-group[data-max]：最多显示 max 个，其余隐藏并在末尾追加 +N（title 列出被隐藏的名字）。
 * Nova.avatar.initials(name, max?) / Nova.avatar.hue(name)
 */
(() => {
  const CJK = /[㐀-鿿豈-﫿]/;
  const hue = (name) => {
    let h = 0;
    for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return h % 360;
  };
  const initials = (name, max = 2) => {
    const s = String(name || '').trim();
    if (!s) return '';
    if (CJK.test(s)) return [...s.replace(/\s+/g, '')].slice(-max).join('');
    const words = s.split(/[\s._-]+/).filter(Boolean);
    return words.slice(0, max).map((w) => [...w][0]).join('').toUpperCase();
  };

  function paint(el, name) {
    el.textContent = '';
    const text = initials(name, el.dataset.size === 'xs' ? 1 : 2);
    if (text) {
      el.append(text);
      el.dataset.chars = String([...text].length);
    } else {
      el.insertAdjacentHTML('beforeend', Nova.icon('user'));
    }
    if (!el.matches('a, button') && !el.hasAttribute('aria-label')) {
      el.setAttribute('role', 'img');
      if (name) el.setAttribute('aria-label', name);
    }
  }

  Nova.define('avatar', '.nv-avatar', (el) => {
    if (el.classList.contains('nv-avatar-more')) return {};
    const img = el.querySelector(':scope > img');
    const name = el.dataset.name || img?.alt || '';
    if (name && !el.dataset.color) el.style.setProperty('--_hue', String(hue(name)));

    if (img) {
      const fallback = () => paint(el, name);
      if (img.complete && img.getAttribute('src') && img.naturalWidth === 0) fallback();
      else img.addEventListener('error', fallback, { once: true });
    } else if (!el.textContent.trim() && !el.querySelector('svg, [data-nv-icon]')) {
      paint(el, name);
    }
    return {};
  });

  Nova.define('avatar-group', '.nv-avatar-group', (el) => {
    const avatars = () => [...el.querySelectorAll(':scope > .nv-avatar:not(.nv-avatar-more)')];
    const refresh = () => {
      el.querySelectorAll(':scope > .nv-avatar-more').forEach((m) => m.remove());
      const items = avatars();
      if (el.dataset.size) items.forEach((a) => { a.dataset.size = el.dataset.size; });
      items.forEach((a) => { a.hidden = false; });
      const max = Number(el.dataset.max) || 0;
      if (!max || items.length <= max) return;
      const rest = items.slice(max);
      rest.forEach((a) => { a.hidden = true; });
      const names = rest.map((a) => a.dataset.name || a.querySelector('img')?.alt || '').filter(Boolean);
      el.append(Nova.h('span', {
        class: 'nv-avatar nv-avatar-more',
        role: 'img',
        'aria-label': `另有 ${rest.length} 人`,
        title: names.join('、') || null,
        'data-size': items[0].dataset.size || null,
        'data-shape': items[0].dataset.shape || null,
      }, `+${rest.length}`));
    };
    refresh();
    const mo = new MutationObserver((records) => {
      const changed = records.some((r) => [...r.addedNodes, ...r.removedNodes]
        .some((n) => n.nodeType === 1 && !n.classList.contains('nv-avatar-more')));
      if (changed) refresh();
    });
    mo.observe(el, { childList: true });
    return { refresh, destroy() { mo.disconnect(); } };
  });

  Nova.avatar = { initials, hue };
})();

;
/* src/components/tag/tag.js */
/* DomSprig-UI · Tag
 * - [data-closable]：追加关闭按钮。点击先派发可取消的 nv:close，未取消则播放退场动画并移除；
 *   data-closable="hide" 时只隐藏（hidden），不移除。
 * - [data-checkable]（建议用 <button>）：点击切换 aria-pressed，派发 nv:change { checked }。
 * - .nv-tag-group：组内可选标签的值汇总，派发 nv:change { value: [...] }；data-single 单选（可再次点击取消，
 *   加 data-required 则至少保留一个）。标签的值取 data-value，没有时取文字。
 * Nova.tag.close(el) / Nova.tag.toggle(el, force?) / Nova.get(group, 'tag-group').value（可读写，写入不派发事件）
 */
(() => {
  // 标签文字：跳过头像、图标、关闭按钮等装饰（文字头像本身也是文字，不能算进去）
  const SKIP = '.nv-avatar, .nv-tag-close, svg, [aria-hidden="true"]';
  const label = (el) => {
    const own = el.querySelector('.nv-tag-label');
    if (own) return own.textContent.trim();
    const copy = el.cloneNode(true);
    copy.querySelectorAll(SKIP).forEach((n) => n.remove());
    return copy.textContent.trim();
  };
  const valueOf = (el) => el.dataset.value ?? label(el);

  function close(el, { emit = true } = {}) {
    if (emit && !Nova.emit(el, 'nv:close', { value: valueOf(el) })) return false;
    // 焦点挪到相邻的可聚焦标签，避免丢失
    const next = el.nextElementSibling?.querySelector?.('.nv-tag-close') || el.previousElementSibling?.querySelector?.('.nv-tag-close');
    const hadFocus = el.contains(document.activeElement);
    const parent = el.parentElement;
    const done = () => {
      if (el.dataset.closable === 'hide') { el.hidden = true; el.removeAttribute('data-state'); }
      else el.remove();
      if (hadFocus) (next || parent)?.focus?.();
    };
    Nova.animateOut(el, done);
    return true;
  }

  function toggle(el, force, { emit = true } = {}) {
    const checked = force ?? el.getAttribute('aria-pressed') !== 'true';
    if (checked === (el.getAttribute('aria-pressed') === 'true')) return false;
    el.setAttribute('aria-pressed', String(checked));
    if (emit) Nova.emit(el, 'nv:change', { checked, value: valueOf(el) });
    return true;
  }

  Nova.define('tag', '.nv-tag', (el) => {
    if ('closable' in el.dataset && !el.querySelector(':scope > .nv-tag-close')) {
      const btn = Nova.h('button', {
        type: 'button',
        class: 'nv-tag-close',
        'aria-label': `移除 ${label(el)}`,
        html: Nova.icon('x', { size: 12, stroke: 2.25 }),
      });
      btn.addEventListener('click', (e) => { e.stopPropagation(); close(el); });
      el.append(btn);
    }
    if ('checkable' in el.dataset) {
      if (!el.hasAttribute('aria-pressed')) el.setAttribute('aria-pressed', 'false');
      if (!el.matches('button, a, [tabindex]')) { el.tabIndex = 0; el.setAttribute('role', 'button'); }
      const onClick = () => {
        const group = el.closest('.nv-tag-group');
        if (group && Nova.get(group, 'tag-group')) return; // 交给组处理
        if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;
        toggle(el);
      };
      const onKey = (e) => {
        if (el.matches('button')) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
      };
      el.addEventListener('click', onClick);
      el.addEventListener('keydown', onKey);
      return { toggle: (f) => toggle(el, f), destroy() { el.removeEventListener('click', onClick); el.removeEventListener('keydown', onKey); } };
    }
    return { close: () => close(el) };
  });

  Nova.define('tag-group', '.nv-tag-group', (group) => {
    const items = () => [...group.querySelectorAll('.nv-tag[data-checkable]')];
    const value = () => items().filter((t) => t.getAttribute('aria-pressed') === 'true').map(valueOf);
    const onClick = (e) => {
      const tag = e.target.closest('.nv-tag[data-checkable]');
      if (!tag || !group.contains(tag) || tag.disabled || tag.getAttribute('aria-disabled') === 'true') return;
      const on = tag.getAttribute('aria-pressed') === 'true';
      if ('single' in group.dataset) {
        if (on && 'required' in group.dataset) return;
        items().forEach((t) => t !== tag && toggle(t, false, { emit: false }));
      }
      toggle(tag, !on, { emit: false });
      Nova.emit(group, 'nv:change', { value: value() });
    };
    // 组内标签不单独派发 nv:change，只由组派发一次 { value: [...] }
    group.addEventListener('click', onClick);
    if (!group.hasAttribute('role')) group.setAttribute('role', 'group');
    return {
      get value() { return value(); },
      set value(v) {
        const set = new Set([].concat(v).map(String));
        items().forEach((t) => toggle(t, set.has(String(valueOf(t))), { emit: false }));
      },
      destroy() { group.removeEventListener('click', onClick); },
    };
  });

  Nova.tag = { close, toggle };
})();

;
/* src/components/tag-input/tag-input.js */
/* DomSprig-UI · Tag Input
 * <div class="nv-tag-input" data-name="tags" data-value="设计,前端" data-placeholder="输入后回车" aria-label="标签"></div>
 * 回车或分隔符（默认逗号，中文逗号同样生效）把输入变成标签；输入框为空时按退格先选中最后一个标签，再按一次删除。
 * 每个标签对应一个隐藏 input[name]，表单提交得到 tags=设计&tags=前端；没有 data-name 时不生成隐藏域。
 * 粘贴 "a, b, c" 或多行文字一次变多个标签。容器加 aria-disabled="true" 或 .is-disabled 时禁用。
 * 事件：nv:add { value, values }（可取消）、nv:remove { value, values }（可取消）、nv:change { values }、
 *       nv:invalid { value, reason }，reason 取 duplicate | pattern | max | maxlength。
 * 实例：Nova.get(el, 'tag-input') → { value, add(v), remove(v), clear(), focus(), destroy() }
 */
(() => {
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

  Nova.define('tag-input', '.nv-tag-input', (el) => {
    const o = Nova.opts(el, {
      name: '', value: '', placeholder: '', separator: ',', max: 0, maxLength: 0,
      duplicates: false, caseSensitive: false, pattern: '', variant: 'soft', color: '', size: '',
    });
    const sep = o.separator || ',';
    const seps = sep === ',' ? ',，' : sep;
    const splitRe = sep === ' ' ? /\s+/ : new RegExp(`[${escRe(seps)}\\r\\n]+`);
    let pattern = null;
    try { if (o.pattern) pattern = new RegExp(o.pattern); } catch (_) { /* 非法正则忽略 */ }
    const key = (s) => (o.caseSensitive ? s : s.toLocaleLowerCase());
    const split = (s) => String(s ?? '').split(splitRe).map((x) => x.trim()).filter(Boolean);

    el.classList.add('nv-control');
    if (o.size) el.dataset.size = o.size;
    if (!el.hasAttribute('role')) el.setAttribute('role', 'group');
    const disabled = el.classList.contains('is-disabled') || el.getAttribute('aria-disabled') === 'true';

    const input = Nova.h('input', {
      type: 'text',
      class: 'nv-tag-input-field',
      placeholder: o.placeholder || null,
      autocomplete: 'off',
      spellcheck: 'false',
      enterkeyhint: 'done',
      'aria-label': el.getAttribute('aria-label') || o.placeholder || '添加标签',
      disabled: disabled || null,
    });
    el.append(input);

    const items = []; // { value, tag, hidden }
    const values = () => items.map((it) => it.value);
    const emitChange = () => Nova.emit(el, 'nv:change', { values: values() });
    const syncFull = () => el.classList.toggle('is-full', o.max > 0 && items.length >= o.max);

    const removeAt = (i, emit = true) => {
      const it = items[i];
      if (!it) return false;
      if (emit && !Nova.emit(el, 'nv:remove', { value: it.value, values: values().filter((_, k) => k !== i) })) return false;
      items.splice(i, 1);
      it.hidden?.remove();
      if (emit) Nova.animateOut(it.tag, () => it.tag.remove());
      else it.tag.remove();
      syncFull();
      if (emit) emitChange();
      return true;
    };

    const makeTag = (value) => {
      const btn = Nova.h('button', {
        type: 'button',
        class: 'nv-tag-close',
        'aria-label': `移除 ${value}`,
        disabled: disabled || null,
        html: Nova.icon('x', { size: 11, stroke: 2.25 }),
      });
      const tag = Nova.h('span', {
        class: 'nv-tag',
        'data-variant': o.variant,
        'data-color': o.color || null,
        'data-value': value,
      }, Nova.h('span', { class: 'nv-tag-label', title: value }, value), btn);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (removeAt(items.findIndex((it) => it.tag === tag))) input.focus();
      });
      return tag;
    };

    const add = (raw, emit = true) => {
      const value = String(raw ?? '').trim();
      if (!value) return false;
      const reject = (reason) => { if (emit) Nova.emit(el, 'nv:invalid', { value, reason }); return false; };
      if (o.max > 0 && items.length >= o.max) return reject('max');
      if (o.maxLength > 0 && [...value].length > o.maxLength) return reject('maxlength');
      if (pattern && !pattern.test(value)) return reject('pattern');
      if (!o.duplicates && items.some((it) => key(it.value) === key(value))) return reject('duplicate');
      if (emit && !Nova.emit(el, 'nv:add', { value, values: [...values(), value] })) return false;
      const tag = makeTag(value);
      const hidden = o.name ? Nova.h('input', { type: 'hidden', name: o.name, value }) : null;
      input.before(tag);
      if (hidden) el.append(hidden);
      items.push({ value, tag, hidden });
      syncFull();
      if (emit) emitChange();
      return true;
    };

    const reset = (list) => {
      items.splice(0).forEach((it) => { it.tag.remove(); it.hidden?.remove(); });
      list.forEach((v) => add(v, false));
      syncFull();
    };

    // 拆开逐个添加；被拒绝的最后一段留在输入框里，方便修改
    const commit = (text) => {
      let rest = '';
      for (const p of split(text)) if (!add(p)) rest = p;
      input.value = rest;
    };

    /* —— 事件 —— */
    const last = () => items[items.length - 1];
    const clearPending = () => items.forEach((it) => it.tag.removeAttribute('data-pending'));
    const onKey = (e) => {
      if (e.isComposing || e.keyCode === 229) return; // 输入法组字中
      if (e.key === 'Enter' || (e.key.length === 1 && seps.includes(e.key))) {
        if (input.value.trim()) { e.preventDefault(); commit(input.value); }
        else if (e.key !== 'Enter') e.preventDefault(); // 空输入时不留下孤立的分隔符；回车照常提交表单
        return;
      }
      if (e.key === 'Backspace' && input.value === '' && items.length) {
        e.preventDefault();
        if (last().tag.hasAttribute('data-pending')) removeAt(items.length - 1);
        else last().tag.setAttribute('data-pending', '');
        return;
      }
      clearPending();
    };
    const onInput = (e) => {
      clearPending();
      if (!e.isComposing && splitRe.test(input.value)) commit(input.value);
    };
    const onPaste = (e) => {
      const text = e.clipboardData?.getData('text') ?? '';
      if (!splitRe.test(text.trim())) return; // 单个词交给浏览器正常粘贴
      e.preventDefault();
      commit(input.value + sep + text);
    };
    const onBlur = () => { clearPending(); if (input.value.trim()) commit(input.value); };
    const onClick = (e) => { if (!e.target.closest('button, input')) input.focus(); };

    input.addEventListener('keydown', onKey);
    input.addEventListener('input', onInput);
    input.addEventListener('paste', onPaste);
    input.addEventListener('blur', onBlur);
    el.addEventListener('click', onClick);

    const initial = split(o.value);
    const form = el.closest('form');
    // reset 事件在表单恢复默认值之前派发；隐藏域的值写在属性上，不受恢复影响
    const onReset = () => reset(initial);
    form?.addEventListener('reset', onReset);
    reset(initial);

    return {
      get value() { return values(); },
      set value(v) { reset(Array.isArray(v) ? v : split(v)); },
      add: (v) => add(v),
      remove: (v) => removeAt(items.findIndex((it) => key(it.value) === key(String(v)))),
      clear() { if (items.length) { reset([]); emitChange(); } },
      focus: () => input.focus(),
      destroy() {
        input.removeEventListener('keydown', onKey);
        input.removeEventListener('input', onInput);
        input.removeEventListener('paste', onPaste);
        input.removeEventListener('blur', onBlur);
        el.removeEventListener('click', onClick);
        form?.removeEventListener('reset', onReset);
        reset([]);
        input.remove();
        el.classList.remove('nv-control', 'is-full');
      },
    };
  });
})();

;
/* src/components/rating/rating.js */
/* DomSprig-UI · Rating
 * <div class="nv-rating" data-name="score" data-value="3.5" data-half aria-label="评分"></div>
 * 每颗星是一个原生 radio（半星模式左右各一个，值为 n-0.5 和 n），表单提交、方向键、读屏都由浏览器完成。
 * JS 只做三件事：按 data-value 生成 radio、用 --_fill 画填充比例、悬停时预览。
 * - data-max 几颗星（默认 5）；data-value 初始分；data-half 允许半星；data-clearable 再点当前值清空。
 * - data-readonly 只读（radio 禁用）；容器上的 disabled 属性或 .is-disabled 同样禁用。
 * - data-show-value 在末尾显示当前分数。
 * 事件：原生 change；另外派发 nv:change { value }。
 * 实例：Nova.get(el, 'rating') → { value, clear(), destroy() }
 */
(() => {
  Nova.define('rating', '.nv-rating', (el) => {
    const o = Nova.opts(el, {
      name: '',
      value: 0,
      max: 5,
      half: false,
      clearable: false,
      readonly: false,
      showValue: false,
      size: '',
      color: '',
    });
    const max = Math.max(1, o.max);
    const name = o.name || Nova.uid('nv-rating');
    if (!el.hasAttribute('role')) el.setAttribute('role', 'radiogroup');

    const inputs = [];
    for (let i = 1; i <= max; i++) {
      const item = Nova.h('span', { class: 'nv-rating-item' });
      const steps = o.half ? [i - 0.5, i] : [i];
      for (const v of steps) {
        const input = Nova.h('input', {
          type: 'radio',
          name,
          value: String(v),
          'aria-label': o.half && v % 1 ? `${v} 星` : `${v} 星`,
        });
        if (o.readonly) input.disabled = true;
        inputs.push(input);
        item.append(input);
      }
      el.append(item);
    }

    const valueEl = o.showValue ? Nova.h('span', { class: 'nv-rating-value', 'aria-hidden': 'true' }) : null;
    if (valueEl) el.append(valueEl);

    const current = () => {
      const hit = inputs.find((i) => i.checked);
      return hit ? Number(hit.value) : 0;
    };

    /* —— 填充 —— */
    const paint = (value) => {
      el.querySelectorAll('.nv-rating-item').forEach((item, idx) => {
        const star = idx + 1;
        const fill = Math.max(0, Math.min(1, value - (star - 1)));
        item.style.setProperty('--_fill', String(fill));
      });
      if (valueEl) valueEl.textContent = value ? String(value) : '';
    };

    /* —— 悬停预览 —— */
    const clearPreview = () => {
      el.classList.remove('is-preview');
      el.querySelectorAll('.nv-rating-item').forEach((item) => {
        item.removeAttribute('data-preview');
        item.removeAttribute('data-hover');
        item.style.removeProperty('--_hover-fill');
      });
    };
    const preview = (input) => {
      if (o.readonly || input.disabled) return;
      const v = Number(input.value);
      el.classList.add('is-preview');
      el.querySelectorAll('.nv-rating-item').forEach((item, idx) => {
        const star = idx + 1;
        const fill = Math.max(0, Math.min(1, v - (star - 1)));
        item.style.setProperty('--_hover-fill', String(fill));
        item.toggleAttribute('data-preview', fill > 0 && star < Math.ceil(v));
        item.toggleAttribute('data-hover', star === Math.ceil(v));
      });
    };

    /* —— 事件 —— */
    const onChange = (e) => {
      if (e.target.type !== 'radio') return;
      paint(current());
      Nova.emit(el, 'nv:change', { value: current() });
    };
    // clearable：再点当前选中的 radio 时清空。radio 的 click 在 change 之后，checked 已经是 true。
    const onClick = (e) => {
      const input = e.target.closest('input[type="radio"]');
      if (!input || !o.clearable || input.disabled) return;
      if (input.dataset.wasChecked === 'true') {
        input.checked = false;
        delete input.dataset.wasChecked;
        paint(0);
        Nova.emit(el, 'nv:change', { value: 0 });
      }
    };
    const onPointerDown = (e) => {
      const input = e.target.closest('input[type="radio"]');
      if (input) input.dataset.wasChecked = String(input.checked);
    };
    const onOver = (e) => {
      const input = e.target.closest('input[type="radio"]');
      if (input) preview(input);
    };
    const onLeave = () => clearPreview();

    el.addEventListener('change', onChange);
    el.addEventListener('click', onClick);
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointerover', onOver);
    el.addEventListener('pointerleave', onLeave);

    const form = el.closest('form');
    const onReset = () => setTimeout(() => paint(current()));
    form?.addEventListener('reset', onReset);

    // 初始值：data-value 优先，其次是已 checked 的 radio
    if (o.value > 0) {
      const hit = inputs.find((i) => Number(i.value) === o.value);
      if (hit) hit.checked = true;
    }
    paint(current());

    return {
      get value() { return current(); },
      set value(v) {
        const n = Number(v) || 0;
        const hit = inputs.find((i) => Number(i.value) === n);
        inputs.forEach((i) => { i.checked = i === hit; });
        paint(n);
      },
      clear() {
        inputs.forEach((i) => { i.checked = false; });
        paint(0);
      },
      destroy() {
        el.removeEventListener('change', onChange);
        el.removeEventListener('click', onClick);
        el.removeEventListener('pointerdown', onPointerDown);
        el.removeEventListener('pointerover', onOver);
        el.removeEventListener('pointerleave', onLeave);
        form?.removeEventListener('reset', onReset);
        el.querySelectorAll('.nv-rating-item, .nv-rating-value').forEach((n) => n.remove());
      },
    };
  });
})();

;
/* src/components/select/select.js */
/* DomSprig-UI · Select
 * 增强 <select data-nv-select>：原生 select 保留（视觉隐藏）并双向同步，表单提交与 input/change 事件照常。
 * 单选 / 多选（multiple）、占位、说明（option[data-desc]）、图标（option[data-icon]）、分组（optgroup）、
 * 禁用项、搜索（data-search）、清除（data-clearable）、尺寸（data-size）、错误（aria-invalid）、禁用。
 * 程序化改值后调用 Nova.select.refresh(el)；增删 option、改 disabled 会自动同步。
 */
(() => {
  const { Nova } = window;
  const { h } = Nova;

  const DEFAULTS = {
    placeholder: '',
    search: false,
    clearable: false,
    size: '',
    maxTags: 0,
    placement: 'bottom-start',
    emptyText: '无匹配项',
    noOptionsText: '暂无选项',
    searchPlaceholder: '搜索…',
    clearText: '清除',
    removeText: '移除',
  };
  const FALLBACK_PLACEHOLDER = '请选择';
  const labelOf = (o) => (o.label || o.textContent || '').trim();
  const isPlaceholder = (o) => o.value === '';

  Nova.define('select', 'select[data-nv-select]', (sel) => {
    const id = Nova.uid('nv-select');
    const listId = `${id}-list`;
    let opt = Nova.opts(sel, DEFAULTS);
    let multiple = sel.multiple;

    /* —— 触发器 —— */
    const valueBox = h('span', { class: 'nv-select-value', id: `${id}-value` });
    const clearBtn = h('span', { class: 'nv-control-btn nv-select-clear', 'aria-hidden': 'true', html: Nova.icon('x', { size: 14 }), hidden: true });
    const arrow = h('span', { class: 'nv-select-arrow', 'aria-hidden': 'true', html: Nova.icon('chevron-down') });
    const trigger = h('button', {
      type: 'button',
      id: `${id}-trigger`,
      class: 'nv-control nv-select-trigger',
      role: 'combobox',
      'aria-haspopup': 'listbox',
      'aria-expanded': 'false',
      'aria-controls': listId,
    }, valueBox, clearBtn, arrow);

    // 可访问名称 = 标签 + 当前值（aria-labelledby 引用自身时取自身的 aria-label）
    const labels = [...(sel.labels || [])];
    labels.forEach((l) => { if (!l.id) l.id = Nova.uid('nv-label'); });
    const ownLabel = sel.getAttribute('aria-label');
    if (ownLabel) trigger.setAttribute('aria-label', ownLabel);
    const nameIds = labels.length ? labels.map((l) => l.id) : ownLabel ? [trigger.id] : [];
    trigger.setAttribute('aria-labelledby', [...nameIds, valueBox.id].join(' '));
    if (sel.getAttribute('aria-describedby')) trigger.setAttribute('aria-describedby', sel.getAttribute('aria-describedby'));

    const prevTabIndex = sel.getAttribute('tabindex');
    sel.after(trigger);
    sel.classList.add('nv-select-native');
    sel.setAttribute('tabindex', '-1');
    sel.setAttribute('aria-hidden', 'true');

    /* —— 面板状态 —— */
    let floating = null;
    let floatOpts = null;
    let panel = null;
    let list = null;
    let searchInput = null;
    let empty = null;
    let itemMap = new Map(); // 选项元素 → <option>
    let suppressClick = false;

    const activeTargets = () => [trigger, searchInput].filter(Boolean);
    const nav = Nova.roving(() => (list ? list.querySelectorAll('[role="option"]') : []), {
      onChange(el) {
        for (const t of activeTargets()) {
          if (el) t.setAttribute('aria-activedescendant', el.id);
          else t.removeAttribute('aria-activedescendant');
        }
      },
    });

    const chosen = () => [...sel.options].filter((o) => o.selected && !isPlaceholder(o));
    const hasValue = () => chosen().length > 0;

    /* —— 触发器渲染 —— */
    function placeholderText() {
      const ph = [...sel.options].find(isPlaceholder);
      return opt.placeholder || (ph && labelOf(ph)) || FALLBACK_PLACEHOLDER;
    }
    function renderValue() {
      const list = chosen();
      const parts = [];
      if (!list.length) {
        parts.push(h('span', { class: 'nv-select-placeholder' }, placeholderText()));
      } else if (!multiple) {
        const o = list[0];
        const icon = o.dataset.icon && Nova.icon(o.dataset.icon);
        if (icon) parts.push(h('span', { class: 'nv-select-icon', html: icon }));
        parts.push(h('span', { class: 'nv-select-label', title: labelOf(o) }, labelOf(o)));
      } else {
        const max = opt.maxTags > 0 ? opt.maxTags : Infinity;
        list.slice(0, max).forEach((o) => {
          const locked = o.disabled || (o.parentElement && o.parentElement.disabled);
          parts.push(h('span', { class: 'nv-select-tag', title: labelOf(o) },
            h('span', { class: 'nv-select-tag-text' }, labelOf(o)),
            !locked && !trigger.disabled && h('span', {
              class: 'nv-select-tag-remove',
              'aria-hidden': 'true',
              title: `${opt.removeText} ${labelOf(o)}`,
              'data-index': o.index,
              html: Nova.icon('x', { size: 12, stroke: 2.5 }),
            })));
        });
        if (list.length > max) parts.push(h('span', { class: 'nv-select-tag', 'data-more': '' }, `+${list.length - max}`));
      }
      valueBox.replaceChildren(...parts);
      trigger.toggleAttribute('data-multiple', multiple);
      trigger.toggleAttribute('data-has-value', list.length > 0);
      clearBtn.hidden = !(opt.clearable && list.length && !trigger.disabled);
      clearBtn.title = opt.clearText;
    }

    function sync() {
      opt = Nova.opts(sel, DEFAULTS);
      const wasMultiple = multiple;
      multiple = sel.multiple;
      trigger.disabled = sel.matches(':disabled');
      if (opt.size) trigger.dataset.size = opt.size;
      else delete trigger.dataset.size;
      if (sel.getAttribute('aria-invalid') === 'true') trigger.setAttribute('aria-invalid', 'true');
      else trigger.removeAttribute('aria-invalid');
      if (sel.required) trigger.setAttribute('aria-required', 'true');
      else trigger.removeAttribute('aria-required');
      renderValue();
      if (floating) {
        if (trigger.disabled || wasMultiple !== multiple) close();
        else rebuildList();
      }
    }

    /* —— 面板构建 —— */
    function makeItem(o, groupDisabled) {
      if (isPlaceholder(o) || o.hidden) return null;
      const label = labelOf(o);
      const disabled = o.disabled || groupDisabled;
      const icon = o.dataset.icon && Nova.icon(o.dataset.icon);
      const el = h('div', {
        class: 'nv-item nv-select-option',
        role: 'option',
        id: `${id}-opt-${o.index}`,
        'aria-selected': String(o.selected),
        'aria-disabled': disabled ? 'true' : null,
        'data-text': label,
      },
        multiple && h('span', { class: 'nv-select-checkbox', 'aria-hidden': 'true', html: Nova.icon('check', { size: 12, stroke: 3 }) }),
        icon && h('span', { class: 'nv-item-icon', html: icon }),
        h('span', { class: 'nv-item-label', title: label }, label),
        o.dataset.desc && h('span', { class: 'nv-item-desc' }, o.dataset.desc),
        !multiple && h('span', { class: 'nv-item-check', 'aria-hidden': 'true', html: Nova.icon('check') }));
      itemMap.set(el, o);
      return el;
    }
    function rebuildList() {
      const activeOption = nav.active && itemMap.get(nav.active);
      nav.reset();
      itemMap = new Map();
      const nodes = [];
      for (const child of sel.children) {
        if (child.tagName === 'OPTGROUP') {
          const gid = Nova.uid('nv-select-group');
          const items = [...child.children].filter((c) => c.tagName === 'OPTION').map((o) => makeItem(o, child.disabled)).filter(Boolean);
          if (!items.length) continue;
          nodes.push(h('div', { class: 'nv-select-group', role: 'group', 'aria-labelledby': gid },
            h('div', { class: 'nv-panel-label', id: gid, role: 'presentation' }, child.label), items));
        } else if (child.tagName === 'OPTION') {
          const el = makeItem(child, false);
          if (el) nodes.push(el);
        }
      }
      list.replaceChildren(...nodes);
      if (searchInput && searchInput.value) filter({ keepActive: true });
      else updateEmpty();
      const again = activeOption && [...itemMap].find(([, o]) => o === activeOption);
      if (again) nav.set(again[0], { scroll: false });
    }
    function updateEmpty() {
      const any = [...itemMap.keys()].some((el) => !el.hidden);
      empty.hidden = any;
      empty.textContent = itemMap.size ? opt.emptyText : opt.noOptionsText;
      list.hidden = !any;
    }
    function filter({ keepActive = false } = {}) {
      const q = searchInput.value.trim().toLowerCase();
      for (const [el, o] of itemMap) {
        const hay = `${labelOf(o)} ${o.dataset.desc || ''} ${o.value}`.toLowerCase();
        el.hidden = !!q && !hay.includes(q);
      }
      list.querySelectorAll('.nv-select-group').forEach((g) => {
        g.hidden = ![...g.querySelectorAll('[role="option"]')].some((x) => !x.hidden);
      });
      updateEmpty();
      if (!keepActive || !nav.active || nav.active.hidden) nav.first();
      floating && floating.update();
    }
    function build() {
      panel = h('div', { class: 'nv-panel nv-select-panel', 'data-size': opt.size || null });
      searchInput = null;
      if (opt.search) {
        searchInput = h('input', {
          type: 'text',
          class: 'nv-select-search-input',
          role: 'combobox',
          'aria-autocomplete': 'list',
          'aria-expanded': 'true',
          'aria-controls': listId,
          'aria-label': opt.searchPlaceholder,
          placeholder: opt.searchPlaceholder,
          autocomplete: 'off',
          spellcheck: 'false',
        });
        searchInput.addEventListener('input', () => filter());
        searchInput.addEventListener('keydown', (e) => onOpenKey(e, true));
        panel.append(h('div', { class: 'nv-select-search' },
          h('span', { class: 'nv-select-search-icon', 'aria-hidden': 'true', html: Nova.icon('search') }), searchInput));
      }
      list = h('div', {
        class: 'nv-select-list nv-scroll',
        role: 'listbox',
        id: listId,
        tabindex: '-1',
        'aria-labelledby': nameIds.length ? nameIds.join(' ') : null,
        'aria-multiselectable': multiple ? 'true' : null,
      });
      empty = h('div', { class: 'nv-panel-empty nv-select-empty' });
      panel.append(list, empty);
      rebuildList();
      // 保持焦点在触发器 / 搜索框，点击选项不抢焦点
      panel.addEventListener('mousedown', (e) => { if (e.target !== searchInput) e.preventDefault(); });
      list.addEventListener('pointermove', (e) => {
        const it = e.target.closest('[role="option"]');
        if (it && it !== nav.active && it.getAttribute('aria-disabled') !== 'true') nav.set(it, { scroll: false });
      });
      list.addEventListener('click', (e) => {
        const it = e.target.closest('[role="option"]');
        if (it) choose(it);
      });
    }

    /* —— 打开 / 关闭 —— */
    function open({ from = 'selected', char = '' } = {}) {
      if (floating || trigger.disabled) return;
      build();
      floatOpts = {
        placement: opt.placement,
        offset: 6,
        onDismiss: (reason) => close({ restoreFocus: reason === 'escape' }),
      };
      floating = Nova.floating(panel, trigger, floatOpts);
      // 记住首次展开的方向：搜索过滤导致高度变化时不来回跳
      floatOpts.placement = `${panel.dataset.side || 'bottom'}-${opt.placement.split('-')[1] || 'start'}`;
      trigger.setAttribute('aria-expanded', 'true');
      const items = nav.enabled();
      const current = items.find((x) => x.getAttribute('aria-selected') === 'true');
      if (from === 'last') nav.set(current || items[items.length - 1]);
      else nav.set(current || items[0]);
      if (searchInput) {
        searchInput.focus({ preventScroll: true });
        if (char) { searchInput.value = char; filter(); }
      } else if (char) nav.type(char);
      Nova.emit(sel, 'nv:open');
    }
    function close({ restoreFocus = false } = {}) {
      if (!floating) return;
      const focusInside = panel && panel.contains(document.activeElement);
      nav.reset();
      floating.close();
      floating = null;
      trigger.setAttribute('aria-expanded', 'false');
      if (restoreFocus || focusInside) trigger.focus({ preventScroll: true });
      Nova.emit(sel, 'nv:close');
    }
    const toggle = () => (floating ? close() : open());

    /* —— 取值 —— */
    function emitChange() {
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function paintItems() {
      for (const [el, o] of itemMap) el.setAttribute('aria-selected', String(o.selected));
    }
    function choose(item) {
      const o = itemMap.get(item);
      if (!o || item.getAttribute('aria-disabled') === 'true') return;
      if (multiple) {
        o.selected = !o.selected;
        paintItems();
        renderValue();
        emitChange();
        return;
      }
      const changed = !o.selected;
      o.selected = true;
      renderValue();
      close({ restoreFocus: true });
      if (changed) emitChange();
    }
    function clear() {
      if (!hasValue()) return;
      const ph = [...sel.options].find(isPlaceholder);
      if (multiple) chosen().filter((o) => !o.disabled).forEach((o) => { o.selected = false; });
      else if (ph) ph.selected = true;
      else sel.selectedIndex = -1;
      paintItems();
      renderValue();
      emitChange();
    }
    function removeOption(o) {
      if (!o || o.disabled || !o.selected) return;
      o.selected = false;
      paintItems();
      renderValue();
      emitChange();
    }

    /* —— 键盘 —— */
    function onOpenKey(e, inSearch) {
      if (e.isComposing) return;
      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          if (nav.active) choose(nav.active);
          else if (!multiple) close({ restoreFocus: true });
          return;
        case ' ':
          if (inSearch) return;
          e.preventDefault();
          suppressClick = true;
          if (nav.active) choose(nav.active);
          return;
        case 'Tab':
          // 搜索框挂在 body 末尾：先把焦点放回触发器，浏览器再从触发器处继续 Tab
          if (inSearch) trigger.focus({ preventScroll: true });
          close();
          return;
        case 'ArrowUp':
          if (e.altKey) { e.preventDefault(); close({ restoreFocus: true }); return; }
          break;
        case 'Home':
        case 'End':
          if (inSearch) return;
          break;
        default:
      }
      if (inSearch) {
        if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp'].includes(e.key)) nav.key(e);
      } else if (nav.key(e) && e.key.length === 1) e.preventDefault();
    }
    trigger.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (floating) { onOpenKey(e, false); return; }
      const k = e.key;
      if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); open({ from: k === 'ArrowUp' ? 'last' : 'selected' }); }
      else if (k === 'Enter' || k === ' ') { e.preventDefault(); suppressClick = k === ' '; open(); }
      else if (k === 'Backspace' || k === 'Delete') {
        if (multiple) { e.preventDefault(); removeOption(chosen().filter((o) => !o.disabled).pop()); }
        else if (opt.clearable) { e.preventDefault(); clear(); }
      } else if (k.length === 1 && k !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        open({ char: k });
      }
    });
    // 空格在 keyup 时才触发 button 的 click：已在 keydown 处理过，这里拦掉
    trigger.addEventListener('keyup', (e) => {
      if (e.key === ' ') { e.preventDefault(); setTimeout(() => { suppressClick = false; }); }
    });
    trigger.addEventListener('click', (e) => {
      if (suppressClick) { suppressClick = false; return; }
      const rm = e.target.closest('.nv-select-tag-remove');
      if (rm) { removeOption(sel.options[Number(rm.dataset.index)]); return; }
      if (e.target.closest('.nv-select-clear')) { clear(); return; }
      toggle();
    });

    /* —— 原生 select 联动 —— */
    const onNativeFocus = () => trigger.focus();
    const onNativeChange = () => { renderValue(); if (floating) paintItems(); };
    const onReset = () => setTimeout(sync);
    sel.addEventListener('focus', onNativeFocus);
    sel.addEventListener('change', onNativeChange);
    const form = sel.form;
    form && form.addEventListener('reset', onReset);
    const mo = new MutationObserver(() => sync());
    mo.observe(sel, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['disabled', 'aria-invalid', 'multiple', 'required', 'label', 'hidden', 'data-size', 'data-placeholder', 'data-clearable', 'data-search', 'data-max-tags', 'data-desc', 'data-icon'],
    });

    sync();

    return {
      open: () => open(),
      close: () => close(),
      toggle,
      refresh: sync,
      clear,
      get value() { return multiple ? chosen().map((o) => o.value) : sel.value; },
      get trigger() { return trigger; },
      get panel() { return floating ? panel : null; },
      destroy() {
        close();
        mo.disconnect();
        sel.removeEventListener('focus', onNativeFocus);
        sel.removeEventListener('change', onNativeChange);
        form && form.removeEventListener('reset', onReset);
        trigger.remove();
        sel.classList.remove('nv-select-native');
        sel.removeAttribute('aria-hidden');
        if (prevTabIndex == null) sel.removeAttribute('tabindex');
        else sel.setAttribute('tabindex', prevTabIndex);
      },
    };
  });

  const inst = (el) => Nova.get(el, 'select');
  Nova.select = {
    /** 程序化修改 select 的值 / 选项后调用，同步触发器与面板 */
    refresh: (el) => inst(el) && inst(el).refresh(),
    open: (el) => inst(el) && inst(el).open(),
    close: (el) => inst(el) && inst(el).close(),
  };
})();

;
/* src/components/combobox/combobox.js */
/* DomSprig-UI · Combobox 自动补全
 * <input class="nv-combobox" list="cities" aria-label="城市">  +  <datalist id="cities"><option value="北京">首都</option></datalist>
 * 增强后 input 包进 .nv-control.nv-combobox-box，浏览器原生的 datalist 下拉换成 .nv-panel 建议面板。
 * 按 option 的 value 做不区分大小写的包含匹配，匹配段加粗；option 的文字或 label 作为右侧说明，data-icon 显示图标。
 * datalist 内容变化会自动刷新（适合边输入边请求远程建议）。
 * data-clearable   有值时显示清除按钮
 * data-empty       无匹配时的提示，默认「无匹配项」；"none" 表示不提示，直接收起
 * data-min-length  至少输入几个字符才弹出，默认 0
 * data-size        sm | md | lg
 * 事件：选中或清除时派发原生 input / change；选中时派发 nv:select { value, label }
 * 实例：Nova.get(input, 'combobox') → { open(), close(), refresh(), destroy() }
 */
(() => {
  const { h } = Nova;

  // 匹配段包进 <mark>，其余保持纯文本节点，不拼 HTML
  const highlight = (text, q) => {
    const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
    if (i < 0) return [text];
    return [text.slice(0, i), h('mark', { class: 'nv-combobox-mark' }, text.slice(i, i + q.length)), text.slice(i + q.length)];
  };

  Nova.define('combobox', 'input.nv-combobox', (input) => {
    const o = Nova.opts(input, { clearable: false, empty: '无匹配项', minLength: 0, size: '' });
    const listAttr = input.getAttribute('list');
    const autoAttr = input.getAttribute('autocomplete');
    const listId = Nova.uid('nv-combobox-list');
    const datalist = () => (listAttr ? document.getElementById(listAttr) : null);

    // 去掉 list 属性，避免原生建议和自定义面板同时出现
    input.removeAttribute('list');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', listId);

    const box = h('span', { class: 'nv-control nv-combobox-box', 'data-size': o.size || null });
    const clearBtn = o.clearable
      ? h('button', { type: 'button', class: 'nv-combobox-clear', tabindex: '-1', 'aria-label': '清除', hidden: true, html: Nova.icon('x') })
      : null;
    const arrow = listAttr ? h('span', { class: 'nv-combobox-arrow', 'aria-hidden': 'true', html: Nova.icon('chevron-down') }) : null;
    input.before(box);
    box.append(input);
    if (clearBtn) box.append(clearBtn);
    if (arrow) box.append(arrow);

    let panel = null;
    let list = null;
    let empty = null;
    let floating = null;
    let floatOpts = null;
    let silent = false; // 自己派发 input 事件时不重新过滤
    let typed = false; // 用户输入过、还没选中或主动关闭；datalist 异步填充后据此自动弹出

    const nav = Nova.roving(() => (list ? list.querySelectorAll('[role="option"]') : []), {
      typeahead: false, // 字符键交给输入框，不做首字母跳转
      onChange: (el) => {
        if (el) input.setAttribute('aria-activedescendant', el.id);
        else input.removeAttribute('aria-activedescendant');
      },
    });

    const usable = () => !input.disabled && !input.readOnly;
    const longEnough = () => [...input.value].length >= o.minLength;
    const options = () => {
      const dl = datalist();
      return dl ? [...dl.querySelectorAll('option')].filter((op) => op.value) : [];
    };
    const syncClear = () => { if (clearBtn) clearBtn.hidden = !input.value || !usable(); };
    const fire = () => {
      silent = true;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      silent = false;
    };

    /* —— 面板 —— */
    function build() {
      list = h('div', {
        class: 'nv-combobox-list nv-scroll',
        role: 'listbox',
        id: listId,
        'aria-label': input.getAttribute('aria-label') || null,
      });
      empty = h('div', { class: 'nv-combobox-empty', hidden: true });
      panel = h('div', { class: 'nv-panel nv-combobox-panel', 'data-size': o.size || null }, list, empty);
      // 点面板不让输入框失焦
      panel.addEventListener('mousedown', (e) => e.preventDefault());
      list.addEventListener('pointermove', (e) => {
        const it = e.target.closest('[role="option"]');
        if (it && it !== nav.active && it.getAttribute('aria-disabled') !== 'true') nav.set(it, { scroll: false });
      });
      list.addEventListener('click', (e) => {
        const it = e.target.closest('[role="option"]');
        if (it) choose(it);
      });
    }

    // 按当前输入重建选项；返回 false 表示没有可显示的内容
    function render() {
      const q = input.value.trim();
      const ql = q.toLowerCase();
      const hits = options().filter((op) => !ql || op.value.toLowerCase().includes(ql));
      const prev = nav.active ? nav.active.dataset.value : null;
      nav.reset();
      list.replaceChildren(...hits.map((op, i) => {
        const value = op.value;
        const label = op.label.trim();
        const desc = label && label !== value ? label : '';
        const icon = op.dataset.icon ? Nova.icon(op.dataset.icon) : '';
        return h('div', {
          class: 'nv-item nv-combobox-option',
          role: 'option',
          id: `${listId}-${i}`,
          'aria-selected': String(value === input.value),
          'aria-disabled': op.disabled ? 'true' : null,
          'data-value': value,
        },
        icon ? h('span', { class: 'nv-item-icon', 'aria-hidden': 'true', html: icon }) : null,
        h('span', { class: 'nv-item-label' }, highlight(value, q)),
        desc ? h('span', { class: 'nv-item-desc' }, desc) : null,
        h('span', { class: 'nv-item-check', 'aria-hidden': 'true', html: Nova.icon('check') }));
      }));
      list.hidden = !hits.length;
      empty.hidden = hits.length > 0 || o.empty === 'none';
      empty.textContent = o.empty;
      if (prev != null && floating) {
        const again = [...list.children].find((x) => x.dataset.value === prev);
        if (again) nav.set(again);
      }
      return hits.length > 0 || o.empty !== 'none';
    }

    function open() {
      if (floating || !usable() || !datalist() || !longEnough()) return false;
      build();
      if (!render()) { panel = list = empty = null; return false; }
      floatOpts = { placement: 'bottom-start', offset: 6, onDismiss: () => { typed = false; close(); } };
      floating = Nova.floating(panel, box, floatOpts);
      // 记住首次展开的方向，过滤导致高度变化时不上下跳
      floatOpts.placement = `${panel.dataset.side || 'bottom'}-start`;
      input.setAttribute('aria-expanded', 'true');
      box.setAttribute('data-open', '');
      return true;
    }
    function close() {
      if (!floating) return;
      nav.reset();
      floating.close();
      floating = null;
      panel = list = empty = null;
      input.setAttribute('aria-expanded', 'false');
      box.removeAttribute('data-open');
    }
    function update() {
      if (!floating) return open();
      if (!longEnough() || !render()) return close();
      floating.update();
      return true;
    }

    function choose(item) {
      if (!item || item.getAttribute('aria-disabled') === 'true') return;
      const value = item.dataset.value;
      const label = item.querySelector('.nv-item-desc')?.textContent || '';
      typed = false;
      close();
      if (input.value !== value) { input.value = value; fire(); }
      syncClear();
      input.focus({ preventScroll: true });
      Nova.emit(input, 'nv:select', { value, label });
    }

    /* —— 事件 —— */
    const onInput = (e) => {
      syncClear();
      if (silent || e.isComposing) return;
      typed = true;
      update();
    };
    const onCompositionEnd = () => { typed = true; update(); };
    const onKey = (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      const k = e.key;
      if (k === 'ArrowDown' || k === 'ArrowUp') {
        e.preventDefault();
        if (floating) { nav.key(e); return; }
        if (!open()) return;
        const items = nav.enabled();
        const cur = items.find((x) => x.getAttribute('aria-selected') === 'true');
        nav.set(cur || (k === 'ArrowDown' ? items[0] : items[items.length - 1]));
        return;
      }
      if (!floating) return;
      // PageUp / PageDown 总是翻列表；Home / End 只在已经高亮某项时跳列表，否则留给输入框移动光标
      if (k === 'PageUp' || k === 'PageDown' || ((k === 'Home' || k === 'End') && nav.active)) { nav.key(e); return; }
      if (k === 'Enter') {
        if (nav.active) { e.preventDefault(); choose(nav.active); }
        else close();
        return;
      }
      if (k === 'Tab') close();
    };
    const onClick = () => { if (!floating) open(); };
    const onFocus = () => syncClear();
    const onBlur = () => { typed = false; close(); };
    // 点外框空白处或箭头：聚焦输入框并切换面板
    const onBoxDown = (e) => {
      if (e.button !== 0 || e.target === input || (clearBtn && clearBtn.contains(e.target))) return;
      e.preventDefault();
      input.focus();
      if (floating) close();
      else open();
    };
    const onClearDown = (e) => e.preventDefault();
    const onClear = () => {
      input.value = '';
      fire();
      syncClear();
      input.focus();
      if (floating) update();
    };

    input.addEventListener('input', onInput);
    input.addEventListener('compositionend', onCompositionEnd);
    input.addEventListener('keydown', onKey);
    input.addEventListener('click', onClick);
    input.addEventListener('focus', onFocus);
    input.addEventListener('blur', onBlur);
    box.addEventListener('pointerdown', onBoxDown);
    clearBtn?.addEventListener('mousedown', onClearDown);
    clearBtn?.addEventListener('click', onClear);

    const form = input.form;
    const onReset = () => setTimeout(syncClear);
    form?.addEventListener('reset', onReset);

    // datalist 被脚本改写时刷新；面板未打开但用户刚输入过时自动弹出
    const mo = new MutationObserver(() => {
      if (floating) update();
      else if (typed && document.activeElement === input) open();
    });
    const observe = () => {
      mo.disconnect();
      const dl = datalist();
      if (dl) mo.observe(dl, { childList: true, subtree: true, attributes: true, characterData: true });
    };
    observe();
    syncClear();

    return {
      open,
      close,
      refresh() { observe(); syncClear(); if (floating) update(); },
      destroy() {
        close();
        mo.disconnect();
        input.removeEventListener('input', onInput);
        input.removeEventListener('compositionend', onCompositionEnd);
        input.removeEventListener('keydown', onKey);
        input.removeEventListener('click', onClick);
        input.removeEventListener('focus', onFocus);
        input.removeEventListener('blur', onBlur);
        box.removeEventListener('pointerdown', onBoxDown);
        form?.removeEventListener('reset', onReset);
        box.before(input);
        box.remove();
        if (listAttr) input.setAttribute('list', listAttr);
        if (autoAttr == null) input.removeAttribute('autocomplete');
        else input.setAttribute('autocomplete', autoAttr);
        ['role', 'aria-autocomplete', 'aria-expanded', 'aria-controls', 'aria-activedescendant'].forEach((a) => input.removeAttribute(a));
      },
    };
  });
})();

;
/* src/components/datepicker/datepicker.js */
/* DomSprig-UI · DatePicker
 * <input type="date" data-nv-date>             日期        值 YYYY-MM-DD
 * <input type="datetime-local" data-nv-date>   日期时间    值 YYYY-MM-DDTHH:mm（本地时间）
 * <input data-nv-date-range name="period">     日期范围    值 YYYY-MM-DD/YYYY-MM-DD（ISO 8601 区间）
 * 原生 input 保留（视觉隐藏），值与 input/change 事件照常；读取 min / max（按天限制）。
 * 命令式：Nova.datepicker(el, { presets, disabledDate, ... })  Nova.datepicker.refresh(el)
 */
(() => {
  const { Nova } = window;
  const { h } = Nova;

  /* ————————— 日期工具（全部按本地时间、零点） ————————— */
  const pad = (n) => String(n).padStart(2, '0');
  const mk = (y, m, d) => { const t = new Date(2000, 0, 1); t.setFullYear(y, m, d); return t; };
  const key = (d) => (d ? d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate() : 0);
  const same = (a, b) => !!a && !!b && key(a) === key(b);
  const addDays = (d, n) => mk(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const monthStart = (d) => mk(d.getFullYear(), d.getMonth(), 1);
  const monthEnd = (d) => mk(d.getFullYear(), d.getMonth() + 1, 0);
  const addMonths = (d, n) => {
    const t = mk(d.getFullYear(), d.getMonth() + n, 1);
    return mk(t.getFullYear(), t.getMonth(), Math.min(d.getDate(), monthEnd(t).getDate()));
  };
  const today = () => { const n = new Date(); return mk(n.getFullYear(), n.getMonth(), n.getDate()); };
  const iso = (d) => `${String(d.getFullYear()).padStart(4, '0')}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const shown = (d) => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  const daysBetween = (a, b) => Math.round((mk(b.getFullYear(), b.getMonth(), b.getDate()) - mk(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5);
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

  /** 解析 ISO：YYYY-MM-DD 或 YYYY-MM-DDTHH:mm[:ss] */
  function parseISO(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(s || '').trim());
    if (!m) return null;
    const date = mk(+m[1], +m[2] - 1, +m[3]);
    if (date.getMonth() !== +m[2] - 1) return null;
    return { date, h: +(m[4] || 0), m: +(m[5] || 0) };
  }
  const toDate = (v) => (v instanceof Date ? mk(v.getFullYear(), v.getMonth(), v.getDate()) : (parseISO(v) || {}).date || null);

  /* 手动输入：2026-10-24 / 2026/10/24 / 2026.10.24 / 2026年10月24日 / 20261024，可带 13:52 */
  const DATE_SRC = '(\\d{4})\\s*[-/.年]\\s*(\\d{1,2})\\s*[-/.月]\\s*(\\d{1,2})\\s*日?|(\\d{4})(\\d{2})(\\d{2})';
  const SINGLE_RE = new RegExp(`^(?:${DATE_SRC})(?:\\s*[T\\s]\\s*(\\d{1,2})\\s*[:：时.]\\s*(\\d{1,2})\\s*分?)?$`);
  const ANY_RE = new RegExp(DATE_SRC, 'g');
  function dateFrom(m, i) {
    const y = +(m[i] || m[i + 3]);
    const mo = +(m[i + 1] || m[i + 4]);
    const d = +(m[i + 2] || m[i + 5]);
    if (mo < 1 || mo > 12 || d < 1) return null;
    const t = mk(y, mo - 1, d);
    return t.getMonth() === mo - 1 ? t : null;
  }

  /* ————————— 范围快捷预设 ————————— */
  const PRESETS = {
    today: { label: '今天', value: (t) => [t, t] },
    '7d': { label: '最近 7 天', value: (t) => [addDays(t, -6), t] },
    '30d': { label: '最近 30 天', value: (t) => [addDays(t, -29), t] },
    month: { label: '本月', value: (t) => [monthStart(t), monthEnd(t)] },
    lastMonth: { label: '上月', value: (t) => { const p = addMonths(monthStart(t), -1); return [p, monthEnd(p)]; } },
  };
  const PRESET_KEYS = Object.keys(PRESETS);

  const DEFAULTS = {
    placeholder: '',
    minuteStep: 1,
    weekStart: 1,
    clearable: false,
    size: '',
    placement: 'bottom-start',
    presets: '',
    months: 0,
    separator: ' – ',
    label: '选择日期',
    clearText: '清除',
    todayText: '今天',
    nowText: '此刻',
    okText: '确定',
    openText: '打开日历',
    hourText: '时',
    minuteText: '分',
    invalidText: '日期无效，已还原',
    rangeHint: '请选择结束日期',
    daysText: '共 {n} 天',
    prevMonthText: '上个月',
    nextMonthText: '下个月',
    prevYearText: '上一年',
    nextYearText: '下一年',
    prevDecadeText: '上一个十年',
    nextDecadeText: '下一个十年',
  };
  const PLACEHOLDER = { date: '年/月/日', datetime: '年/月/日 --:--', range: '开始日期 – 结束日期' };
  const jsOptions = new WeakMap(); // Nova.datepicker(el, opts) 先于初始化调用时暂存

  Nova.define('datepicker', 'input[data-nv-date], input[data-nv-date-range]', (nat) => {
    const range = nat.hasAttribute('data-nv-date-range');
    const time = !range && nat.type === 'datetime-local';
    const kind = range ? 'range' : time ? 'datetime' : 'date';
    const id = Nova.uid('nv-date');
    let opt = {};
    let min = null;
    let max = null;
    let presets = [];

    function readOpts() {
      opt = { ...Nova.opts(nat, DEFAULTS), ...(jsOptions.get(nat) || {}) };
      opt.minuteStep = Nova.clamp(Math.floor(opt.minuteStep) || 1, 1, 30);
      opt.weekStart = Number(opt.weekStart) === 0 ? 0 : 1;
      min = toDate(nat.getAttribute('min'));
      max = toDate(nat.getAttribute('max'));
      presets = [];
      if (range && opt.presets !== 'false' && opt.presets !== false) {
        const src = Array.isArray(opt.presets) ? opt.presets
          : opt.presets ? String(opt.presets).split(/[\s,]+/).filter(Boolean) : PRESET_KEYS;
        for (const p of src) {
          const def = typeof p === 'string' ? PRESETS[p] : p;
          if (def && def.label && def.value) presets.push(def);
        }
      }
    }
    readOpts();
    const isDisabled = (d) => (min && key(d) < key(min)) || (max && key(d) > key(max)) || !!(opt.disabledDate && opt.disabledDate(d));
    const clampDay = (d) => (min && key(d) < key(min) ? min : max && key(d) > key(max) ? max : d);

    /* —— 可见控件 —— */
    const input = h('input', {
      type: 'text',
      id: `${id}-input`,
      class: 'nv-date-input',
      role: 'combobox',
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
      'aria-controls': `${id}-panel`,
      autocomplete: 'off',
      spellcheck: 'false',
    });
    const clearBtn = h('button', { type: 'button', class: 'nv-control-btn nv-date-clear', tabindex: '-1', html: Nova.icon('x', { size: 14 }), hidden: true });
    const toggleBtn = h('button', { type: 'button', class: 'nv-control-btn nv-date-toggle', tabindex: '-1', html: Nova.icon('calendar') });
    const live = h('span', { class: 'nv-sr-only', 'aria-live': 'polite' });
    const control = h('div', { class: 'nv-control nv-date', 'data-kind': kind }, input, clearBtn, toggleBtn, live);

    const labels = [...(nat.labels || [])];
    labels.forEach((l) => { if (!l.id) l.id = Nova.uid('nv-label'); });
    if (labels.length) input.setAttribute('aria-labelledby', labels.map((l) => l.id).join(' '));
    else if (nat.getAttribute('aria-label')) input.setAttribute('aria-label', nat.getAttribute('aria-label'));
    if (nat.getAttribute('aria-describedby')) input.setAttribute('aria-describedby', nat.getAttribute('aria-describedby'));

    const prevTabIndex = nat.getAttribute('tabindex');
    nat.after(control);
    nat.classList.add('nv-date-native');
    nat.setAttribute('tabindex', '-1');
    nat.setAttribute('aria-hidden', 'true');

    /* —— 值：single { date, h, m } ；range { start, end } —— */
    let value = null;
    function readValue() {
      if (range) {
        const [a, b] = String(nat.value || '').split('/');
        const s = toDate(a);
        const e = toDate(b);
        value = s && e ? (key(s) <= key(e) ? { start: s, end: e } : { start: e, end: s }) : null;
      } else {
        const p = parseISO(nat.value);
        value = p ? { date: p.date, h: time ? p.h : 0, m: time ? p.m : 0 } : null;
      }
    }
    const serialize = (v) => {
      if (!v) return '';
      if (range) return `${iso(v.start)}/${iso(v.end)}`;
      return time ? `${iso(v.date)}T${pad(v.h)}:${pad(v.m)}` : iso(v.date);
    };
    const display = (v) => {
      if (!v) return '';
      if (range) return `${shown(v.start)}${opt.separator}${shown(v.end)}`;
      return time ? `${shown(v.date)} ${pad(v.h)}:${pad(v.m)}` : shown(v.date);
    };

    let emitting = false;
    function commit(v) {
      const before = nat.value;
      value = v;
      nat.value = serialize(v);
      input.value = display(v);
      paintControl();
      if (panel) { paint(); paintTime(); paintFoot(); }
      if (nat.value !== before) {
        emitting = true;
        nat.dispatchEvent(new Event('input', { bubbles: true }));
        nat.dispatchEvent(new Event('change', { bubbles: true }));
        emitting = false;
      }
    }

    /** 解析手动输入；返回 { ok, value }，空串 → null 值 */
    function parseText(text) {
      const t = text.trim();
      if (!t) return { ok: true, value: null };
      if (range) {
        const found = [...t.matchAll(ANY_RE)];
        if (found.length !== 2) return { ok: false };
        const rest = t.replace(ANY_RE, '');
        if (!/^[\s~～至到\-–—_|/]*$|^\s*to\s*$/i.test(rest)) return { ok: false };
        let s = dateFrom(found[0], 1);
        let e = dateFrom(found[1], 1);
        if (!s || !e) return { ok: false };
        if (key(s) > key(e)) [s, e] = [e, s];
        if (isDisabled(s) || isDisabled(e)) return { ok: false };
        return { ok: true, value: { start: s, end: e } };
      }
      const m = SINGLE_RE.exec(t);
      if (!m) return { ok: false };
      const date = dateFrom(m, 1);
      if (!date || isDisabled(date)) return { ok: false };
      let hh = value ? value.h : 0;
      let mm = value ? value.m : 0;
      if (m[7] != null) { hh = +m[7]; mm = +m[8]; }
      if (hh > 23 || mm > 59) return { ok: false };
      return { ok: true, value: { date, h: time ? hh : 0, m: time ? mm : 0 } };
    }

    let flashTimer = 0;
    function flashInvalid(text) {
      clearTimeout(flashTimer);
      control.setAttribute('data-flash', '');
      live.textContent = opt.invalidText;
      Nova.emit(nat, 'nv:invalid', { text });
      flashTimer = setTimeout(() => { control.removeAttribute('data-flash'); live.textContent = ''; }, 1400);
    }
    /** 把输入框文字应用为值；非法时还原并提示。返回是否成功 */
    function applyText() {
      if (input.value === display(value)) return true;
      const res = parseText(input.value);
      if (res.ok) {
        commit(res.value);
        if (panel && res.value) jumpTo(range ? res.value.start : res.value.date);
        return true;
      }
      const typed = input.value;
      input.value = display(value);
      flashInvalid(typed);
      return false;
    }

    function paintControl() {
      input.disabled = nat.disabled;
      input.readOnly = nat.readOnly;
      input.placeholder = opt.placeholder || PLACEHOLDER[kind];
      if (nat.getAttribute('aria-invalid') === 'true') input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
      if (nat.required) input.setAttribute('aria-required', 'true');
      else input.removeAttribute('aria-required');
      if (opt.size) control.dataset.size = opt.size;
      else delete control.dataset.size;
      clearBtn.hidden = !(opt.clearable && value && !nat.disabled && !nat.readOnly);
      clearBtn.setAttribute('aria-label', opt.clearText);
      toggleBtn.setAttribute('aria-label', opt.openText);
      toggleBtn.disabled = nat.disabled;
    }

    /* —— 面板状态 —— */
    let panel = null;
    let floating = null;
    let cals = null;
    let timeBox = null;
    let foot = null;
    let status = null;
    let presetBox = null;
    let view = monthStart(today()); // 左侧（第一个）日历的月份
    let mode = 'day'; // day | month | year
    let modeCal = 0; // 由第几个日历进入月份/年份面板
    let modeYear = 0;
    let months = 1;
    let cursor = null; // 键盘游标
    let cursorOn = false;
    let anchor = null; // 范围：已选的第一个端点
    let hover = null; // 范围：预览的另一个端点

    const baseDate = () => {
      if (range) return value ? value.start : clampDay(today());
      return value ? value.date : clampDay(today());
    };
    const visibleStart = () => view;
    const visibleEnd = () => monthEnd(addMonths(view, months - 1));
    function jumpTo(d) {
      if (key(d) < key(visibleStart()) || key(d) > key(visibleEnd())) {
        view = monthStart(months > 1 && key(d) > key(visibleEnd()) ? addMonths(d, -(months - 1)) : d);
      }
      if (mode !== 'day') setMode('day');
      else renderCals();
    }

    const navBtn = (dir, label, act) => h('button', {
      type: 'button', class: 'nv-date-nav', 'aria-label': label, 'data-act': act, tabindex: '-1',
      html: Nova.icon(dir < 0 ? 'chevron-left' : 'chevron-right'),
    });

    function dayCell(d, monthIndex, idx) {
      const outside = d.getMonth() !== monthIndex;
      if (outside && range && months > 1) return h('div', { role: 'gridcell', class: 'nv-date-cell', 'data-empty': '' });
      const t = today();
      const label = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${WEEK[d.getDay()]}${same(d, t) ? '，今天' : ''}`;
      const off = isDisabled(d);
      const cell = h('div', {
        role: 'gridcell',
        class: 'nv-date-cell',
        id: `${id}-c${idx}-${key(d)}`,
        'data-outside': outside ? '' : null,
        'aria-disabled': off ? 'true' : null,
      }, h('button', {
        type: 'button',
        class: 'nv-date-day',
        tabindex: '-1',
        'aria-label': label,
        'data-today': same(d, t) ? '' : null,
        disabled: off,
      }, String(d.getDate())));
      cell._date = d;
      return cell;
    }

    function dayView(m, idx) {
      const first = mk(m.getFullYear(), m.getMonth(), 1);
      const lead = (first.getDay() - opt.weekStart + 7) % 7;
      const head = h('div', { class: 'nv-date-head' },
        idx === 0 ? navBtn(-1, opt.prevMonthText, 'prev') : h('span', { class: 'nv-date-nav-gap' }),
        h('div', { class: 'nv-date-title' },
          h('button', { type: 'button', class: 'nv-date-title-btn', 'data-act': 'year', 'data-cal': idx, tabindex: '-1' }, `${m.getFullYear()}年`),
          h('button', { type: 'button', class: 'nv-date-title-btn', 'data-act': 'month', 'data-cal': idx, tabindex: '-1' }, `${m.getMonth() + 1}月`)),
        idx === months - 1 ? navBtn(1, opt.nextMonthText, 'next') : h('span', { class: 'nv-date-nav-gap' }));
      const weekdays = h('div', { role: 'row', class: 'nv-date-week' },
        Array.from({ length: 7 }, (_, i) => {
          const wd = (i + opt.weekStart) % 7;
          return h('span', { role: 'columnheader', 'aria-label': `星期${WEEK[wd]}`, 'data-weekend': wd === 0 || wd === 6 ? '' : null }, WEEK[wd]);
        }));
      const rows = [];
      for (let r = 0; r < 6; r++) {
        rows.push(h('div', { role: 'row', class: 'nv-date-row' },
          Array.from({ length: 7 }, (_, c) => dayCell(mk(m.getFullYear(), m.getMonth(), 1 - lead + r * 7 + c), m.getMonth(), idx))));
      }
      return h('div', { class: 'nv-date-cal' }, head,
        h('div', { role: 'grid', class: 'nv-date-grid', 'aria-label': `${m.getFullYear()}年${m.getMonth() + 1}月` }, weekdays, rows));
    }

    function pickerView() {
      const year = mode === 'month';
      const sel = range ? (value && value.start) : value && value.date;
      const t = today();
      let title;
      let cells;
      if (year) {
        title = h('button', { type: 'button', class: 'nv-date-title-btn', 'data-act': 'year', tabindex: '-1' }, `${modeYear}年`);
        cells = Array.from({ length: 12 }, (_, i) => {
          const off = (min && key(monthEnd(mk(modeYear, i, 1))) < key(min)) || (max && key(mk(modeYear, i, 1)) > key(max));
          return h('button', {
            type: 'button', class: 'nv-date-pick', tabindex: '-1', 'data-month': i, disabled: !!off,
            'aria-pressed': String(!!sel && sel.getFullYear() === modeYear && sel.getMonth() === i),
            'data-today': t.getFullYear() === modeYear && t.getMonth() === i ? '' : null,
          }, `${i + 1}月`);
        });
      } else {
        const start = Math.floor(modeYear / 10) * 10;
        title = h('span', { class: 'nv-date-title-text' }, `${start} – ${start + 9}`);
        cells = Array.from({ length: 12 }, (_, i) => {
          const y = start - 1 + i;
          const off = (min && y < min.getFullYear()) || (max && y > max.getFullYear());
          return h('button', {
            type: 'button', class: 'nv-date-pick', tabindex: '-1', 'data-year': y, disabled: !!off,
            'data-outside': i === 0 || i === 11 ? '' : null,
            'aria-pressed': String(!!sel && sel.getFullYear() === y),
            'data-today': t.getFullYear() === y ? '' : null,
          }, String(y));
        });
      }
      const step = year ? 1 : 10;
      return h('div', { class: 'nv-date-cal nv-date-cal-wide' },
        h('div', { class: 'nv-date-head' },
          navBtn(-1, year ? opt.prevYearText : opt.prevDecadeText, `prev-${step}`),
          h('div', { class: 'nv-date-title' }, title),
          navBtn(1, year ? opt.nextYearText : opt.nextDecadeText, `next-${step}`)),
        h('div', { class: 'nv-date-picks', 'data-kind': mode }, cells));
    }

    function renderCals() {
      if (!cals) return;
      if (mode === 'day') {
        cals.replaceChildren(...Array.from({ length: months }, (_, i) => dayView(addMonths(view, i), i)));
        paint();
      } else {
        cals.replaceChildren(pickerView());
      }
      floating && floating.update();
    }

    function setMode(next, cal = 0) {
      if (next !== 'day' && mode === 'day' && cals) {
        // 锁定尺寸：切换到月份/年份面板时面板不跳动
        cals.style.minWidth = `${cals.offsetWidth}px`;
        cals.style.minHeight = `${cals.offsetHeight}px`;
      }
      if (next === 'day' && cals) { cals.style.minWidth = ''; cals.style.minHeight = ''; }
      if (mode === 'day' && next !== 'day') { modeCal = cal; modeYear = addMonths(view, cal).getFullYear(); }
      mode = next;
      renderCals();
    }

    /** 根据值 / 游标 / 预览刷新日期格状态（不重建 DOM） */
    function paint() {
      if (!cals || mode !== 'day') return;
      let s = null;
      let e = null;
      if (range) {
        if (anchor) {
          const o = hover || anchor;
          [s, e] = key(anchor) <= key(o) ? [anchor, o] : [o, anchor];
        } else if (value) ({ start: s, end: e } = value);
      }
      panel.toggleAttribute('data-pending', !!anchor);
      let activeId = null;
      for (const cell of cals.querySelectorAll('.nv-date-cell[id]')) {
        const d = cell._date;
        const k = key(d);
        let selected = false;
        if (range) {
          const isS = !!s && k === key(s);
          const isE = !!e && k === key(e);
          const inside = !!s && !!e && k > key(s) && k < key(e);
          cell.toggleAttribute('data-range-start', isS);
          cell.toggleAttribute('data-range-end', isE);
          cell.toggleAttribute('data-in-range', inside);
          selected = !anchor && (isS || isE || inside);
          if (anchor) selected = isS || isE;
        } else selected = !!value && k === key(value.date);
        cell.setAttribute('aria-selected', String(selected));
        const active = cursorOn && cursor && k === key(cursor) && !cell.hasAttribute('data-outside');
        cell.toggleAttribute('data-active', active);
        if (active) activeId = cell.id;
      }
      if (activeId) input.setAttribute('aria-activedescendant', activeId);
      else input.removeAttribute('aria-activedescendant');
    }

    /* —— 时间列 —— */
    function buildTime() {
      const col = (unit, list, label) => h('div', { class: 'nv-date-time-col' },
        h('div', { class: 'nv-date-time-head', 'aria-hidden': 'true' }, label),
        h('div', { class: 'nv-date-time-list nv-scroll', role: 'listbox', 'aria-label': label, 'data-unit': unit },
          list.map((n) => h('div', { role: 'option', class: 'nv-date-time-item', 'data-unit': unit, 'data-n': n, 'aria-selected': 'false' }, pad(n)))));
      const minutes = [];
      for (let i = 0; i < 60; i += opt.minuteStep) minutes.push(i);
      if (value && !minutes.includes(value.m)) { minutes.push(value.m); minutes.sort((a, b) => a - b); }
      timeBox.replaceChildren(
        col('h', Array.from({ length: 24 }, (_, i) => i), opt.hourText),
        col('m', minutes, opt.minuteText));
      paintTime();
    }
    function paintTime() {
      if (!timeBox) return;
      for (const it of timeBox.querySelectorAll('.nv-date-time-item')) {
        const on = !!value && value[it.dataset.unit] === Number(it.dataset.n);
        it.setAttribute('aria-selected', String(on));
      }
    }
    function centerTime(smooth) {
      if (!timeBox) return;
      for (const list of timeBox.querySelectorAll('.nv-date-time-list')) {
        const it = list.querySelector('[aria-selected="true"]');
        if (!it) continue;
        const top = it.offsetTop - list.clientHeight / 2 + it.offsetHeight / 2;
        list.scrollTo({ top, behavior: smooth && !Nova.reducedMotion() ? 'smooth' : 'auto' });
      }
    }
    function setTime(unit, n) {
      const base = value ? { ...value } : { date: clampDay(today()), h: 0, m: 0 };
      if (isDisabled(base.date)) return;
      base[unit] = n;
      commit(base);
      if (!range) jumpTo(base.date);
      centerTime(true);
    }

    function paintFoot() {
      if (!status) return;
      let text = '';
      if (anchor) text = opt.rangeHint;
      else if (value) text = opt.daysText.replace('{n}', daysBetween(value.start, value.end) + 1);
      status.textContent = text;
      if (presetBox) {
        for (const b of presetBox.children) {
          const r = presetRange(b._preset);
          b.setAttribute('aria-pressed', String(!!value && !!r && same(value.start, clampDay(r[0])) && same(value.end, clampDay(r[1]))));
        }
      }
    }

    /* —— 面板构建 —— */
    const footBtn = (act, text, variant) => h('button', {
      type: 'button', class: 'nv-btn nv-date-foot-btn', 'data-size': 'xs', 'data-variant': variant || null,
      'data-color': variant === 'ghost' ? 'neutral' : null, 'data-act': act, tabindex: '-1',
    }, text);
    function build() {
      panel = h('div', {
        class: 'nv-panel nv-date-panel',
        id: `${id}-panel`,
        role: 'dialog',
        'aria-label': opt.label,
        'data-kind': kind,
      });
      presetBox = null;
      if (range && presets.length) {
        presetBox = h('div', { class: 'nv-date-presets', role: 'group', 'aria-label': '快捷选择' },
          presets.map((p) => { const b = h('button', { type: 'button', class: 'nv-date-preset', tabindex: '-1', 'aria-pressed': 'false' }, p.label); b._preset = p; return b; }));
        panel.append(presetBox);
      }
      cals = h('div', { class: 'nv-date-cals', 'data-months': months });
      const body = h('div', { class: 'nv-date-body' }, cals);
      timeBox = null;
      if (time) {
        timeBox = h('div', { class: 'nv-date-time' });
        body.append(timeBox);
      }
      status = null;
      const left = range
        ? (status = h('span', { class: 'nv-date-status', 'aria-live': 'polite' }))
        : footBtn('clear', opt.clearText, 'ghost');
      const right = h('div', { class: 'nv-date-foot-actions' });
      if (range) right.append(footBtn('clear', opt.clearText, 'ghost'));
      else if (time) right.append(footBtn('today', opt.nowText, 'ghost'), footBtn('ok', opt.okText));
      else right.append(footBtn('today', opt.todayText, 'soft'));
      foot = h('div', { class: 'nv-date-foot' }, left, right);
      panel.append(h('div', { class: 'nv-date-main' }, body, foot));
      renderCals();
      if (time) buildTime();
      paintFoot();

      panel.addEventListener('mousedown', (e) => e.preventDefault()); // 焦点留在输入框
      panel.addEventListener('click', onPanelClick);
      panel.addEventListener('pointerover', (e) => {
        if (!range || !anchor) return;
        const cell = e.target.closest('.nv-date-cell[id]');
        if (cell && cell.getAttribute('aria-disabled') !== 'true' && !same(cell._date, hover)) { hover = cell._date; paint(); }
      });
      panel.addEventListener('pointerleave', () => { if (range && anchor && hover) { hover = null; paint(); } });
    }

    function onPanelClick(e) {
      const btn = e.target.closest('button, .nv-date-time-item');
      if (!btn || btn.disabled) return;
      const act = btn.dataset.act;
      if (btn.classList.contains('nv-date-day')) { pick(btn.parentElement._date); return; }
      if (btn.classList.contains('nv-date-time-item')) { setTime(btn.dataset.unit, Number(btn.dataset.n)); return; }
      if (btn._preset) { applyPreset(btn._preset); return; }
      if (btn.dataset.month != null) {
        view = addMonths(mk(modeYear, Number(btn.dataset.month), 1), -modeCal);
        setMode('day');
        return;
      }
      if (btn.dataset.year != null) { modeYear = Number(btn.dataset.year); setMode('month'); return; }
      switch (act) {
        case 'prev': view = addMonths(view, -1); renderCals(); break;
        case 'next': view = addMonths(view, 1); renderCals(); break;
        case 'prev-1': modeYear -= 1; renderCals(); break;
        case 'next-1': modeYear += 1; renderCals(); break;
        case 'prev-10': modeYear -= 10; renderCals(); break;
        case 'next-10': modeYear += 10; renderCals(); break;
        case 'month': setMode('month', Number(btn.dataset.cal || 0)); break;
        case 'year': if (mode === 'day') setMode('year', Number(btn.dataset.cal || 0)); else { mode = 'year'; renderCals(); } break;
        case 'clear': anchor = null; hover = null; commit(null); close(); break;
        case 'today': pickNow(); break;
        case 'ok': close(); break;
        default:
      }
    }

    function presetRange(p) {
      const t = today();
      const v = typeof p.value === 'function' ? p.value(t) : p.value;
      const [a, b] = (v || []).map(toDate);
      return a && b ? (key(a) <= key(b) ? [a, b] : [b, a]) : null;
    }
    function applyPreset(p) {
      const r = presetRange(p);
      if (!r) return;
      anchor = null;
      hover = null;
      commit({ start: clampDay(r[0]), end: clampDay(r[1]) });
      close();
    }

    function pick(d) {
      if (!d || isDisabled(d)) return;
      cursor = d;
      if (range) {
        if (!anchor) {
          anchor = d;
          hover = null;
          paint();
          paintFoot();
          if (key(d) < key(visibleStart()) || key(d) > key(visibleEnd())) jumpTo(d);
          return;
        }
        const [s, e] = key(anchor) <= key(d) ? [anchor, d] : [d, anchor];
        anchor = null;
        hover = null;
        commit({ start: s, end: e });
        close();
        return;
      }
      const base = value || { h: 0, m: 0 };
      commit({ date: d, h: base.h, m: base.m });
      if (!time) close();
      else jumpTo(d);
    }
    function pickNow() {
      const n = new Date();
      const d = today();
      if (isDisabled(d)) return;
      if (time) {
        commit({ date: d, h: n.getHours(), m: Math.floor(n.getMinutes() / opt.minuteStep) * opt.minuteStep });
        cursor = d;
        jumpTo(d);
        centerTime(true);
      } else {
        commit({ date: d, h: 0, m: 0 });
        close();
      }
    }

    /* —— 打开 / 关闭 —— */
    function open() {
      if (floating || nat.disabled || nat.readOnly) return;
      readOpts();
      months = range ? (opt.months > 0 ? Nova.clamp(opt.months, 1, 3) : window.innerWidth >= 700 ? 2 : 1) : 1;
      mode = 'day';
      anchor = null;
      hover = null;
      cursorOn = false;
      cursor = baseDate();
      view = monthStart(cursor);
      if (range && value && months > 1 && key(monthStart(value.end)) > key(addMonths(view, months - 1))) view = monthStart(value.start);
      build();
      floating = Nova.floating(panel, control, {
        placement: opt.placement,
        offset: 6,
        onDismiss: (reason) => {
          if (reason === 'escape') input.value = display(value);
          close();
        },
      });
      input.setAttribute('aria-expanded', 'true');
      control.classList.add('is-focused');
      requestAnimationFrame(() => centerTime(false));
      Nova.emit(nat, 'nv:open');
    }
    function close() {
      if (!floating) return;
      floating.close();
      floating = null;
      panel = null;
      cals = null;
      timeBox = null;
      status = null;
      presetBox = null;
      anchor = null;
      hover = null;
      cursorOn = false;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      if (document.activeElement !== input) control.classList.remove('is-focused');
      Nova.emit(nat, 'nv:close');
    }

    /* —— 键盘（焦点始终在输入框） —— */
    function moveCursor(next) {
      cursorOn = true;
      cursor = next;
      if (range && anchor) hover = next;
      if (mode !== 'day' || key(next) < key(visibleStart()) || key(next) > key(visibleEnd())) {
        mode = 'day';
        if (cals) { cals.style.minWidth = ''; cals.style.minHeight = ''; }
        view = monthStart(key(next) > key(visibleEnd()) && months > 1 ? addMonths(next, -(months - 1)) : next);
        renderCals();
      } else paint();
    }
    input.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      const k = e.key;
      if (!floating) {
        if (k === 'ArrowDown' || (k === 'ArrowUp' && e.altKey)) { e.preventDefault(); open(); }
        else if (k === 'Enter') { if (input.value !== display(value)) e.preventDefault(); applyText(); }
        return;
      }
      const c = cursor || baseDate();
      const arrows = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      if (k in arrows) {
        const vertical = k === 'ArrowUp' || k === 'ArrowDown';
        if (k === 'ArrowUp' && e.altKey) { e.preventDefault(); close(); return; }
        if (!cursorOn && !vertical && !e.altKey) return; // 未进入游标模式：←→ 用于编辑文字
        e.preventDefault();
        moveCursor(cursorOn || !vertical ? addDays(c, arrows[k]) : c);
      } else if (k === 'PageUp' || k === 'PageDown') {
        e.preventDefault();
        moveCursor(addMonths(c, (k === 'PageUp' ? -1 : 1) * (e.shiftKey ? 12 : 1)));
      } else if ((k === 'Home' || k === 'End') && cursorOn) {
        e.preventDefault();
        const dow = (c.getDay() - opt.weekStart + 7) % 7;
        moveCursor(addDays(c, k === 'Home' ? -dow : 6 - dow));
      } else if (k === 'Enter') {
        e.preventDefault();
        if (cursorOn && cursor) {
          if (isDisabled(cursor)) return;
          pick(cursor);
        } else if (applyText()) close();
      } else if (k === 'Tab') {
        applyText();
        close();
      } else if (k.length === 1 && cursorOn && !e.ctrlKey && !e.metaKey) {
        cursorOn = false; // 开始打字：退出游标模式
        paint();
      }
    });
    input.addEventListener('click', () => open());
    input.addEventListener('focus', () => control.classList.add('is-focused'));
    input.addEventListener('blur', () => { if (!floating) control.classList.remove('is-focused'); });
    // 可见输入框的 input/change 只在组件内部使用，不冒泡给表单（对外事件由原生 input 派发）
    input.addEventListener('input', (e) => e.stopPropagation());
    input.addEventListener('change', (e) => { e.stopPropagation(); applyText(); });
    toggleBtn.addEventListener('mousedown', (e) => e.preventDefault());
    toggleBtn.addEventListener('click', () => {
      if (floating) close();
      else { input.focus({ preventScroll: true }); open(); }
    });
    clearBtn.addEventListener('mousedown', (e) => e.preventDefault());
    clearBtn.addEventListener('click', () => { commit(null); close(); input.focus({ preventScroll: true }); });

    /* —— 与原生 input 同步 —— */
    function sync() {
      readOpts();
      readValue();
      input.value = display(value);
      paintControl();
      if (floating) {
        if (nat.disabled || nat.readOnly) close();
        else { renderCals(); if (time) buildTime(); paintFoot(); }
      }
    }
    const onNativeFocus = () => input.focus();
    const onNativeEvent = () => { if (!emitting) sync(); };
    const onReset = () => setTimeout(sync);
    nat.addEventListener('focus', onNativeFocus);
    nat.addEventListener('change', onNativeEvent);
    nat.addEventListener('input', onNativeEvent);
    const form = nat.form;
    form && form.addEventListener('reset', onReset);
    const mo = new MutationObserver(sync);
    mo.observe(nat, { attributes: true, attributeFilter: ['min', 'max', 'disabled', 'readonly', 'required', 'aria-invalid', 'value', 'data-placeholder', 'data-minute-step', 'data-size', 'data-clearable', 'data-presets', 'data-months', 'data-week-start'] });

    sync();

    return {
      open,
      close,
      refresh: sync,
      clear: () => commit(null),
      /** 设置值：单值传 Date / ISO 字符串；范围传 [start, end] 或 'YYYY-MM-DD/YYYY-MM-DD'；null 清空 */
      setValue(v) {
        if (v == null || v === '') { commit(null); return; }
        if (range) {
          const [a, b] = Array.isArray(v) ? v : String(v).split('/');
          const s = toDate(a);
          const e = toDate(b);
          if (s && e) commit(key(s) <= key(e) ? { start: s, end: e } : { start: e, end: s });
          return;
        }
        const p = v instanceof Date ? { date: toDate(v), h: v.getHours(), m: v.getMinutes() } : parseISO(v);
        if (p) commit({ date: p.date, h: time ? p.h : 0, m: time ? p.m : 0 });
      },
      get value() { return nat.value; },
      get input() { return input; },
      get panel() { return panel; },
      destroy() {
        close();
        mo.disconnect();
        nat.removeEventListener('focus', onNativeFocus);
        nat.removeEventListener('change', onNativeEvent);
        nat.removeEventListener('input', onNativeEvent);
        form && form.removeEventListener('reset', onReset);
        control.remove();
        nat.classList.remove('nv-date-native');
        nat.removeAttribute('aria-hidden');
        if (prevTabIndex == null) nat.removeAttribute('tabindex');
        else nat.setAttribute('tabindex', prevTabIndex);
      },
    };
  });

  const inst = (el) => {
    if (typeof el === 'string') el = document.querySelector(el);
    return el ? Nova.get(el, 'datepicker') : null;
  };
  /**
   * Nova.datepicker(el, options) → 实例。options 覆盖同名 data-*，另支持：
   *   presets: ['today', '7d', ...] 或 [{ label, value: (today) => [start, end] }]，false 关闭
   *   disabledDate: (date) => boolean   额外禁用某些日期
   */
  Nova.datepicker = (el, options = {}) => {
    if (typeof el === 'string') el = document.querySelector(el);
    if (!el) return null;
    jsOptions.set(el, { ...(jsOptions.get(el) || {}), ...options });
    Nova.init(el);
    const i = inst(el);
    i && i.refresh();
    return i;
  };
  Nova.datepicker.refresh = (el) => inst(el) && inst(el).refresh();
  Nova.datepicker.open = (el) => inst(el) && inst(el).open();
  Nova.datepicker.close = (el) => inst(el) && inst(el).close();
  Nova.datepicker.presets = PRESETS;
})();

;
/* src/components/upload/upload.js */
/* DomSprig-UI · Upload 文件上传
 * <div class="nv-upload" data-multiple data-accept="image/*" data-max-size="5MB" data-max-count="3"></div>
 * 容器里没有触发器时自动生成拖拽区；放一个 <button> 则点按钮选择文件，同时放 .nv-upload-dragger 则两者都可用。
 * 支持点击选择、拖拽、在拖拽区获得焦点时粘贴（Ctrl+V 截图）。
 * 内部有一个隐藏的原生 input[type=file]，选中的文件会同步回它（DataTransfer），表单提交照常带上文件。
 *   data-name        input 的 name
 *   data-multiple    多选；不加时新文件替换旧文件
 *   data-accept      同 input[accept]
 *   data-max-size    单文件上限：字节数，或 800KB / 5MB / 1GB
 *   data-max-count   文件数量上限
 *   data-list        text（默认）| picture | none
 *   data-title / data-hint  拖拽区文案，hint 默认按 accept 与 max-size 生成
 *   data-action      设了就自动用 XHR 上传到该地址（POST，字段名 data-field，默认 file）
 *   data-disabled    禁用
 * 事件：nv:add { file }（可取消）、nv:remove { file }（可取消）、nv:change { files }、
 *       nv:reject { file, reason }，reason 取 type | size | count；
 *       有 data-action 时另有 nv:success { file, response }、nv:error { file, status }
 * 实例：Nova.get(el, 'upload') → { files, add(files), remove(file), clear(), open(),
 *       setProgress(file, percent), setStatus(file, 'ready'|'uploading'|'done'|'error', message?), destroy() }
 */
(() => {
  const { h } = Nova;
  const UNITS = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };

  const parseSize = (v) => {
    if (!v) return 0;
    const m = String(v).trim().toLowerCase().match(/^([\d.]+)\s*(b|kb|mb|gb)?$/);
    return m ? Number(m[1]) * UNITS[m[2] || 'b'] : 0;
  };
  const formatSize = (n) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 ** 2) return `${(n / 1024).toFixed(1).replace(/\.0$/, '')} KB`;
    if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1).replace(/\.0$/, '')} MB`;
    return `${(n / 1024 ** 3).toFixed(1).replace(/\.0$/, '')} GB`;
  };
  // 与浏览器 accept 规则一致：.ext、type/*、完整 MIME
  const accepts = (file, accept) => {
    if (!accept) return true;
    const name = file.name.toLowerCase();
    const type = (file.type || '').toLowerCase();
    return accept.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).some((rule) => {
      if (rule.startsWith('.')) return name.endsWith(rule);
      if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1));
      return type === rule;
    });
  };
  const isImage = (file) => /^image\//.test(file.type || '');

  Nova.define('upload', '.nv-upload', (el) => {
    const o = Nova.opts(el, {
      name: '', multiple: false, accept: '', maxSize: '', maxCount: 0, list: 'text',
      title: '', hint: '', action: '', field: 'file',
    });
    const maxSize = parseSize(o.maxSize);
    const maxCount = o.multiple ? Number(o.maxCount) || 0 : 1;
    const disabled = () => el.hasAttribute('data-disabled');

    const input = h('input', {
      type: 'file',
      class: 'nv-upload-input',
      name: o.name || null,
      accept: o.accept || null,
      multiple: o.multiple || null,
      tabindex: '-1',
      'aria-hidden': 'true',
    });
    el.append(input);

    // 触发器：已有按钮 / 已有拖拽区；都没有就生成拖拽区
    const buttons = [...el.querySelectorAll(':scope > button, :scope > .nv-btn, [data-upload-trigger]')];
    let dragger = el.querySelector(':scope > .nv-upload-dragger');
    const createdDragger = !dragger && !buttons.length;
    if (createdDragger) {
      dragger = h('div', { class: 'nv-upload-dragger' });
      el.prepend(dragger);
    }
    if (dragger) {
      dragger.setAttribute('role', 'button');
      if (!dragger.hasAttribute('tabindex')) dragger.tabIndex = 0;
      if (!dragger.hasAttribute('aria-label')) dragger.setAttribute('aria-label', o.title || '选择或拖入文件');
      if (!dragger.children.length && !dragger.textContent.trim()) {
        const tips = [];
        if (o.accept) tips.push(`支持 ${o.accept.replace(/\s*,\s*/g, ' / ')}`);
        if (maxSize) tips.push(`单个不超过 ${formatSize(maxSize)}`);
        if (o.multiple && maxCount) tips.push(`最多 ${maxCount} 个`);
        const title = h('div', { class: 'nv-upload-title' });
        if (o.title) title.textContent = o.title;
        else title.append('拖拽文件到这里，或 ', h('em', {}, '点击选择'));
        const hint = o.hint || tips.join('，');
        dragger.append(
          h('div', { class: 'nv-upload-icon', 'aria-hidden': 'true', html: Nova.icon('cloud-upload', { size: 22 }) }),
          title,
        );
        if (hint) dragger.append(h('div', { class: 'nv-upload-hint' }, hint));
      }
    }

    const list = o.list === 'none' ? null : h('ul', {
      class: 'nv-upload-list',
      'data-variant': o.list === 'picture' ? 'picture' : null,
      'aria-live': 'polite',
    });
    if (list) el.append(list);

    /* —— 文件状态 —— */
    const items = []; // { file, status, progress, message, li, url, xhr }
    const find = (file) => items.find((it) => it.file === file);
    const files = () => items.map((it) => it.file);

    // 把当前文件写回原生 input，保证表单提交与 FormData(form) 拿得到
    const syncInput = () => {
      try {
        const dt = new DataTransfer();
        items.forEach((it) => dt.items.add(it.file));
        input.files = dt.files;
      } catch (_) { /* 旧浏览器不支持写 files，忽略 */ }
    };

    const metaText = (it) => {
      if (it.status === 'error') return it.message || '上传失败';
      if (it.status === 'uploading') return `${formatSize(it.file.size)} · ${Math.round(it.progress)}%`;
      if (it.status === 'done') return `${formatSize(it.file.size)} · ${it.message || '已完成'}`;
      return formatSize(it.file.size);
    };

    const paint = (it) => {
      if (!it.li) return;
      it.li.dataset.status = it.status;
      it.li.style.setProperty('--value', { ready: 0, uploading: it.progress }[it.status] ?? 100);
      it.li.querySelector('.nv-upload-meta').textContent = metaText(it);
    };

    const renderItem = (it) => {
      if (!list) return;
      const thumb = h('span', { class: 'nv-upload-thumb', 'aria-hidden': 'true' });
      if (isImage(it.file)) {
        it.url = URL.createObjectURL(it.file);
        thumb.append(h('img', { src: it.url, alt: '' }));
      } else {
        thumb.innerHTML = Nova.icon('file', { size: 18 });
      }
      const rm = h('button', {
        type: 'button',
        class: 'nv-upload-remove',
        'aria-label': `移除 ${it.file.name}`,
        html: Nova.icon(o.list === 'picture' ? 'x' : 'trash', { size: 15 }),
      });
      rm.addEventListener('click', () => removeItem(it));
      it.li = h('li', { class: 'nv-upload-item' },
        thumb,
        h('span', { class: 'nv-upload-main' },
          h('span', { class: 'nv-upload-name', title: it.file.name }, it.file.name),
          h('span', { class: 'nv-upload-meta' })),
        rm);
      list.append(it.li);
      paint(it);
    };

    const dropItem = (it) => {
      it.xhr?.abort();
      if (it.url) URL.revokeObjectURL(it.url);
      if (it.li) {
        const li = it.li;
        Nova.animateOut(li, () => li.remove());
      }
    };

    function removeItem(it, emit = true) {
      const i = items.indexOf(it);
      if (i < 0) return false;
      if (emit && !Nova.emit(el, 'nv:remove', { file: it.file })) return false;
      items.splice(i, 1);
      dropItem(it);
      syncInput();
      if (emit) Nova.emit(el, 'nv:change', { files: files() });
      return true;
    }

    /* —— 上传（可选） —— */
    function send(it) {
      const xhr = new XMLHttpRequest();
      const fd = new FormData();
      fd.append(o.field || 'file', it.file);
      it.xhr = xhr;
      setStatus(it.file, 'uploading');
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) setProgress(it.file, (e.loaded / e.total) * 99);
      });
      xhr.addEventListener('load', () => {
        it.xhr = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          setStatus(it.file, 'done');
          Nova.emit(el, 'nv:success', { file: it.file, response: xhr.response });
        } else {
          setStatus(it.file, 'error', `上传失败（${xhr.status}）`);
          Nova.emit(el, 'nv:error', { file: it.file, status: xhr.status });
        }
      });
      xhr.addEventListener('error', () => {
        it.xhr = null;
        setStatus(it.file, 'error', '网络错误');
        Nova.emit(el, 'nv:error', { file: it.file, status: 0 });
      });
      xhr.open('POST', o.action);
      xhr.send(fd);
    }

    function add(input_) {
      if (disabled()) return [];
      const incoming = [...(input_ || [])].filter((f) => f instanceof File);
      const added = [];
      const reject = (file, reason) => Nova.emit(el, 'nv:reject', { file, reason });
      for (const file of incoming) {
        if (!accepts(file, o.accept)) { reject(file, 'type'); continue; }
        if (maxSize && file.size > maxSize) { reject(file, 'size'); continue; }
        // 单选模式：新文件替换旧文件
        if (!o.multiple && items.length) {
          if (!Nova.emit(el, 'nv:add', { file })) continue;
          items.splice(0).forEach(dropItem);
        } else {
          if (maxCount && items.length >= maxCount) { reject(file, 'count'); continue; }
          if (!Nova.emit(el, 'nv:add', { file })) continue;
        }
        const it = { file, status: 'ready', progress: 0, message: '', li: null, url: null, xhr: null };
        items.push(it);
        renderItem(it);
        added.push(file);
        if (!o.multiple) break;
      }
      if (added.length) {
        syncInput();
        Nova.emit(el, 'nv:change', { files: files() });
        if (o.action) added.forEach((f) => send(find(f)));
      }
      return added;
    }

    function setProgress(file, pct) {
      const it = find(file);
      if (!it) return;
      it.progress = Nova.clamp(Number(pct) || 0, 0, 100);
      if (it.progress >= 100) { it.status = 'done'; it.message = ''; }
      else it.status = 'uploading';
      paint(it);
    }
    function setStatus(file, status, message = '') {
      const it = find(file);
      if (!it) return;
      it.status = status;
      it.message = message;
      if (status === 'ready') it.progress = 0;
      paint(it);
    }

    /* —— 交互 —— */
    const open = () => { if (!disabled()) input.click(); };
    const onInputChange = () => {
      const picked = [...input.files];
      add(picked);
      syncInput(); // 原生选择会覆盖 input.files，这里写回完整列表
    };
    // 拖拽区里再放触发按钮时只打开一次
    const onTrigger = (e) => { e.preventDefault(); e.stopPropagation(); open(); };
    const onDraggerKey = (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    };

    let depth = 0;
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    const onDragEnter = (e) => {
      if (!hasFiles(e) || disabled()) return;
      e.preventDefault();
      depth += 1;
      el.setAttribute('data-dragover', '');
    };
    const onDragOver = (e) => {
      if (!hasFiles(e) || disabled()) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) el.removeAttribute('data-dragover');
    };
    const onDrop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      el.removeAttribute('data-dragover');
      add(e.dataTransfer.files);
    };
    const onPaste = (e) => {
      const pasted = [...(e.clipboardData?.files || [])];
      if (!pasted.length) return;
      e.preventDefault();
      add(pasted);
    };
    const form = el.closest('form');
    const onReset = () => { items.splice(0).forEach(dropItem); Nova.emit(el, 'nv:change', { files: [] }); };

    input.addEventListener('change', onInputChange);
    buttons.forEach((b) => b.addEventListener('click', onTrigger));
    dragger?.addEventListener('click', onTrigger);
    dragger?.addEventListener('keydown', onDraggerKey);
    el.addEventListener('dragenter', onDragEnter);
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('dragleave', onDragLeave);
    el.addEventListener('drop', onDrop);
    el.addEventListener('paste', onPaste);
    form?.addEventListener('reset', onReset);

    return {
      get files() { return files(); },
      add: (f) => add(f instanceof File ? [f] : f),
      remove: (file) => { const it = find(file); return it ? removeItem(it) : false; },
      clear() {
        if (!items.length) return;
        items.splice(0).forEach(dropItem);
        syncInput();
        Nova.emit(el, 'nv:change', { files: [] });
      },
      open,
      setProgress,
      setStatus,
      destroy() {
        input.removeEventListener('change', onInputChange);
        buttons.forEach((b) => b.removeEventListener('click', onTrigger));
        dragger?.removeEventListener('click', onTrigger);
        dragger?.removeEventListener('keydown', onDraggerKey);
        el.removeEventListener('dragenter', onDragEnter);
        el.removeEventListener('dragover', onDragOver);
        el.removeEventListener('dragleave', onDragLeave);
        el.removeEventListener('drop', onDrop);
        el.removeEventListener('paste', onPaste);
        form?.removeEventListener('reset', onReset);
        items.splice(0).forEach((it) => { it.xhr?.abort(); if (it.url) URL.revokeObjectURL(it.url); });
        list?.remove();
        input.remove();
        if (createdDragger) dragger.remove();
        el.removeAttribute('data-dragover');
      },
    };
  });
})();

;
/* src/components/pagination/pagination.js */
/* DomSprig-UI · Pagination
 * 声明式：<nav class="nv-pagination" data-total="250" data-page="1" data-page-size="10"></nav>（自动渲染）
 * 命令式：const p = Nova.pagination(el, { total, page, pageSize, onChange })
 * 页码算法：首尾各保留 boundaries 个页码，当前页两侧各 siblings 个，其余折叠为省略号（点击省略号跳 siblings*2+3 页）。
 * 事件：nv:change（detail: { page, pageSize }）；实例：set / goTo / get / update / destroy
 */
(() => {
  const { Nova } = window;
  const { h } = Nova;
  const store = new WeakMap();

  const DEFAULTS = {
    total: 0,
    page: 1,
    pageSize: 10,
    siblings: 1,
    boundaries: 1,
    showTotal: false,
    sizeOptions: '',
    jumper: false,
    simple: false,
    disabled: false,
    hideOnSinglePage: false,
    label: '分页',
    prevText: '上一页',
    nextText: '下一页',
    pageText: '第 {page} 页',
    prevMoreText: '向前 {n} 页',
    nextMoreText: '向后 {n} 页',
    totalText: '共 {total} 条',
    sizeText: '{size} 条/页',
    sizeLabel: '每页条数',
    jumperText: '跳至',
    jumperSuffix: '页',
    jumperLabel: '跳转到指定页',
  };

  const fill = (tpl, map) => String(tpl).replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));
  const toInt = (v, d) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : d; };
  const range = (a, b) => (b < a ? [] : Array.from({ length: b - a + 1 }, (_, i) => a + i));

  /**
   * 页码序列：数字为页码，'start' / 'end' 为省略号。
   * 总槽位固定（boundaries*2 + siblings*2 + 3），翻页时组件宽度不跳动。
   */
  function pageItems(page, count, siblings = 1, boundaries = 1) {
    const slots = boundaries * 2 + siblings * 2 + 3;
    if (count <= slots) return range(1, count);
    const left = Math.max(page - siblings, boundaries + 1);
    const right = Math.min(page + siblings, count - boundaries);
    const showStart = left > boundaries + 2;
    const showEnd = right < count - boundaries - 1;
    const head = range(1, boundaries);
    const tail = range(count - boundaries + 1, count);
    if (!showStart && showEnd) return [...range(1, slots - boundaries - 1), 'end', ...tail];
    if (showStart && !showEnd) return [...head, 'start', ...range(count - (slots - boundaries - 1) + 1, count)];
    return [...head, 'start', ...range(left, right), 'end', ...tail];
  }

  const parseSizes = (v) =>
    (Array.isArray(v) ? v : String(v || '').split(/[\s,]+/)).map(Number).filter((n) => n > 0);

  function create(el, options) {
    let o = { ...DEFAULTS, ...options };
    const st = { page: 1, pageSize: 10, total: 0 };
    const pageCount = () => Math.max(1, Math.ceil(st.total / st.pageSize));
    const normalize = () => {
      st.total = Math.max(0, toInt(o.total, 0));
      st.pageSize = Math.max(1, toInt(o.pageSize, 10));
      st.page = Nova.clamp(toInt(o.page, 1), 1, pageCount());
      o.page = st.page;
    };

    el.classList.add('nv-pagination');
    const ownLabel = !el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby');
    normalize();

    /* —— 结构：总数 + 页码列表 + 每页条数 + 跳转；后两者只在选项变化时重建 —— */
    let totalEl = null;
    let list = null;
    let sizeSelect = null;

    function totalText() {
      const start = st.total ? (st.page - 1) * st.pageSize + 1 : 0;
      const end = Math.min(st.total, st.page * st.pageSize);
      if (typeof o.showTotal === 'function') return String(o.showTotal(st.total, [start, end]) ?? '');
      return fill(o.totalText, { total: st.total, start, end });
    }

    function navBtn(dir) {
      const prev = dir === 'prev';
      const disabled = o.disabled || (prev ? st.page <= 1 : st.page >= pageCount());
      return h('li', null, h('button', {
        type: 'button',
        class: `nv-pagination-item nv-pagination-${dir}`,
        'data-key': dir,
        'aria-label': prev ? o.prevText : o.nextText,
        disabled,
        html: Nova.icon(prev ? 'chevron-left' : 'chevron-right', { size: 16 }),
      }));
    }

    function pageBtn(p) {
      return h('li', null, h('button', {
        type: 'button',
        class: 'nv-pagination-item',
        'data-key': `p${p}`,
        'data-page': p,
        'aria-label': fill(o.pageText, { page: p }),
        'aria-current': p === st.page ? 'page' : null,
        disabled: o.disabled,
      }, String(p)));
    }

    function moreBtn(which) {
      const step = Math.max(0, toInt(o.siblings, 1)) * 2 + 3;
      const target = Nova.clamp(which === 'start' ? st.page - step : st.page + step, 1, pageCount());
      const label = fill(which === 'start' ? o.prevMoreText : o.nextMoreText, { n: step });
      return h('li', null, h('button', {
        type: 'button',
        class: 'nv-pagination-item nv-pagination-more',
        'data-key': `more-${which}`,
        'data-page': target,
        'aria-label': label,
        title: label,
        disabled: o.disabled,
      },
      h('span', { class: 'nv-pagination-dots', 'aria-hidden': 'true', html: Nova.icon('more', { size: 16 }) }),
      h('span', { class: 'nv-pagination-jump', 'aria-hidden': 'true', html: Nova.icon(which === 'start' ? 'chevrons-left' : 'chevrons-right', { size: 16 }) })));
    }

    function simpleInput() {
      const input = h('input', {
        class: 'nv-control nv-pagination-input',
        type: 'text',
        inputmode: 'numeric',
        autocomplete: 'off',
        value: String(st.page),
        'data-key': 'simple-input',
        'aria-label': `${fill(o.pageText, { page: st.page })}，共 ${pageCount()} 页`,
        disabled: o.disabled,
      });
      return h('li', { class: 'nv-pagination-simple' }, input,
        h('span', { class: 'nv-pagination-slash', 'aria-hidden': 'true' }, '/'),
        h('span', { class: 'nv-pagination-count', 'aria-hidden': 'true' }, String(pageCount())));
    }

    function buildSizer(sizes) {
      if (!sizes.includes(st.pageSize)) sizes = [...sizes, st.pageSize].sort((a, b) => a - b);
      sizeSelect = h('select', { 'data-nv-select': '', 'data-size': 'sm', 'data-key': 'size', 'aria-label': o.sizeLabel, disabled: o.disabled },
        sizes.map((n) => h('option', { value: n, selected: n === st.pageSize }, fill(o.sizeText, { size: n }))));
      const box = h('span', { class: 'nv-pagination-sizer' }, sizeSelect);
      el.append(box);
      // 页面有 Select 组件时交给它增强（需在文档中才能挂载触发器）；否则使用原生 select + 控件框外观
      Nova.init(box);
      if (!Nova.get(sizeSelect, 'select')) {
        box.classList.add('nv-control');
        box.append(h('span', { class: 'nv-pagination-caret', 'aria-hidden': 'true', html: Nova.icon('chevron-down', { size: 14 }) }));
      }
    }

    function build() {
      if (sizeSelect) Nova.destroy(sizeSelect);
      sizeSelect = null;
      el.textContent = '';
      if (ownLabel) el.setAttribute('aria-label', o.label);
      el.toggleAttribute('data-simple', !!o.simple);
      if (o.disabled) el.setAttribute('aria-disabled', 'true'); else el.removeAttribute('aria-disabled');
      totalEl = o.showTotal ? h('span', { class: 'nv-pagination-total' }) : null;
      list = h('ul', { class: 'nv-pagination-list' });
      el.append(...[totalEl, list].filter(Boolean));
      const sizes = parseSizes(o.sizeOptions);
      if (sizes.length && !o.simple) buildSizer(sizes);
      if (o.jumper && !o.simple) {
        el.append(h('label', { class: 'nv-pagination-jumper' },
          h('span', null, o.jumperText),
          h('input', {
            class: 'nv-control nv-pagination-input', type: 'text', inputmode: 'numeric', autocomplete: 'off',
            'data-key': 'jumper', 'aria-label': o.jumperLabel, disabled: o.disabled,
          }),
          h('span', null, o.jumperSuffix)));
      }
      render();
    }

    function render() {
      const active = document.activeElement;
      const focusKey = active && list.contains(active) ? active.dataset.key : null;
      el.hidden = !!(o.hideOnSinglePage && pageCount() <= 1);
      if (totalEl) totalEl.textContent = totalText();
      const items = [navBtn('prev')];
      if (o.simple) items.push(simpleInput());
      else {
        for (const p of pageItems(st.page, pageCount(), Math.max(0, toInt(o.siblings, 1)), Math.max(1, toInt(o.boundaries, 1)))) {
          items.push(typeof p === 'number' ? pageBtn(p) : moreBtn(p));
        }
      }
      items.push(navBtn('next'));
      list.replaceChildren(...items);
      if (sizeSelect && Number(sizeSelect.value) !== st.pageSize) {
        sizeSelect.value = String(st.pageSize);
        const inst = Nova.get(sizeSelect, 'select');
        if (inst && inst.refresh) inst.refresh();
      }
      // 翻页后焦点留在同一个按钮上；按钮消失或被禁用时落到当前页
      if (focusKey) {
        let target = list.querySelector(`[data-key="${focusKey}"]`);
        if (!target || target.disabled) target = list.querySelector('[aria-current="page"], .nv-pagination-input') || list.querySelector('.nv-pagination-item:not(:disabled)');
        if (target) target.focus({ preventScroll: true });
      }
    }

    /* —— 交互 —— */
    function emit() {
      const detail = { page: st.page, pageSize: st.pageSize };
      Nova.emit(el, 'nv:change', detail);
      if (typeof o.onChange === 'function') o.onChange(detail);
    }
    function goTo(p) {
      p = Nova.clamp(toInt(p, st.page), 1, pageCount());
      if (p === st.page) { render(); return false; }
      st.page = o.page = p;
      render();
      emit();
      return true;
    }
    function changeSize(size) {
      size = Math.max(1, toInt(size, st.pageSize));
      if (size === st.pageSize) return;
      const first = (st.page - 1) * st.pageSize + 1; // 让当前页的第一条仍在新页里
      st.pageSize = o.pageSize = size;
      st.page = o.page = Nova.clamp(Math.ceil(first / size), 1, pageCount());
      render();
      emit();
    }

    const onClick = (e) => {
      const btn = e.target.closest('button.nv-pagination-item');
      if (!btn || btn.disabled || !el.contains(btn)) return;
      const key = btn.dataset.key;
      if (key === 'prev') goTo(st.page - 1);
      else if (key === 'next') goTo(st.page + 1);
      else goTo(Number(btn.dataset.page));
    };
    const commitInput = (input) => {
      const raw = input.value.trim();
      const isJumper = input.dataset.key === 'jumper';
      if (isJumper) input.value = '';
      if (!raw) return;
      if (!goTo(raw) && !isJumper) input.value = String(st.page);
    };
    const onKey = (e) => {
      const input = e.target.closest && e.target.closest('.nv-pagination-input');
      if (input && e.key === 'Enter') { e.preventDefault(); commitInput(input); }
    };
    const onChangeEvt = (e) => {
      if (e.target === sizeSelect) changeSize(e.target.value);
      else if (e.target.classList && e.target.classList.contains('nv-pagination-input')) commitInput(e.target);
    };
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', onKey);
    el.addEventListener('change', onChangeEvt);

    build();

    const inst = {
      /** 静默更新（不派发事件）：set({ page, total, pageSize }) */
      set(next = {}) {
        for (const k of ['total', 'pageSize', 'page']) if (k in next) o[k] = next[k];
        const sizeChanged = 'pageSize' in next && toInt(next.pageSize, st.pageSize) !== st.pageSize;
        normalize();
        if (sizeChanged && sizeSelect && !parseSizes(o.sizeOptions).includes(st.pageSize)) build();
        else render();
        return inst;
      },
      /** 跳页并派发 nv:change，返回是否发生变化 */
      goTo: (p) => goTo(p),
      get: () => ({ page: st.page, pageSize: st.pageSize, total: st.total, pageCount: pageCount() }),
      /** 合并任意选项并重建 */
      update(next = {}) {
        o = { ...o, ...next };
        normalize();
        build();
        return inst;
      },
      destroy() {
        el.removeEventListener('click', onClick);
        el.removeEventListener('keydown', onKey);
        el.removeEventListener('change', onChangeEvt);
        if (sizeSelect) Nova.destroy(sizeSelect);
        el.textContent = '';
        store.delete(el);
      },
    };
    store.set(el, inst);
    return inst;
  }

  Nova.define('pagination', '.nv-pagination', (el) => store.get(el) || create(el, Nova.opts(el, DEFAULTS)));

  /** 命令式创建或更新：Nova.pagination(el, opts) → 实例（同一元素重复调用返回同一实例） */
  Nova.pagination = (el, opts = {}) => {
    if (typeof el === 'string') el = document.querySelector(el);
    if (!el) return null;
    const existing = store.get(el);
    if (existing) return existing.update(opts);
    const inst = create(el, { ...Nova.opts(el, DEFAULTS), ...opts });
    Nova.init(el); // 登记实例，Nova.get(el, 'pagination') 可取
    return inst;
  };
  Nova.pagination.items = pageItems;
})();

;
/* src/components/table/table.js */
/* DomSprig-UI · Table（数据表格）
 * 纯 CSS 用法无需本文件：<div class="nv-table-wrap"><table class="nv-table" data-hover>…</table></div>
 * JS 用法：const t = Nova.table(el, { columns, data, rowKey, selectable, pagination, … })
 *   排序（三态、aria-sort）· 勾选（表头半选、跨页保持、Shift 连选、「已选 N 项」操作栏）· 分页（pagination 组件）
 *   表头吸顶 · 固定列与滚动阴影 · 加载遮罩/骨架 · 空状态 · 可展开行 · 远程数据（remote）
 * 安全：render 返回字符串一律按纯文本插入，只有返回 Node 才插入节点。
 */
(() => {
  const { Nova } = window;
  const { h } = Nova;
  const store = new WeakMap();
  const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });

  const SORT_ICON = '<svg class="nv-table-sort-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path class="nv-table-sort-up" d="m7.5 10 4.5-4.5 4.5 4.5"/><path class="nv-table-sort-down" d="m7.5 14 4.5 4.5 4.5-4.5"/></svg>';

  const DEFAULTS = {
    columns: [],
    data: undefined,
    rowKey: 'id',
    selectable: false,
    rowSelectable: null,
    selected: [],
    selectionBar: true,
    actions: [],
    pagination: true,
    page: 1,
    pageSize: 10,
    sort: null,
    stickyHeader: false,
    maxHeight: null,
    loading: false,
    emptyText: '暂无数据',
    expandable: null,
    remote: false,
    total: null,
    size: 'md',
    striped: false,
    bordered: false,
    hover: true,
    caption: '',
    rowClass: null,
    rowLabel: null,
    onChange: null,
    onSelect: null,
    onRowClick: null,
    onExpand: null,
    // 文案
    selectedText: '已选 {count} 项',
    clearText: '取消选择',
    loadingText: '加载中…',
    selectAllText: '全选当前页',
    selectRowText: '选择 {label}',
    expandText: '展开详情',
    collapseText: '收起详情',
    expandColumnText: '展开',
    sortAscText: '点击升序',
    sortDescText: '点击降序',
    sortClearText: '取消排序',
    paginationLabel: '表格分页',
    selectedLiveText: '已选择 {count} 项',
    clearedLiveText: '已取消全部选择',
  };

  const fill = (tpl, map) => String(tpl).replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));
  const px = (v) => (v == null || v === '' ? '' : typeof v === 'number' ? `${v}px` : String(v));
  const getPath = (row, key) => {
    if (row == null || key == null) return undefined;
    if (key in Object(row)) return row[key];
    return String(key).split('.').reduce((v, k) => (v == null ? v : v[k]), row);
  };
  /** 安全插入：Node 原样插入，数组逐项处理，其它一律转为文本节点 */
  const put = (parent, out) => {
    if (out == null || out === false) return;
    if (Array.isArray(out)) out.forEach((x) => put(parent, x));
    else if (out.nodeType) parent.append(out);
    else parent.append(document.createTextNode(String(out)));
  };
  const isEmpty = (v) => v == null || v === '' || (typeof v === 'number' && Number.isNaN(v));
  function compareValues(a, b) {
    if (a instanceof Date) a = a.getTime();
    if (b instanceof Date) b = b.getTime();
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
    return collator.compare(String(a), String(b));
  }
  const normalizeSort = (s) => (s && s.key != null && (s.dir === 'asc' || s.dir === 'desc') ? { key: s.key, dir: s.dir } : null);
  const INTERACTIVE = 'a[href],button,input,select,textarea,label,summary,[contenteditable="true"],[role="button"],[role="checkbox"],[data-row-click-ignore]';

  function create(el, options) {
    let o = { ...DEFAULTS, ...options };
    const st = { page: 1, pageSize: 10, total: 0, sort: null, loading: false };
    let data = [];
    let cols = [];
    let pageRows = []; // 当前页：[{ row, key, index }]
    const byDomKey = new Map(); // String(key) → entry
    const selected = new Set();
    const known = new Map(); // key → row，远程模式下记住其它页已选的行
    const expanded = new Set();
    const expIds = new Map();
    let lastCheck = -1;
    let reqSeq = 0;
    const idBase = Nova.uid('nv-table');

    el.classList.add('nv-table-root');
    const live = h('div', { class: 'nv-sr-only', 'aria-live': 'polite' });
    const table = h('table', { class: 'nv-table' });
    const wrap = h('div', { class: 'nv-table-wrap' }, table);
    const thead = h('thead');
    const tbody = h('tbody');
    const maskText = h('span', { class: 'nv-table-mask-text' });
    const mask = h('div', { class: 'nv-table-mask', hidden: true }, h('div', { class: 'nv-table-mask-box' }, h('span', { class: 'nv-spinner', 'aria-hidden': 'true' }), maskText));
    const container = h('div', { class: 'nv-table-container' }, wrap, mask);
    let headRow = null;
    let headCheck = null;
    let bar = null;
    let barCount = null;
    let pager = null;
    let layoutRaf = 0;

    const ex = () => (typeof o.expandable === 'function' ? { render: o.expandable } : o.expandable && typeof o.expandable.render === 'function' ? o.expandable : null);
    const keyOf = (row, index) => {
      const k = typeof o.rowKey === 'function' ? o.rowKey(row, index) : getPath(row, o.rowKey);
      return k == null ? index : k;
    };
    const canSelect = (row) => !o.rowSelectable || o.rowSelectable(row) !== false;
    const canExpand = (row) => { const e = ex(); return !!e && (!e.rowExpandable || e.rowExpandable(row) !== false); };
    const clickable = () => typeof o.onRowClick === 'function' || !!(ex() && ex().expandOnRowClick);
    const expId = (key) => {
      if (!expIds.has(key)) expIds.set(key, `${idBase}-exp-${expIds.size}`);
      return expIds.get(key);
    };

    /* ———————————— 列 ———————————— */
    function normalizeColumns() {
      const list = [];
      const anyLeft = o.columns.some((c) => c.fixed === 'left' || c.fixed === true);
      if (o.selectable) list.push({ type: 'check', fixed: anyLeft ? 'left' : null });
      if (ex()) list.push({ type: 'expand', fixed: anyLeft ? 'left' : null });
      o.columns.forEach((c, i) => list.push({
        ...c,
        type: 'data',
        key: c.key ?? c.dataIndex ?? `col${i}`,
        fixed: c.fixed === true ? 'left' : c.fixed === 'left' || c.fixed === 'right' ? c.fixed : null,
      }));
      list.forEach((c, i) => { c.idx = i; });
      const lefts = list.filter((c) => c.fixed === 'left');
      const rights = list.filter((c) => c.fixed === 'right');
      if (lefts.length) lefts[lefts.length - 1].edge = 'left';
      if (rights.length) rights[0].edge = 'right';
      return list;
    }
    function decorate(cell, c) {
      if (c.align) cell.dataset.align = c.align;
      if (c.type === 'data' && c.className) cell.classList.add(...String(c.className).split(/\s+/).filter(Boolean));
      if (!c.fixed) return;
      cell.dataset.fixed = c.fixed;
      cell.style[c.fixed] = `var(--_f${c.idx}, 0px)`;
      if (c.edge) cell.dataset.fixedEdge = c.edge;
    }

    /* ———————————— 表头 ———————————— */
    function buildHead() {
      headRow = h('tr');
      headCheck = null;
      for (const c of cols) {
        let th;
        if (c.type === 'check') {
          headCheck = h('input', { type: 'checkbox', class: 'nv-checkbox', 'aria-label': o.selectAllText });
          th = h('th', { scope: 'col', class: 'nv-table-check' }, headCheck);
        } else if (c.type === 'expand') {
          th = h('th', { scope: 'col', class: 'nv-table-expand' }, h('span', { class: 'nv-sr-only' }, o.expandColumnText));
        } else {
          th = h('th', { scope: 'col' });
          if (c.width != null) th.style.width = px(c.width);
          if (c.minWidth != null) th.style.minWidth = px(c.minWidth);
          if (c.sortable || typeof c.sorter === 'function') {
            th.classList.add('nv-table-sortable');
            th.dataset.sortKey = String(c.key);
            th.setAttribute('aria-sort', 'none');
            const btn = h('button', { type: 'button', class: 'nv-table-sort' });
            put(btn, c.title);
            btn.insertAdjacentHTML('beforeend', SORT_ICON);
            th.append(btn);
          } else put(th, c.title);
        }
        decorate(th, c);
        headRow.append(th);
      }
      thead.replaceChildren(headRow);
    }
    function syncHead() {
      for (const th of headRow.querySelectorAll('th.nv-table-sortable')) {
        const active = st.sort && String(st.sort.key) === th.dataset.sortKey ? st.sort.dir : null;
        th.setAttribute('aria-sort', active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none');
        const btn = th.querySelector('.nv-table-sort');
        btn.title = active === 'asc' ? o.sortDescText : active === 'desc' ? o.sortClearText : o.sortAscText;
      }
    }

    /* ———————————— 数据视图 ———————————— */
    function compute() {
      let rows = data;
      if (!o.remote && st.sort) {
        const col = cols.find((c) => c.type === 'data' && String(c.key) === String(st.sort.key));
        if (col) {
          const dir = st.sort.dir === 'desc' ? -1 : 1;
          const custom = typeof col.sorter === 'function' ? col.sorter : null;
          rows = [...data].sort((a, b) => {
            if (custom) return custom(a, b) * dir;
            const va = getPath(a, col.key);
            const vb = getPath(b, col.key);
            const ea = isEmpty(va);
            const eb = isEmpty(vb);
            if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1; // 空值始终排在最后
            return compareValues(va, vb) * dir;
          });
        }
      }
      const total = o.remote ? Math.max(0, Number(o.total ?? data.length) || 0) : rows.length;
      const paged = !!o.pagination;
      const count = paged ? Math.max(1, Math.ceil(total / st.pageSize)) : 1;
      st.page = Nova.clamp(st.page, 1, count);
      st.total = total;
      const offset = paged ? (st.page - 1) * st.pageSize : 0;
      const list = paged && !o.remote ? rows.slice(offset, offset + st.pageSize) : rows;
      return { list, offset };
    }

    /* ———————————— 表体 ———————————— */
    function rowEl(entry, i) {
      const { row, key, index } = entry;
      const tr = h('tr', { 'data-key': String(key) });
      const extra = typeof o.rowClass === 'function' ? o.rowClass(row, index) : null;
      if (extra) tr.className = extra;
      if (o.selectable) tr.setAttribute('aria-selected', String(selected.has(key)));
      if (clickable()) { tr.dataset.clickable = ''; tr.tabIndex = i === 0 ? 0 : -1; }
      for (const c of cols) {
        let td;
        if (c.type === 'check') {
          const label = typeof o.rowLabel === 'function' ? o.rowLabel(row, index)
            : (() => { const first = cols.find((x) => x.type === 'data'); const v = first && getPath(row, first.key); return isEmpty(v) || typeof v === 'object' ? `第 ${index + 1} 行` : v; })();
          td = h('td', { class: 'nv-table-check' }, h('input', {
            type: 'checkbox', class: 'nv-checkbox', 'aria-label': fill(o.selectRowText, { label, index: index + 1 }),
            checked: selected.has(key), disabled: !canSelect(row),
          }));
        } else if (c.type === 'expand') {
          td = h('td', { class: 'nv-table-expand' });
          if (canExpand(row)) {
            const open = expanded.has(key);
            td.append(h('button', {
              type: 'button', class: 'nv-table-expand-btn', 'aria-expanded': String(open), 'aria-controls': expId(key),
              'aria-label': open ? o.collapseText : o.expandText, html: Nova.icon('chevron-right', { size: 16 }),
            }));
          }
        } else {
          td = h('td');
          const value = getPath(row, c.key);
          const out = typeof c.render === 'function' ? c.render(row, value, index) : value;
          if (c.ellipsis) {
            const span = h('span', { class: 'nv-table-ellipsis' });
            if (c.width != null) span.style.setProperty('--_w', px(c.width));
            put(span, out);
            if (span.textContent) span.title = span.textContent;
            td.append(span);
          } else put(td, out);
        }
        decorate(td, c);
        tr.append(td);
      }
      return tr;
    }
    function expandedEl(entry, animate) {
      const e = ex();
      const inner = h('div', { class: 'nv-table-expanded-inner' });
      put(inner, e.render(entry.row, entry.index));
      const clip = h('div', { class: 'nv-table-expanded-clip' }, h('div', { class: 'nv-table-expanded-body' }, inner));
      if (animate && !Nova.reducedMotion()) clip.dataset.state = 'open';
      return h('tr', { class: 'nv-table-expanded-row', id: expId(entry.key), 'data-for': String(entry.key) },
        h('td', { colspan: cols.length }, clip));
    }
    function emptyEl() {
      const box = h('div', { class: 'nv-table-empty' });
      const content = typeof o.emptyText === 'function' ? o.emptyText() : o.emptyText;
      if (content && content.nodeType) box.append(content);
      else box.append(h('span', { class: 'nv-table-empty-icon', 'aria-hidden': 'true', html: Nova.icon('inbox', { size: 22, stroke: 1.6 }) }), h('span', null, String(content ?? '')));
      return h('tr', { class: 'nv-table-empty-row' }, h('td', { colspan: cols.length }, box));
    }
    function skeletonRows() {
      const n = Math.max(1, Math.min(st.pageSize || 5, 5));
      return Array.from({ length: n }, () => h('tr', { class: 'nv-table-skeleton-row', 'aria-hidden': 'true' },
        cols.map((c) => { const td = h('td', { class: c.type === 'data' ? null : `nv-table-${c.type}` }, h('span', { class: 'nv-table-skeleton' })); decorate(td, c); return td; })));
    }

    function renderBody() {
      const { list, offset } = compute();
      byDomKey.clear();
      pageRows = list.map((row, i) => {
        const index = offset + i;
        const entry = { row, key: keyOf(row, index), index };
        byDomKey.set(String(entry.key), entry);
        if (selected.has(entry.key)) known.set(entry.key, row);
        return entry;
      });
      const skeleton = st.loading && !pageRows.length;
      const nodes = [];
      if (skeleton) nodes.push(...skeletonRows());
      else if (!pageRows.length) nodes.push(emptyEl());
      else {
        pageRows.forEach((entry, i) => {
          nodes.push(rowEl(entry, i));
          if (expanded.has(entry.key) && canExpand(entry.row)) nodes.push(expandedEl(entry, false));
        });
      }
      tbody.replaceChildren(...nodes);
      table.toggleAttribute('data-skeleton', skeleton);
      lastCheck = -1;
      syncHead();
      syncSelection(false);
      syncLoading();
      if (pager) pager.set({ total: st.total, page: st.page, pageSize: st.pageSize });
      scheduleLayout();
    }

    /* ———————————— 勾选 ———————————— */
    function getSelected() {
      const pool = o.remote ? known : new Map(data.map((row, i) => [keyOf(row, i), row]));
      const rows = [];
      for (const k of selected) if (pool.has(k)) rows.push(pool.get(k));
      return rows;
    }
    function syncSelection(notify) {
      if (!o.selectable) return;
      for (const tr of tbody.children) {
        const entry = tr.dataset.key != null && byDomKey.get(tr.dataset.key);
        if (!entry) continue;
        const on = selected.has(entry.key);
        tr.setAttribute('aria-selected', String(on));
        const cb = tr.querySelector(':scope > .nv-table-check input');
        if (cb) cb.checked = on;
      }
      if (headCheck) {
        const pool = pageRows.filter((e) => canSelect(e.row));
        const n = pool.filter((e) => selected.has(e.key)).length;
        headCheck.checked = n > 0 && n === pool.length;
        headCheck.indeterminate = n > 0 && n < pool.length;
        headCheck.disabled = !pool.length || (st.loading && !pageRows.length);
      }
      if (bar) {
        const count = selected.size;
        const open = count > 0 && o.selectionBar !== false;
        bar.dataset.state = open ? 'open' : 'closed';
        bar.inert = !open;
        if (count) {
          const parts = String(o.selectedText).split('{count}');
          barCount.replaceChildren(...parts.flatMap((p, i) => (i ? [h('b', null, String(count)), p] : [p])).filter((x) => x !== ''));
        }
      }
      if (notify) {
        live.textContent = selected.size ? fill(o.selectedLiveText, { count: selected.size }) : o.clearedLiveText;
        const keys = [...selected];
        const rows = getSelected();
        if (typeof o.onSelect === 'function') o.onSelect(keys, rows);
        Nova.emit(el, 'nv:select', { keys, rows });
      }
    }
    function setRowsSelected(entries, on) {
      for (const e of entries) {
        if (!canSelect(e.row)) continue;
        if (on) { selected.add(e.key); known.set(e.key, e.row); } else selected.delete(e.key);
      }
    }

    /* ———————————— 展开 ———————————— */
    function toggleExpand(key, force) {
      const entry = byDomKey.get(String(key));
      const open = force ?? !expanded.has(key);
      if (open === expanded.has(key) || (entry && !canExpand(entry.row))) return;
      if (open) expanded.add(key); else expanded.delete(key);
      if (entry) {
        const tr = tbody.querySelector(`:scope > tr[data-key="${CSS.escape(String(key))}"]`);
        const btn = tr && tr.querySelector('.nv-table-expand-btn');
        if (btn) { btn.setAttribute('aria-expanded', String(open)); btn.setAttribute('aria-label', open ? o.collapseText : o.expandText); }
        const existing = document.getElementById(expId(key));
        if (open && tr) { if (existing) existing.remove(); tr.after(expandedEl(entry, true)); }
        else if (!open && existing) {
          const clip = existing.querySelector('.nv-table-expanded-clip');
          Nova.animateOut(clip, () => existing.remove());
        }
        scheduleLayout();
      }
      const e = ex();
      if (e && typeof e.onExpand === 'function') e.onExpand(entry ? entry.row : null, open);
      if (typeof o.onExpand === 'function') o.onExpand(entry ? entry.row : null, open);
      Nova.emit(el, 'nv:expand', { key, row: entry ? entry.row : null, expanded: open });
    }

    /* ———————————— 排序 / 分页 / 远程 ———————————— */
    function emitChange() {
      const detail = { page: st.page, pageSize: st.pageSize, sort: st.sort ? { ...st.sort } : null };
      Nova.emit(el, 'nv:change', detail);
      if (typeof o.onChange !== 'function') return;
      const ret = o.onChange(detail);
      // 远程模式：onChange 返回 Promise<{ data, total }> 时自动处理加载态与回填
      if (o.remote && ret && typeof ret.then === 'function') {
        const seq = ++reqSeq;
        setLoading(true);
        ret.then((res) => {
          if (seq !== reqSeq) return;
          if (res && Array.isArray(res.data)) setData(res.data, { total: res.total });
          setLoading(false);
        }, (err) => {
          if (seq !== reqSeq) return;
          setLoading(false);
          console.warn('[Nova] table 远程加载失败', err);
        });
      }
    }
    function setSort(key, dir, { notify = true } = {}) {
      const next = key == null || !dir ? null : normalizeSort({ key, dir });
      st.sort = next;
      st.page = 1;
      wrap.scrollTop = 0;
      renderBody();
      if (notify) emitChange();
    }
    function cycleSort(key) {
      const cur = st.sort && String(st.sort.key) === String(key) ? st.sort.dir : null;
      const col = cols.find((c) => c.type === 'data' && String(c.key) === String(key));
      setSort(col ? col.key : key, cur === null ? 'asc' : cur === 'asc' ? 'desc' : null);
    }

    function syncLoading() {
      const showMask = st.loading && !table.hasAttribute('data-skeleton');
      mask.hidden = !showMask;
      maskText.textContent = o.loadingText;
      if (st.loading) table.setAttribute('aria-busy', 'true'); else table.removeAttribute('aria-busy');
      el.toggleAttribute('data-loading', st.loading);
    }
    function setLoading(on = true) {
      on = !!on;
      if (on === st.loading) return;
      st.loading = on;
      // 骨架 ↔ 数据之间切换需要重绘表体；有数据时只切遮罩
      if (!pageRows.length) renderBody();
      else syncLoading();
    }
    function setData(next, { total, page } = {}) {
      data = Array.isArray(next) ? next : [];
      if (total != null) o.total = total;
      if (page != null) st.page = Number(page) || 1;
      if (!o.remote) {
        // 本地模式：数据是全集，清掉已不存在的勾选
        const keys = new Set(data.map((r, i) => keyOf(r, i)));
        let changed = false;
        for (const k of [...selected]) if (!keys.has(k)) { selected.delete(k); changed = true; }
        renderBody();
        if (changed) syncSelection(true);
      } else renderBody();
    }

    /* ———————————— 布局：固定列偏移、滚动阴影 ———————————— */
    function updatePing() {
      const max = wrap.scrollWidth - wrap.clientWidth;
      wrap.toggleAttribute('data-ping-left', wrap.scrollLeft > 1);
      wrap.toggleAttribute('data-ping-right', max > 1 && wrap.scrollLeft < max - 1);
      wrap.toggleAttribute('data-ping-top', wrap.scrollTop > 1);
    }
    function layout() {
      layoutRaf = 0;
      if (!wrap.isConnected || !wrap.clientWidth || !headRow) return; // 隐藏容器内：等 ResizeObserver
      wrap.style.setProperty('--_vw', `${wrap.clientWidth}px`);
      const ths = headRow.children;
      let acc = 0;
      cols.forEach((c, i) => {
        if (c.fixed !== 'left') return;
        table.style.setProperty(`--_f${i}`, `${acc}px`);
        acc += ths[i].getBoundingClientRect().width;
      });
      acc = 0;
      for (let i = cols.length - 1; i >= 0; i--) {
        if (cols[i].fixed !== 'right') continue;
        table.style.setProperty(`--_f${i}`, `${acc}px`);
        acc += ths[i].getBoundingClientRect().width;
      }
      updatePing();
    }
    const scheduleLayout = () => { if (!layoutRaf) layoutRaf = requestAnimationFrame(layout); };
    const ro = 'ResizeObserver' in window ? new ResizeObserver(scheduleLayout) : null;
    if (ro) { ro.observe(wrap); ro.observe(table); }
    wrap.addEventListener('scroll', updatePing, { passive: true });

    /* ———————————— 事件 ———————————— */
    thead.addEventListener('click', (e) => {
      if (headCheck && e.target === headCheck) {
        setRowsSelected(pageRows, headCheck.checked);
        syncSelection(true);
        return;
      }
      const th = e.target.closest('th.nv-table-sortable');
      if (th && headRow.contains(th)) cycleSort(th.dataset.sortKey);
    });

    function rowActivate(tr, e) {
      const entry = byDomKey.get(tr.dataset.key);
      if (!entry) return;
      const x = ex();
      if (x && x.expandOnRowClick && canExpand(entry.row)) toggleExpand(entry.key);
      if (typeof o.onRowClick === 'function') o.onRowClick(entry.row, entry.index, e);
      Nova.emit(el, 'nv:rowclick', { row: entry.row, key: entry.key, index: entry.index });
    }
    tbody.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-key]');
      if (!tr || tr.parentNode !== tbody) return;
      const entry = byDomKey.get(tr.dataset.key);
      if (!entry) return;
      const cb = e.target.closest('.nv-table-check input');
      if (cb && tr.contains(cb)) {
        const idx = pageRows.indexOf(entry);
        if (e.shiftKey && lastCheck >= 0 && lastCheck !== idx) {
          const [a, b] = lastCheck < idx ? [lastCheck, idx] : [idx, lastCheck];
          setRowsSelected(pageRows.slice(a, b + 1), cb.checked);
        } else setRowsSelected([entry], cb.checked);
        lastCheck = idx;
        syncSelection(true);
        return;
      }
      if (e.target.closest('.nv-table-expand-btn')) { toggleExpand(entry.key); return; }
      const hit = e.target.closest(INTERACTIVE);
      if (hit && tr.contains(hit)) return;
      if (String(window.getSelection && window.getSelection()).length) return; // 正在选中文字
      rowActivate(tr, e);
    });
    // Shift 连选时阻止浏览器选中文字
    tbody.addEventListener('mousedown', (e) => {
      if (e.shiftKey && e.target.closest('.nv-table-check')) e.preventDefault();
    });
    // 可点击行：行级漫游焦点（↑ ↓ Home End），Enter 触发，空格勾选
    tbody.addEventListener('keydown', (e) => {
      const tr = e.target;
      if (!(tr instanceof HTMLTableRowElement) || tr.parentNode !== tbody || !tr.hasAttribute('data-clickable')) return;
      const rows = [...tbody.querySelectorAll(':scope > tr[data-clickable]')];
      const i = rows.indexOf(tr);
      let next = null;
      switch (e.key) {
        case 'ArrowDown': next = rows[i + 1]; break;
        case 'ArrowUp': next = rows[i - 1]; break;
        case 'Home': next = rows[0]; break;
        case 'End': next = rows[rows.length - 1]; break;
        case 'Enter': e.preventDefault(); rowActivate(tr, e); return;
        case ' ': {
          const cb = tr.querySelector(':scope > .nv-table-check input');
          if (cb && !cb.disabled) { e.preventDefault(); cb.click(); }
          return;
        }
        default: return;
      }
      e.preventDefault();
      if (next) next.focus();
    });
    tbody.addEventListener('focusin', (e) => {
      const tr = e.target;
      if (!(tr instanceof HTMLTableRowElement) || !tr.hasAttribute('data-clickable')) return;
      for (const r of tbody.querySelectorAll(':scope > tr[data-clickable]')) r.tabIndex = r === tr ? 0 : -1;
    });

    /* ———————————— 构建 ———————————— */
    function buildBar() {
      barCount = h('span', { class: 'nv-table-bar-count' });
      const actions = h('div', { class: 'nv-table-bar-actions' });
      for (const a of o.actions || []) {
        if (!a) continue;
        if (a.nodeType) { actions.append(a); continue; }
        const btn = h('button', { type: 'button', class: 'nv-table-bar-btn', 'data-color': a.color || null, disabled: a.disabled });
        if (a.icon) btn.insertAdjacentHTML('beforeend', Nova.icon(a.icon, { size: 15 }));
        put(btn, a.text);
        btn.addEventListener('click', () => a.onClick && a.onClick(getSelected(), [...selected]));
        actions.append(btn);
      }
      const clear = h('button', { type: 'button', class: 'nv-table-bar-btn nv-table-bar-clear' }, o.clearText);
      clear.addEventListener('click', () => {
        selected.clear();
        syncSelection(true);
        const target = headCheck && !headCheck.disabled ? headCheck : null;
        if (target) target.focus();
      });
      bar = h('div', { class: 'nv-table-bar', 'data-state': 'closed', inert: true },
        h('div', { class: 'nv-table-bar-clip' }, h('div', { class: 'nv-table-bar-inner' }, barCount, actions, clear)));
      el.append(bar);
    }
    function buildFooter() {
      if (!o.pagination || !Nova.pagination) return;
      const p = typeof o.pagination === 'object' ? o.pagination : {};
      const nav = h('nav', { 'aria-label': p.label || o.paginationLabel, 'data-size': p.size || null, 'data-variant': p.variant || null, 'data-align': p.align || null });
      nav.addEventListener('nv:change', (e) => e.stopPropagation()); // 表格自己派发 nv:change，避免与分页事件混淆
      el.append(h('div', { class: 'nv-table-footer' }, nav));
      const { size, variant, align, label, ...rest } = p;
      pager = Nova.pagination(nav, {
        showTotal: true,
        ...rest,
        total: 0,
        page: st.page,
        pageSize: st.pageSize,
        onChange: ({ page, pageSize }) => {
          st.page = page;
          st.pageSize = pageSize;
          wrap.scrollTop = 0;
          renderBody();
          emitChange();
        },
      });
    }
    function build() {
      if (pager) { pager.destroy(); pager = null; }
      bar = null;
      el.replaceChildren();
      cols = normalizeColumns();
      table.replaceChildren();
      for (const [attr, on] of [['data-striped', o.striped], ['data-bordered', o.bordered], ['data-hover', o.hover]]) table.toggleAttribute(attr, !!on);
      if (o.size && o.size !== 'md') table.dataset.size = o.size; else delete table.dataset.size;
      if (o.caption) table.append(h('caption', { class: 'nv-sr-only' }, o.caption));
      table.append(thead, tbody);
      buildHead();
      wrap.style.maxHeight = px(o.maxHeight);
      wrap.toggleAttribute('data-sticky-header', !!(o.stickyHeader || o.maxHeight));
      if (o.selectable) buildBar();
      el.append(container);
      buildFooter();
      el.append(live);
      renderBody();
    }

    function applyState(next, initial) {
      if (initial || 'data' in next) data = Array.isArray(o.data) ? o.data : [];
      if (initial || 'page' in next) st.page = Math.max(1, Number(o.page) || 1);
      if (initial || 'pageSize' in next) st.pageSize = Math.max(1, Number(o.pageSize) || 10);
      if (initial || 'sort' in next) st.sort = normalizeSort(o.sort);
      if (initial || 'loading' in next) st.loading = !!o.loading;
      if (initial || 'selected' in next) { selected.clear(); (o.selected || []).forEach((k) => selected.add(k)); }
      const e = ex();
      if (initial && e && Array.isArray(e.defaultExpanded)) e.defaultExpanded.forEach((k) => expanded.add(k));
    }

    applyState(o, true);
    build();

    const inst = {
      setData,
      setLoading,
      getSelected,
      getSelectedKeys: () => [...selected],
      setSelected(keys = []) { selected.clear(); keys.forEach((k) => selected.add(k)); renderBody(); syncSelection(true); },
      clearSelection() { if (!selected.size) return; selected.clear(); syncSelection(true); },
      sort: (key, dir) => setSort(key, dir),
      goTo(page) {
        if (pager) pager.goTo(page);
      },
      expand: (key, open) => toggleExpand(key, open),
      /** 远程模式：按当前页码/排序重新请求（onChange 返回 Promise 时自动回填） */
      reload: () => emitChange(),
      getState: () => ({ page: st.page, pageSize: st.pageSize, total: st.total, sort: st.sort ? { ...st.sort } : null, loading: st.loading }),
      /** 合并选项并整体重建（列、数据、开关等） */
      update(next = {}) {
        o = { ...o, ...next };
        applyState(next, false);
        build();
        return inst;
      },
      destroy() {
        if (ro) ro.disconnect();
        cancelAnimationFrame(layoutRaf);
        if (pager) pager.destroy();
        el.replaceChildren();
        el.classList.remove('nv-table-root');
        el.removeAttribute('data-loading');
        store.delete(el);
      },
    };
    store.set(el, inst);
    // 远程模式且未传 data：立即按初始状态请求第一页
    if (o.remote && options.data === undefined && typeof o.onChange === 'function') queueMicrotask(() => { if (store.get(el) === inst) emitChange(); });
    return inst;
  }

  Nova.define('table', '.nv-table-root', (el) => store.get(el) || {});

  /** Nova.table(el, opts) → 实例；对同一元素再次调用等同于 update(opts) */
  Nova.table = (el, opts = {}) => {
    if (typeof el === 'string') el = document.querySelector(el);
    if (!el) return null;
    const existing = store.get(el);
    if (existing) return existing.update(opts);
    const inst = create(el, opts);
    Nova.init(el);
    return inst;
  };
})();

;
/* src/components/number-ticker/number-ticker.js */
/* DomSprig-UI · Number Ticker
 * <span data-nv-ticker data-value="12890" data-from="0" data-duration="1600" data-decimals="0" data-prefix="¥" data-suffix="+">
 * - 进入视口（Nova.inView）时开始；计数模式用 rAF，结束即停止；里程表模式只切换 transform（CSS 过渡）。
 * - 格式化：Intl.NumberFormat（data-locale，默认 zh-CN，千分位；data-notation="compact" 得到「1.3万」）。
 * - 读屏只读 .nv-sr-only 中的终值，动画层 aria-hidden。
 * - 减少动态：直接显示终值。
 * API：Nova.ticker.set(el, value, { duration })  Nova.ticker.play(el)  Nova.ticker.get(el)
 * 事件：nv:done（detail: { value }）动画结束时派发。
 */
(() => {
  const { Nova } = window;
  const ROLL = 20; // 里程表每列 0–9 两轮，保证任意两位数字之间都能单向滚动
  const fmtCache = new Map();
  const easeOut = (t) => 1 - Math.pow(1 - t, 4);

  function formatter(o) {
    const key = `${o.locale}|${o.decimals}|${o.grouping}|${o.notation}`;
    let nf = fmtCache.get(key);
    if (!nf) {
      const opts = {
        minimumFractionDigits: o.decimals,
        maximumFractionDigits: o.decimals,
        useGrouping: o.grouping,
        notation: o.notation === 'compact' ? 'compact' : 'standard',
      };
      try { nf = new Intl.NumberFormat(o.locale || undefined, opts); } catch (_) { nf = new Intl.NumberFormat(undefined, opts); }
      fmtCache.set(key, nf);
    }
    return nf;
  }
  const parse = (v, fallback) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^\d.eE+-]/g, ''));
    return Number.isFinite(n) ? n : fallback;
  };

  Nova.define('ticker', '[data-nv-ticker]', (el) => {
    const o = Nova.opts(el, {
      value: NaN, from: 0, duration: 1600, delay: 0, decimals: 0, prefix: '', suffix: '',
      locale: 'zh-CN', grouping: true, notation: 'standard', variant: '',
    });
    o.decimals = Nova.clamp(Math.round(o.decimals) || 0, 0, 20);
    const odometer = o.variant === 'odometer';
    const nf = formatter(o);
    const num = (v) => nf.format(v);
    const full = (v) => `${o.prefix}${num(v)}${o.suffix}`;

    let target = parse(Number.isNaN(o.value) ? el.textContent : o.value, 0);
    let shown = parse(o.from, 0);
    let started = false;
    let raf = 0;
    let doneTimer = 0;

    el.classList.add('nv-ticker');
    el.textContent = '';
    const sr = Nova.h('span', { class: 'nv-sr-only' });
    const ghost = Nova.h('span', { class: 'nv-ticker-ghost', 'aria-hidden': 'true' });
    const vis = Nova.h('span', { class: 'nv-ticker-value', 'aria-hidden': 'true' });
    el.append(sr, ghost, vis);
    el.style.setProperty('--_dur', `${Math.max(0, o.duration)}ms`);

    const syncFinal = () => {
      sr.textContent = full(target);
      ghost.textContent = full(target);
    };
    const finish = () => {
      el.removeAttribute('data-rolling');
      Nova.emit(el, 'nv:done', { value: target });
    };

    /* —— 计数模式 —— */
    const count = (from, to, duration) => {
      cancelAnimationFrame(raf);
      if (Nova.reducedMotion() || duration <= 0 || from === to) {
        shown = to;
        vis.textContent = full(to);
        finish();
        return;
      }
      const t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / duration);
        shown = from + (to - from) * easeOut(t);
        vis.textContent = full(t < 1 ? shown : to);
        if (t < 1) raf = requestAnimationFrame(step);
        else { shown = to; raf = 0; finish(); }
      };
      raf = requestAnimationFrame(step);
    };

    /* —— 里程表模式 —— */
    let cells = [];
    let shape = '';
    const shapeOf = (s) => s.replace(/\d/g, '0');
    const place = (cell, idx, instant) => {
      cell.idx = idx;
      cell.strip.style.transition = instant ? 'none' : '';
      cell.strip.style.transform = `translateY(${(-idx * 100) / ROLL}%)`;
    };
    const build = (numStr, fromStr) => {
      vis.textContent = '';
      cells = [];
      shape = shapeOf(numStr);
      if (o.prefix) vis.append(Nova.h('span', { class: 'nv-odo-sym' }, o.prefix));
      const fromDigits = fromStr.replace(/\D/g, '');
      const len = numStr.replace(/\D/g, '').length;
      const padded = fromDigits.padStart(len, '0').slice(-len);
      let k = 0;
      for (const ch of numStr) {
        if (!/\d/.test(ch)) { vis.append(Nova.h('span', { class: 'nv-odo-sym' }, ch)); continue; }
        const strip = Nova.h('span', { class: 'nv-odo-strip' });
        for (let i = 0; i < ROLL; i++) strip.append(Nova.h('span', null, String(i % 10)));
        vis.append(Nova.h('span', { class: 'nv-odo-digit' }, Nova.h('span', { class: 'nv-odo-ghost' }, '0'), strip));
        const cell = { strip, idx: 0 };
        place(cell, Number(padded[k++]), true);
        cells.push(cell);
      }
      if (o.suffix) vis.append(Nova.h('span', { class: 'nv-odo-sym' }, o.suffix));
    };
    const roll = (from, to, { entry = false, duration = o.duration } = {}) => {
      clearTimeout(doneTimer);
      const numStr = num(to);
      if (shapeOf(numStr) !== shape) build(numStr, num(from));
      const digits = numStr.replace(/\D/g, '');
      const instant = Nova.reducedMotion() || duration <= 0;
      if (instant) {
        cells.forEach((c, i) => place(c, Number(digits[i]), true));
        shown = to;
        finish();
        return;
      }
      const up = to >= from;
      // 第一步：瞬间换到「同一数字」的等价位置，保证接下来单向滚动
      const plan = cells.map((c, i) => {
        const d = c.idx % 10;
        const t = Number(digits[i]);
        if (entry) return up ? [d, t + 10] : [d + 10, t];
        if (t === d) return [c.idx, c.idx];
        return up ? [d, t > d ? t : t + 10] : [d + 10, t < d ? t + 10 : t];
      });
      plan.forEach(([base], i) => place(cells[i], base, true));
      if (cells[0]) getComputedStyle(cells[0].strip).transform; // 提交起点，过渡才会从这里开始
      el.style.setProperty('--_dur', `${duration}ms`);
      el.setAttribute('data-rolling', '');
      plan.forEach(([, next], i) => {
        cells[i].strip.style.setProperty('--_delay', `${i * 45}ms`);
        place(cells[i], next, false);
      });
      shown = to;
      doneTimer = setTimeout(finish, duration + cells.length * 45 + 50);
    };

    const run = (from, to, opts) => (odometer ? roll(from, to, opts) : count(from, to, (opts && opts.duration) ?? o.duration));

    // 初始状态：显示起始值（减少动态时直接显示终值）
    syncFinal();
    const reduced = Nova.reducedMotion();
    if (odometer) build(num(target), num(reduced ? target : shown));
    else vis.textContent = full(reduced ? target : shown);
    if (reduced) shown = target;

    let delayTimer = 0;
    const stopView = Nova.inView(el, () => {
      started = true;
      if (reduced) return;
      delayTimer = setTimeout(() => run(shown, target, { entry: true }), Math.max(0, o.delay));
    }, { threshold: 0.3 });

    const api = {
      get value() { return target; },
      set(value, { duration = o.duration } = {}) {
        const v = parse(value, NaN);
        if (!Number.isFinite(v)) return;
        target = v;
        syncFinal();
        if (!started) { // 还没进入视口：只更新目标，入场时滚动到新值
          if (Nova.reducedMotion()) run(v, v, { duration: 0 });
          return;
        }
        clearTimeout(delayTimer);
        run(shown, v, { duration });
      },
      play() {
        started = true;
        clearTimeout(delayTimer);
        const from = parse(o.from, 0);
        if (odometer) build(num(target), num(from));
        shown = from;
        run(from, target, { entry: true });
      },
      destroy() {
        stopView();
        cancelAnimationFrame(raf);
        clearTimeout(doneTimer);
        clearTimeout(delayTimer);
      },
    };
    return api;
  });

  const inst = (el) => Nova.get(el, 'ticker');
  Nova.ticker = {
    set: (el, value, opts) => inst(el)?.set(value, opts),
    play: (el) => inst(el)?.play(),
    get: (el) => inst(el)?.value,
  };
})();

;
/* src/components/stat/stat.js */
/* DomSprig-UI · Stat 迷你走势图
 * <svg class="nv-stat-spark" data-values="3 5 4 8 7 9" data-type="area" data-animate></svg>
 * data-values  数字，空格或逗号分隔
 * data-type    line | area（默认）
 * data-dot     末端画一个圆点        data-animate  进入视口时描线
 * data-min / data-max  固定纵轴范围（默认取数据最小、最大值）
 * 尺寸随容器变化自动重绘；Nova.get(svg, 'stat-spark').set([…]) 更新数据。
 */
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const parse = (s) => String(s || '').split(/[\s,]+/).filter(Boolean).map(Number).filter((n) => Number.isFinite(n));

  Nova.define('stat-spark', 'svg.nv-stat-spark', (svg) => {
    let values = parse(svg.dataset.values);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('preserveAspectRatio', 'none');

    const make = (tag, attrs) => {
      const n = document.createElementNS(NS, tag);
      for (const k in attrs) n.setAttribute(k, attrs[k]);
      return n;
    };

    const draw = () => {
      const w = svg.clientWidth || 200;
      const h = svg.clientHeight || 40;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      svg.textContent = '';
      if (values.length < 2) return;
      const min = svg.dataset.min != null ? Number(svg.dataset.min) : Math.min(...values);
      const max = svg.dataset.max != null ? Number(svg.dataset.max) : Math.max(...values);
      const range = max - min || 1;
      const pad = 3; // 给线宽和末端圆点留边
      const pts = values.map((v, i) => [
        (i / (values.length - 1)) * w,
        pad + (1 - (v - min) / range) * (h - pad * 2),
      ]);
      // 相邻两点之间用水平切线的三次贝塞尔，曲线平滑，且极值不会冲出数据范围
      let d = `M${pts[0][0]},${pts[0][1]}`;
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        const mx = (x0 + x1) / 2;
        d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
      }
      if ((svg.dataset.type || 'area') === 'area') {
        svg.append(make('path', { class: 'nv-stat-spark-area', d: `${d} L${w},${h} L0,${h} Z` }));
      }
      const line = make('path', { class: 'nv-stat-spark-line', d });
      svg.append(line);
      if ('dot' in svg.dataset) {
        const [x, y] = pts[pts.length - 1];
        svg.append(make('circle', { class: 'nv-stat-spark-dot', cx: x, cy: y, r: 3 }));
      }
      if ('animate' in svg.dataset) {
        const len = line.getTotalLength ? line.getTotalLength() : w * 2;
        svg.style.setProperty('--_len', String(Math.ceil(len)));
      }
    };

    draw();
    let lastW = svg.clientWidth;
    let lastH = svg.clientHeight;
    const ro = new ResizeObserver(() => {
      if (svg.clientWidth === lastW && svg.clientHeight === lastH) return;
      lastW = svg.clientWidth;
      lastH = svg.clientHeight;
      draw();
    });
    ro.observe(svg);
    const stopView = 'animate' in svg.dataset
      ? Nova.inView(svg, () => requestAnimationFrame(() => svg.classList.add('is-in')))
      : () => {};

    return {
      set(next) {
        values = Array.isArray(next) ? next.map(Number).filter((n) => Number.isFinite(n)) : parse(next);
        svg.dataset.values = values.join(' ');
        draw();
      },
      get values() { return values.slice(); },
      destroy() { ro.disconnect(); stopView(); },
    };
  });
})();

;
/* src/components/accordion/accordion.js */
/* DomSprig-UI · Accordion
 * 基于原生 <details>/<summary>：没有脚本也能展开收起。本文件增强：
 * - 平滑高度动画（Web Animations；减少动态时直接切换）
 * - 默认单开（data-multiple 允许多开）、禁用项、↑ ↓ Home End 在标题间移动焦点
 * - 事件 nv:toggle { open, item, index, value }（可取消：preventDefault 阻止这次展开/收起）
 * 实例：Nova.get(el, 'accordion') → { open(t), close(t), toggle(t), openAll(), closeAll(), items }
 *       t 可以是序号、data-value 或 item 元素
 */
(() => {
  const { Nova } = window;
  const ICON_SEL = ':scope > svg, :scope > .nv-icon, :scope > i[data-nv-icon], :scope > .nv-accordion-extra, :scope > .nv-accordion-chevron';

  Nova.define('accordion', '.nv-accordion', (root) => {
    const o = Nova.opts(root, { multiple: false });
    const ac = new AbortController();
    const on = (el, type, fn, opt) => el.addEventListener(type, fn, { signal: ac.signal, ...opt });
    const running = new WeakMap(); // item → { anim, target }
    const ours = new WeakMap(); // 最近一次由本组件写入的 open，用来区分原生 toggle 事件的来源

    const items = () => [...root.querySelectorAll(':scope > .nv-accordion-item')];
    const summaryOf = (item) => item.querySelector(':scope > summary');
    const contentOf = (item) => item.querySelector(':scope > .nv-accordion-content');
    const disabled = (item) => item.hasAttribute('data-disabled');
    const isOpen = (item) => (running.has(item) ? running.get(item).target : item.open);

    function wire(item) {
      const summary = summaryOf(item);
      if (!summary || summary.dataset.nvWired) return;
      summary.dataset.nvWired = '';
      // 标题文字包进 .nv-accordion-label，图标/附加信息/箭头留在外面
      if (!summary.querySelector(':scope > .nv-accordion-label')) {
        const label = Nova.h('span', { class: 'nv-accordion-label' });
        const keep = new Set(summary.querySelectorAll(ICON_SEL));
        const extra = summary.querySelector(':scope > .nv-accordion-extra');
        [...summary.childNodes].forEach((n) => { if (!keep.has(n)) label.append(n); });
        summary.insertBefore(label, extra || null);
      }
      if (!summary.querySelector('.nv-accordion-chevron')) {
        summary.insertAdjacentHTML('beforeend', Nova.icon('chevron-down', { cls: 'nv-accordion-chevron' }));
      }
      const content = contentOf(item);
      if (content) {
        if (!content.id) content.id = Nova.uid('nv-acc');
        summary.setAttribute('aria-controls', content.id);
        content.setAttribute('role', 'region');
        if (!summary.id) summary.id = Nova.uid('nv-acc-h');
        content.setAttribute('aria-labelledby', summary.id);
      }
      syncDisabled(item);
      ours.set(item, item.open); // 解析时自带 open 的项也会派发一次原生 toggle，不当作外部修改
      item.dataset.state = item.open ? 'open' : 'closed';
    }
    function syncDisabled(item) {
      const s = summaryOf(item);
      if (!s) return;
      if (disabled(item)) { s.setAttribute('aria-disabled', 'true'); s.tabIndex = -1; }
      else { s.removeAttribute('aria-disabled'); s.removeAttribute('tabindex'); }
    }

    const cssVar = (name, fallback) => getComputedStyle(root).getPropertyValue(name).trim() || fallback;

    /* —— 高度动画：动 <details> 本身的高度（收起高度 = 标题行 + 边框），内容同时淡入 —— */
    function animate(item, open) {
      const prev = running.get(item);
      const startH = item.offsetHeight;
      if (prev) { prev.anim.cancel(); prev.fade && prev.fade.cancel(); }
      item.dataset.state = open ? 'open' : 'closed';
      const reduce = Nova.reducedMotion() || !item.animate || !item.getClientRects().length;
      if (reduce) {
        running.delete(item);
        setOpen(item, open);
        item.style.overflow = '';
        return;
      }
      // 测量终点高度：临时切到目标状态
      setOpen(item, false);
      const closedH = item.offsetHeight;
      setOpen(item, true);
      const openH = item.offsetHeight;
      const endH = open ? openH : closedH;
      item.style.overflow = 'hidden';
      const dist = Math.abs(endH - startH);
      const dur = Math.round(Nova.clamp(parseFloat(cssVar('--nv-accordion-duration', '')) || 180 + dist * 0.35, 160, 420));
      const easing = cssVar('--nv-ease-out', 'ease-out');
      const anim = item.animate({ height: [`${startH}px`, `${endH}px`] }, { duration: dur, easing });
      const content = contentOf(item);
      const fade = open && content
        ? content.animate({ opacity: [0, 1], transform: ['translateY(-4px)', 'none'] }, { duration: dur, easing, delay: 40, fill: 'backwards' })
        : null;
      running.set(item, { anim, fade, target: open });
      anim.onfinish = () => {
        running.delete(item);
        if (!open) setOpen(item, false);
        item.style.overflow = '';
      };
      anim.oncancel = () => { if (running.get(item)?.anim === anim) running.delete(item); };
    }
    function setOpen(item, v) {
      ours.set(item, v);
      if (item.open !== v) item.open = v;
    }

    function resolve(t) {
      const list = items();
      if (t == null) return null;
      if (typeof t === 'number') return list[t] || null;
      if (t.nodeType === 1) return list.includes(t) ? t : list.find((i) => i.contains(t)) || null;
      return list.find((i) => i.dataset.value === String(t)) || null;
    }

    function set(target, open, { animate: anim = true, force = false } = {}) {
      const item = resolve(target);
      if (!item || (!force && disabled(item)) || isOpen(item) === open) return false;
      const list = items();
      const ev = Nova.emit(root, 'nv:toggle', { open, item, index: list.indexOf(item), value: item.dataset.value ?? null });
      if (!ev) return false;
      if (anim) animate(item, open);
      else { item.dataset.state = open ? 'open' : 'closed'; setOpen(item, open); }
      if (open && !o.multiple) {
        for (const other of list) if (other !== item && isOpen(other)) set(other, false, { animate: anim, force: true });
      }
      return true;
    }

    /* —— 交互 —— */
    on(root, 'click', (e) => {
      const summary = e.target.closest('summary');
      if (!summary || summary.parentElement?.parentElement !== root) return;
      const item = summary.parentElement;
      if (!item.classList.contains('nv-accordion-item')) return;
      // summary 内的链接/按钮等交互元素照常工作
      if (e.target !== summary && e.target.closest('a, button, input, select, textarea, label') && summary.contains(e.target.closest('a, button, input, select, textarea, label'))) return;
      e.preventDefault();
      set(item, !isOpen(item));
    });

    on(root, 'keydown', (e) => {
      const summary = e.target.closest('summary');
      if (!summary || summary.parentElement?.parentElement !== root) return;
      const heads = items().filter((i) => !disabled(i)).map(summaryOf).filter(Boolean);
      const i = heads.indexOf(summary);
      let next = null;
      if (e.key === 'ArrowDown') next = heads[(i + 1) % heads.length];
      else if (e.key === 'ArrowUp') next = heads[(i - 1 + heads.length) % heads.length];
      else if (e.key === 'Home') next = heads[0];
      else if (e.key === 'End') next = heads[heads.length - 1];
      if (!next) return;
      e.preventDefault();
      next.focus();
    });

    // 外部直接改 open（页内查找自动展开、作者脚本）：同步状态并维持单开
    on(root, 'toggle', (e) => {
      const item = e.target;
      if (!item.classList || !item.classList.contains('nv-accordion-item') || item.parentElement !== root) return;
      if (running.has(item) || (ours.has(item) && ours.get(item) === item.open)) return;
      ours.set(item, item.open);
      item.dataset.state = item.open ? 'open' : 'closed';
      const list = items();
      Nova.emit(root, 'nv:toggle', { open: item.open, item, index: list.indexOf(item), value: item.dataset.value ?? null });
      if (item.open && !o.multiple) for (const other of list) if (other !== item && isOpen(other)) set(other, false, { force: true });
    }, { capture: true }); // toggle 不冒泡，用捕获

    const mo = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'attributes') syncDisabled(r.target);
        else r.addedNodes.forEach((n) => n.nodeType === 1 && n.classList.contains('nv-accordion-item') && wire(n));
      }
    });
    mo.observe(root, { childList: true });
    const observeItem = (item) => mo.observe(item, { attributes: true, attributeFilter: ['data-disabled'] });

    // 初始化：单开模式下若作者写了多个 open，只保留第一个
    let seen = false;
    for (const item of items()) {
      if (!o.multiple && item.open) { if (seen) setOpen(item, false); seen = true; }
      wire(item);
      observeItem(item);
    }

    return {
      open: (t, opts) => set(t, true, opts),
      close: (t, opts) => set(t, false, opts),
      toggle: (t, opts) => { const item = resolve(t); return item ? set(item, !isOpen(item), opts) : false; },
      openAll: () => { if (o.multiple) items().forEach((i) => set(i, true)); },
      closeAll: () => items().forEach((i) => set(i, false)),
      get items() { return items(); },
      get value() { return items().map((i, n) => (isOpen(i) ? i.dataset.value ?? String(n) : null)).filter((v) => v != null); },
      destroy() { ac.abort(); mo.disconnect(); },
    };
  });

  const call = (m) => (el, ...args) => { const inst = Nova.get(el, 'accordion'); return inst ? inst[m](...args) : false; };
  Nova.accordion = {
    open: call('open'),
    close: call('close'),
    toggle: call('toggle'),
    openAll: call('openAll'),
    closeAll: call('closeAll'),
  };
})();

;
/* src/components/kbd/kbd.js */
/* DomSprig-UI · Kbd
 * <kbd class="nv-kbd" data-keys="mod+k"></kbd> → 按平台拆成多个按键：
 *   Mac：⌘ K    其他：Ctrl K（mod / ctrl / alt / shift / enter / esc / 方向键等有对应写法）
 * 结果是 <span class="nv-kbd-group"><kbd class="nv-kbd">⌘</kbd><kbd class="nv-kbd">K</kbd></span>，
 * 整组带 aria-label（如「Command K」），读屏不会念出符号。
 * Nova.kbd.isMac / Nova.kbd.format('mod+k') → ['⌘', 'K']
 */
(() => {
  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent);
  const MAC = { mod: '⌘', cmd: '⌘', meta: '⌘', ctrl: '⌃', alt: '⌥', option: '⌥', shift: '⇧' };
  const WIN = { mod: 'Ctrl', cmd: 'Win', meta: 'Win', ctrl: 'Ctrl', alt: 'Alt', option: 'Alt', shift: 'Shift' };
  const COMMON = { enter: '↵', return: '↵', esc: 'Esc', escape: 'Esc', tab: 'Tab', space: 'Space', backspace: '⌫', delete: 'Del', up: '↑', down: '↓', left: '←', right: '→', pageup: 'PgUp', pagedown: 'PgDn', home: 'Home', end: 'End', plus: '+' };
  const SPOKEN = { '⌘': 'Command', '⌃': 'Control', '⌥': 'Option', '⇧': 'Shift', '↵': 'Enter', '⌫': 'Backspace', '↑': '上', '↓': '下', '←': '左', '→': '右' };

  const format = (keys) => String(keys).split(/\s*\+\s*(?!$)/).filter(Boolean).map((k) => {
    const lk = k.toLowerCase();
    return (isMac ? MAC : WIN)[lk] || COMMON[lk] || (k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1));
  });

  Nova.define('kbd', '.nv-kbd[data-keys]', (el) => {
    const parts = format(el.dataset.keys);
    const label = parts.map((p) => SPOKEN[p] || p).join(' ');
    const make = (p) => {
      const k = el.cloneNode(false);
      k.removeAttribute('data-keys');
      k.textContent = p;
      return k;
    };
    if (parts.length === 1) {
      el.textContent = parts[0];
      el.setAttribute('aria-label', label);
      el.removeAttribute('data-keys');
      return {};
    }
    const group = Nova.h('span', { class: 'nv-kbd-group', 'aria-label': label, role: 'img' }, parts.map(make));
    el.replaceWith(group);
    return {};
  });

  Nova.kbd = { isMac, format };
})();

;
/* src/components/alert/alert.js */
/* DomSprig-UI · Alert
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

;
/* src/components/progress/progress.js */
/* DomSprig-UI · Progress
 * 增强 .nv-progress（线性）与 .nv-progress-circle（环形）：
 * - 写入 role="progressbar"、aria-valuemin/max/now（不确定态移除 valuenow）与 --value；
 * - 同一 .nv-progress-field 内的 .nv-progress-label 自动关联为 aria-labelledby，.nv-progress-value 自动显示数值（数字滚动过渡）；
 * - data-segments="5" 生成分段；环形生成 SVG（ResizeObserver 测量尺寸，按像素计算粗细）；
 * - 监听 data-value / data-max / data-indeterminate 属性变化（框架直接改属性也会更新）。
 * Nova.progress.set(el, value, { text })   value 为 null 时进入不确定态
 * Nova.progress.get(el) → 当前值
 */
(() => {
  const { Nova } = window;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs) => {
    const n = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };
  const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
  const fmt = (pct) => `${Math.round(pct)}%`;

  Nova.define('progress', '.nv-progress, .nv-progress-circle', (el) => {
    const circle = el.classList.contains('nv-progress-circle');
    const o = Nova.opts(el, { segments: 0, label: '进度', showValue: true, thickness: 0 });
    const field = circle ? null : el.closest('.nv-progress-field');

    const readValue = () => {
      if (el.hasAttribute('data-indeterminate')) return null;
      const raw = el.dataset.value ?? el.style.getPropertyValue('--value');
      const n = parseFloat(raw);
      return Number.isFinite(n) ? n : 0;
    };
    const readMax = () => {
      const m = parseFloat(el.dataset.max);
      return Number.isFinite(m) && m > 0 ? m : 100;
    };

    let value = readValue();
    let max = readMax();
    let text = null;            // 自定义数值文字（同时作为 aria-valuetext）
    let shown = null;           // 数值文字当前显示的百分比（用于数字滚动）
    let raf = 0;

    // —— ARIA ——
    el.setAttribute('role', 'progressbar');
    el.setAttribute('aria-valuemin', '0');
    const label = field && field.querySelector('.nv-progress-label');
    if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) {
      if (label) {
        if (!label.id) label.id = Nova.uid('nv-progress-label');
        el.setAttribute('aria-labelledby', label.id);
      } else el.setAttribute('aria-label', o.label);
    }

    // —— 数值文字 ——
    let valueEl = circle ? el.querySelector('.nv-progress-circle-value') : field && field.querySelector('.nv-progress-value');
    if (circle && !valueEl && !el.children.length && o.showValue && el.dataset.size !== 'xs') {
      valueEl = Nova.h('span', { class: 'nv-progress-circle-value', 'aria-hidden': 'true' });
      el.append(valueEl);
    }
    // 只有为空或写着 {value} 占位的数值元素才由组件接管
    const autoText = valueEl && (!valueEl.textContent.trim() || valueEl.hasAttribute('data-auto'));
    if (autoText) valueEl.setAttribute('data-auto', '');

    // —— 分段 ——
    let segs = [];
    if (!circle && o.segments > 1) {
      const n = Math.min(Math.round(o.segments), 50);
      el.style.setProperty('--_n', n);
      segs = Array.from({ length: n }, (_, i) => {
        const s = Nova.h('span', { class: 'nv-progress-segment', 'aria-hidden': 'true' });
        s.style.setProperty('--_i', i);
        return s;
      });
      el.replaceChildren(...segs);
    }

    // —— 环形 SVG ——
    let ro = null;
    let geo = '';
    if (circle) {
      const s = svg('svg', { class: 'nv-progress-circle-svg', 'aria-hidden': 'true', focusable: 'false' });
      const track = svg('circle', { class: 'nv-progress-circle-track' });
      const bar = svg('circle', { class: 'nv-progress-circle-bar' });
      if (el.dataset.variant === 'gradient') {
        const id = Nova.uid('nv-progress-grad');
        const grad = svg('linearGradient', { id, x1: '0', y1: '0', x2: '1', y2: '1' });
        grad.append(svg('stop', { offset: '0', class: 'nv-progress-circle-stop-1' }), svg('stop', { offset: '1', class: 'nv-progress-circle-stop-2' }));
        const defs = svg('defs', {});
        defs.append(grad);
        s.append(defs);
        el.style.setProperty('--_grad-url', `url(#${id})`);
      }
      s.append(track, bar);
      el.prepend(s);
      const layout = (size) => {
        if (!size) return;
        const cssThick = parseFloat(getComputedStyle(el).getPropertyValue('--_thick'));
        const t = Nova.clamp(o.thickness || cssThick || size * 0.085, 1, size / 2);
        const key = `${size}|${t}`;
        if (key === geo) return;
        geo = key;
        const r = (size - t) / 2;
        s.setAttribute('viewBox', `0 0 ${size} ${size}`);
        for (const c of [track, bar]) {
          c.setAttribute('cx', size / 2);
          c.setAttribute('cy', size / 2);
          c.setAttribute('r', r);
          c.setAttribute('stroke-width', t);
        }
        // 首次布局时不做过渡，避免从 0 扫到当前值
        bar.style.transition = 'none';
        el.style.setProperty('--_circ', round(2 * Math.PI * r, 3));
        bar.getBoundingClientRect();
        bar.style.transition = '';
      };
      if ('ResizeObserver' in window) {
        ro = new ResizeObserver((entries) => {
          const box = entries[entries.length - 1].contentRect;
          layout(Math.round(Math.min(box.width, box.height)));
        });
        ro.observe(el);
      }
    }

    // —— 渲染 ——
    const paintText = (pct) => {
      if (!autoText) return;
      valueEl.textContent = text != null ? text : pct == null ? '' : fmt(pct);
    };
    const animateText = (from, to) => {
      cancelAnimationFrame(raf);
      if (from == null || to == null || text != null || Nova.reducedMotion() || Math.abs(to - from) < 1 || !el.getClientRects().length) {
        shown = to;
        paintText(to);
        return;
      }
      const t0 = performance.now();
      const dur = 420;
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        const e = 1 - (1 - k) ** 3;
        shown = from + (to - from) * e;
        paintText(shown);
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };

    function render({ animate = true } = {}) {
      const indeterminate = value == null;
      const pct = indeterminate ? null : Nova.clamp((value / max) * 100, 0, 100);
      el.toggleAttribute('data-indeterminate', indeterminate);
      el.setAttribute('aria-valuemax', String(max));
      if (indeterminate) {
        el.removeAttribute('aria-valuenow');
        el.style.removeProperty('--value');
      } else {
        el.setAttribute('aria-valuenow', String(round(Nova.clamp(value, 0, max))));
        el.style.setProperty('--value', round(pct));
      }
      if (text != null) el.setAttribute('aria-valuetext', text);
      else el.removeAttribute('aria-valuetext');
      if (circle) el.toggleAttribute('data-empty', pct === 0);
      if (segs.length) {
        const n = segs.length;
        const prev = segs.map((s) => parseFloat(s.style.getPropertyValue('--_fill')) || 0);
        const fills = segs.map((_, i) => (pct == null ? 0 : Nova.clamp((pct / 100) * n - i, 0, 1)));
        // 依次填充：增长时从左到右，回退时从右到左
        const growing = fills.reduce((a, b) => a + b, 0) >= prev.reduce((a, b) => a + b, 0);
        const order = segs.map((_, i) => (growing ? i : n - 1 - i));
        let k = 0;
        for (const j of order) {
          const changed = Math.abs(fills[j] - prev[j]) > 0.001;
          segs[j].style.setProperty('--_delay', `${animate && changed ? k++ * 60 : 0}ms`);
          segs[j].style.setProperty('--_fill', round(fills[j], 4));
        }
      }
      if (animate) animateText(shown, pct);
      else { shown = pct; paintText(pct); }
    }

    // —— 属性同步（外部直接改 data-value 也生效） ——
    let syncing = false;
    const mo = new MutationObserver(() => {
      if (syncing) return;
      const v = readValue();
      const m = readMax();
      if (v === value && m === max) return;
      value = v;
      max = m;
      render();
    });
    mo.observe(el, { attributes: true, attributeFilter: ['data-value', 'data-max', 'data-indeterminate'] });

    function set(v, opts = {}) {
      value = v == null || v === '' ? null : Number(v);
      if (value != null && !Number.isFinite(value)) value = 0;
      if (opts.max != null) max = Number(opts.max) > 0 ? Number(opts.max) : max;
      text = opts.text != null ? String(opts.text) : null;
      syncing = true;
      if (value == null) {
        el.removeAttribute('data-value');
        el.setAttribute('data-indeterminate', '');
      } else {
        el.dataset.value = String(value);
        el.removeAttribute('data-indeterminate');
      }
      if (opts.max != null) el.dataset.max = String(max);
      mo.takeRecords();
      syncing = false;
      render({ animate: opts.animate !== false });
    }

    // 首次渲染不做宽度/弧长过渡：临时关闭 transition，强制计算一次样式后恢复
    el.setAttribute('data-instant', '');
    render({ animate: false });
    void getComputedStyle(el).width;
    el.removeAttribute('data-instant');

    return {
      set,
      get value() { return value; },
      get max() { return max; },
      destroy() {
        mo.disconnect();
        ro && ro.disconnect();
        cancelAnimationFrame(raf);
      },
    };
  });

  const resolveEl = (el) => (typeof el === 'string' ? document.querySelector(el) : el);
  Nova.progress = {
    set(el, value, opts) {
      el = resolveEl(el);
      if (!el) return;
      const inst = Nova.get(el, 'progress');
      if (inst) inst.set(value, opts);
      else if (value == null) el.setAttribute('data-indeterminate', '');
      else { el.removeAttribute('data-indeterminate'); el.dataset.value = String(value); }
    },
    get(el) {
      const inst = Nova.get(resolveEl(el), 'progress');
      return inst ? inst.value : null;
    },
  };
})();

;
/* src/components/toast/toast.js */
/* DomSprig-UI · Toast —— 轻量、非阻断的操作反馈
 * Nova.toast('已保存')                         Nova.toast.success('已保存') / .error / .warning / .info / .loading
 * Nova.toast.show({ title, description, type, duration, position, id, closable, action: { label, onClick }, icon, onClose })
 * const t = Nova.toast.loading('上传中…'); t.update({ type: 'success', title: '上传完成' }); t.dismiss()
 * Nova.toast.update(id, patch) / .dismiss(id) / .dismissAll() / .promise(p, { loading, success, error })
 * Nova.toast.config({ position, duration, errorDuration, max })
 */
(() => {
  const { Nova } = window;
  const TYPES = ['success', 'error', 'warning', 'info', 'loading'];
  const POSITIONS = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'];
  const cfg = {
    position: 'top-center',
    duration: 3000,
    errorDuration: 5000,
    max: 3,
    hotkey: true, // Alt+T 聚焦最新一条
    closeLabel: '关闭提示',
    regionLabel: '通知',
    loadingText: '处理中…',
    successText: '操作成功',
    errorText: '操作失败',
  };

  if (!Nova.icons['alert-mark']) Nova.icons['alert-mark'] = '<path d="M12 6.5v7M12 17.5h.01"/>';
  if (!Nova.icons['info-mark']) Nova.icons['info-mark'] = '<path d="M12 11v6.5M12 6.5h.01"/>';
  const ICON = { success: 'check', error: 'alert-mark', warning: 'triangle-alert', info: 'info-mark' };

  const regions = new Map();
  const items = new Map(); // id → item（按创建顺序）
  let seed = 0;
  let returnFocus = null; // Alt+T 之前的焦点，关闭后归还

  /* ———————— 容器 ———————— */
  function region(pos) {
    let r = regions.get(pos);
    if (r && r.isConnected) return r;
    r = Nova.h('section', {
      class: 'nv-toast-region',
      'data-position': pos,
      'aria-label': cfg.hotkey ? `${cfg.regionLabel}（Alt+T）` : cfg.regionLabel,
      'aria-live': 'polite',
      'aria-relevant': 'additions text',
      tabindex: '-1',
      'data-nv-layer-ignore': '',
    });
    document.body.appendChild(r);
    regions.set(pos, r);
    return r;
  }

  /* 列表位移的 FLIP 动画：新增 / 移除 / 内容变化时其余提示平滑让位 */
  function flip(r, mutate) {
    if (!r || Nova.reducedMotion() || !r.animate) { mutate(); return; }
    const before = new Map([...r.children].map((n) => [n, n.getBoundingClientRect().top]));
    mutate();
    const easing = getComputedStyle(r).getPropertyValue('--nv-ease-out').trim() || 'ease-out';
    for (const n of r.children) {
      const b = before.get(n);
      if (b == null || n.dataset.state === 'closed') continue;
      const dy = b - n.getBoundingClientRect().top;
      if (Math.abs(dy) < 0.5) continue;
      n.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: 300, easing });
    }
  }

  /* ———————— 渲染 ———————— */
  function normalize(o) {
    o = { type: 'info', closable: true, ...o };
    if (!TYPES.includes(o.type)) o.type = 'info';
    if (o.duration == null) o.duration = o.type === 'loading' ? 0 : o.type === 'error' ? cfg.errorDuration : cfg.duration;
    o.duration = Math.max(0, Number(o.duration) || 0);
    return o;
  }

  function iconNode(o) {
    if (o.icon === false) return null;
    const box = Nova.h('span', { class: 'nv-toast-icon', 'aria-hidden': 'true' });
    if (o.icon && o.icon.nodeType) box.append(o.icon);
    else if (!o.icon && o.type === 'loading') box.append(Nova.h('span', { class: 'nv-spinner' }));
    else box.innerHTML = Nova.icon(o.icon || ICON[o.type], { size: 18, stroke: 2.2 }); // 只接受图标名，输出可信 SVG
    return box;
  }

  function fill(it) {
    const { o, el } = it;
    const hadFocus = el.contains(document.activeElement);
    el.dataset.type = o.type;
    el.setAttribute('role', o.type === 'error' ? 'alert' : 'status');
    el.setAttribute('aria-live', o.type === 'error' ? 'assertive' : 'polite');
    el.setAttribute('aria-atomic', 'true');
    const has = (v) => v != null && v !== '' && v !== false;
    let actions = null;
    if (o.action && has(o.action.label)) {
      actions = Nova.h('div', { class: 'nv-toast-actions' },
        Nova.h('button', {
          type: 'button',
          class: 'nv-btn nv-toast-action',
          'data-size': 'xs',
          'data-variant': 'outline',
          onClick: (e) => {
            const keep = o.action.onClick && o.action.onClick(e, handle(it.id));
            if (keep !== false) dismiss(it.id, 'action');
          },
        }, o.action.label));
    }
    el.replaceChildren(...[
      iconNode(o),
      Nova.h('div', { class: 'nv-toast-body' },
        Nova.h('div', { class: 'nv-toast-title' }, has(o.title) ? o.title : null),
        has(o.description) ? Nova.h('div', { class: 'nv-toast-desc' }, o.description) : null,
        actions),
      o.closable ? Nova.h('button', {
        type: 'button',
        class: 'nv-toast-close',
        'aria-label': o.closeLabel || cfg.closeLabel,
        html: Nova.icon('x', { size: 15 }),
        onClick: () => dismiss(it.id, 'close'),
      }) : null,
      o.duration > 0 ? Nova.h('span', { class: 'nv-toast-progress', 'aria-hidden': 'true' }) : null,
    ].filter(Boolean));
    el.style.setProperty('--_dur', `${o.duration}ms`);
    if (hadFocus) el.focus({ preventScroll: true }); // 内容重建后焦点不丢
  }

  /* ———————— 计时（悬停 / 聚焦 / 页面隐藏时暂停，进度条同步） ———————— */
  function schedule(it) {
    clearTimeout(it.t);
    it.t = 0;
    if (it.closing || it.o.duration <= 0) { it.el.removeAttribute('data-paused'); return; }
    if (it.rem == null) it.rem = it.o.duration;
    if (it.hover || it.focus || document.hidden) { it.el.setAttribute('data-paused', ''); return; }
    it.el.removeAttribute('data-paused');
    it.start = Date.now();
    it.t = setTimeout(() => dismiss(it.id, 'timeout'), it.rem);
  }
  function pause(it) {
    if (it.closing) return;
    if (it.t) {
      clearTimeout(it.t);
      it.t = 0;
      it.rem = Math.max(0, it.rem - (Date.now() - it.start));
    }
    if (it.o.duration > 0) it.el.setAttribute('data-paused', '');
  }
  function resume(it) {
    if (it.closing || it.hover || it.focus || document.hidden) return;
    if (it.o.duration > 0 && !it.t) schedule(it);
  }

  function bind(it) {
    const { el } = it;
    el.addEventListener('pointerenter', () => { it.hover = true; pause(it); });
    el.addEventListener('pointerleave', () => { it.hover = false; resume(it); });
    // 鼠标点击引起的聚焦不算「键盘聚焦」：只由悬停负责暂停，指针离开后照常继续计时
    el.addEventListener('pointerdown', () => { it.pointer = true; }, true);
    const release = () => setTimeout(() => { it.pointer = false; });
    el.addEventListener('pointerup', release, true);
    el.addEventListener('pointercancel', release, true);
    el.addEventListener('focusin', () => {
      if (it.pointer || it.focus) return;
      it.focus = true;
      pause(it);
    });
    el.addEventListener('focusout', (e) => {
      if (e.relatedTarget && el.contains(e.relatedTarget)) return;
      if (!it.focus) return;
      it.focus = false;
      resume(it);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); dismiss(it.id, 'close'); }
    });
  }

  /* ———————— API ———————— */
  const handle = (id) => ({ id, update: (patch) => update(id, patch), dismiss: () => dismiss(id) });

  function show(opts = {}) {
    if (typeof opts === 'string' || (opts && opts.nodeType)) opts = { title: opts };
    const id = opts.id != null && opts.id !== '' ? String(opts.id) : `nv-toast-${++seed}`;
    if (items.has(id)) return update(id, opts);
    const o = normalize(opts);
    const pos = POSITIONS.includes(o.position) ? o.position : (POSITIONS.includes(cfg.position) ? cfg.position : 'top-center');
    const r = region(pos);
    const el = Nova.h('div', { class: 'nv-toast', tabindex: '-1', 'data-id': id, 'data-state': 'open' });
    const it = { id, el, o, pos, rem: null, t: 0, start: 0, hover: false, focus: false, closing: false };
    items.set(id, it);
    fill(it);
    bind(it);
    const top = pos.startsWith('top');
    flip(r, () => (top ? r.prepend(el) : r.append(el))); // 新提示贴近屏幕边缘
    // 超出上限：移除最旧的（带退场动画）
    const live = [...r.children].filter((n) => n.dataset.state !== 'closed');
    const extra = live.length - Math.max(1, cfg.max);
    if (extra > 0) (top ? live.slice(-extra) : live.slice(0, extra)).forEach((n) => dismiss(n.dataset.id, 'overflow'));
    schedule(it);
    return handle(id);
  }

  function update(id, patch = {}) {
    id = String(id);
    const it = items.get(id);
    if (!it) return handle(id);
    if (typeof patch === 'string') patch = { title: patch };
    const merged = { ...it.o, ...patch };
    if (patch.type && patch.duration == null) delete merged.duration; // 换类型时按新类型重新取默认时长
    const typeChanged = patch.type && patch.type !== it.o.type;
    it.o = normalize(merged);
    it.rem = null;
    flip(it.el.parentNode, () => fill(it));
    if (typeChanged && !Nova.reducedMotion()) {
      const ic = it.el.querySelector('.nv-toast-icon');
      if (ic) ic.setAttribute('data-pop', '');
    }
    schedule(it);
    return handle(id);
  }

  function dismiss(id, reason = 'dismiss') {
    if (id == null) { dismissAll(); return; }
    const it = items.get(String(id));
    if (!it || it.closing) return;
    it.closing = true;
    items.delete(it.id);
    clearTimeout(it.t);
    const { el } = it;
    if (el.contains(document.activeElement)) {
      if (it.focus) {
        // 键盘焦点在这条提示里：交给同容器的下一条，否则还给 Alt+T 之前的元素
        const next = [...el.parentNode.children].find((n) => n !== el && n.dataset.state !== 'closed');
        if (next) next.focus({ preventScroll: true });
        else if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
        else document.activeElement.blur();
      } else document.activeElement.blur(); // 鼠标点击：不把焦点塞给别的提示
    }
    Nova.animateOut(el, () => {
      flip(el.parentNode, () => el.remove());
      if (typeof it.o.onClose === 'function') it.o.onClose({ id: it.id, reason });
    });
  }

  function dismissAll() {
    [...items.keys()].forEach((id) => dismiss(id));
  }

  /** 生成某个结果对应的更新：字符串 / 函数(value) → 字符串或选项对象 */
  function outcome(msg, value, type, fallback) {
    const r = typeof msg === 'function' ? msg(value) : msg;
    if (r && typeof r === 'object' && !r.nodeType) return { description: null, ...r, type };
    return { title: r == null || r === '' ? fallback : r, description: null, type };
  }

  function promise(p, msgs = {}) {
    if (typeof p === 'function') p = p();
    const lo = msgs.loading && typeof msgs.loading === 'object' && !msgs.loading.nodeType ? msgs.loading : { title: msgs.loading || cfg.loadingText };
    const h = show({ ...lo, id: msgs.id ?? lo.id, position: msgs.position ?? lo.position, type: 'loading' });
    Promise.resolve(p).then(
      (v) => h.update(outcome(msgs.success, v, 'success', cfg.successText)),
      (e) => h.update(outcome(msgs.error, e, 'error', cfg.errorText))
    );
    return p;
  }

  const typed = (type) => (title, opts) =>
    show(title && typeof title === 'object' && !title.nodeType ? { ...title, type } : { ...opts, title, type });

  function config(c = {}) {
    Object.assign(cfg, c);
    for (const r of regions.values()) r.setAttribute('aria-label', cfg.hotkey ? `${cfg.regionLabel}（Alt+T）` : cfg.regionLabel);
    if (document.body && POSITIONS.includes(cfg.position)) region(cfg.position);
    return { ...cfg };
  }

  /* Alt+T：聚焦最新一条提示（键盘用户可以够到其中的操作按钮） */
  document.addEventListener('keydown', (e) => {
    if (!cfg.hotkey || !e.altKey || e.ctrlKey || e.metaKey || e.code !== 'KeyT') return;
    const latest = [...items.values()].pop();
    if (!latest) return;
    e.preventDefault();
    if (!latest.el.contains(document.activeElement)) returnFocus = document.activeElement;
    latest.el.focus({ preventScroll: true });
  });
  document.addEventListener('visibilitychange', () => {
    items.forEach((it) => (document.hidden ? pause(it) : resume(it)));
  });
  // 预先创建默认位置的容器：读屏要求实时区域先存在，第一条提示才能可靠播报
  Nova.ready(() => region(POSITIONS.includes(cfg.position) ? cfg.position : 'top-center'));

  const toast = (titleOrOptions, opts) =>
    show(titleOrOptions && typeof titleOrOptions === 'object' && !titleOrOptions.nodeType ? titleOrOptions : { ...opts, title: titleOrOptions });
  Object.assign(toast, {
    show,
    success: typed('success'),
    error: typed('error'),
    warning: typed('warning'),
    info: typed('info'),
    loading: typed('loading'),
    update,
    dismiss: (id) => dismiss(id),
    dismissAll,
    promise,
    config,
  });
  Nova.toast = toast;
})();

;
/* src/components/spinner/spinner.js */
/* DomSprig-UI · Spinner / Loader
 * 1. .nv-loader：自动补齐动画所需的子元素；没有名称时补 role="status" 与 aria-label（data-label 覆盖，默认「加载中」）。
 * 2. Nova.loading(container, { text, desc, fullscreen }) → { update(text), hide() }
 *    在容器上盖加载遮罩（容器会被设为 position:relative 与 aria-busy="true"），返回控制对象。
 *    Nova.loading.hide(container) 关闭容器上的遮罩。
 */
(() => {
  const { Nova } = window;
  const COUNT = { dots: 3, bars: 4, pulse: 1, ring: 0 };

  Nova.define('loader', '.nv-loader', (el) => {
    const o = Nova.opts(el, { variant: 'dots', label: '加载中' });
    const need = COUNT[o.variant] ?? 3;
    const have = el.querySelectorAll(':scope > i').length;
    for (let i = have; i < need; i++) el.append(document.createElement('i'));
    // 在已有名称的状态区域（如加载遮罩）内时只作装饰
    const inLabelledStatus = el.parentElement && el.parentElement.closest('[role="status"], [role="progressbar"], .nv-loading-overlay');
    if (inLabelledStatus) el.setAttribute('aria-hidden', 'true');
    else if (el.getAttribute('aria-hidden') !== 'true') {
      if (!el.hasAttribute('role')) el.setAttribute('role', 'status');
      if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) el.setAttribute('aria-label', o.label);
    }
    return {};
  });

  // 声明式遮罩：补 role / aria-live，并把宿主标记为忙碌
  Nova.define('loading-overlay', '.nv-loading-overlay', (el) => {
    if (!el.hasAttribute('role')) el.setAttribute('role', 'status');
    if (!el.hasAttribute('aria-live')) el.setAttribute('aria-live', 'polite');
    const host = el.parentElement;
    const sync = () => host && !el.hasAttribute('data-fullscreen') && host.setAttribute('aria-busy', String(!el.hidden));
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(el, { attributes: true, attributeFilter: ['hidden'] });
    return { destroy: () => mo.disconnect() };
  });

  const overlays = new WeakMap();

  function loading(container, opts = {}) {
    if (typeof container === 'string') container = document.querySelector(container);
    if (typeof opts === 'string') opts = { text: opts };
    const fullscreen = !!opts.fullscreen || !container || container === document.body;
    const host = fullscreen ? document.body : container;
    const prev = overlays.get(host);
    if (prev) { prev.update(opts.text, opts.desc); return prev; }

    const variant = opts.variant || 'ring';
    const text = Nova.h('div', { class: 'nv-loading-overlay-text', text: opts.text ?? '加载中…' });
    const desc = Nova.h('div', { class: 'nv-loading-overlay-desc', text: opts.desc || '' });
    desc.hidden = !opts.desc;
    const loader = Nova.h('span', { class: 'nv-loader', 'data-variant': variant, 'data-size': opts.size || 'lg', 'aria-hidden': 'true' });
    for (let i = 0; i < (COUNT[variant] ?? 3); i++) loader.append(document.createElement('i'));
    const overlay = Nova.h('div', {
      class: 'nv-loading-overlay', role: 'status', 'aria-live': 'polite', 'data-fullscreen': fullscreen || null,
    }, loader, text, desc);

    let restorePos = null;
    if (!fullscreen && getComputedStyle(host).position === 'static') {
      restorePos = host.style.position;
      host.style.position = 'relative';
    }
    const busyBefore = host.getAttribute('aria-busy');
    if (!fullscreen) host.setAttribute('aria-busy', 'true');
    const release = fullscreen ? Nova.lockScroll() : null;
    host.append(overlay);

    let closed = false;
    const ctl = {
      el: overlay,
      update(t, d) {
        if (t != null) text.textContent = t;
        if (d !== undefined) { desc.textContent = d || ''; desc.hidden = !d; }
      },
      hide() {
        if (closed) return;
        closed = true;
        overlays.delete(host);
        release && release();
        const done = () => {
          overlay.remove();
          if (restorePos != null) host.style.position = restorePos;
          if (!fullscreen) {
            if (busyBefore == null) host.removeAttribute('aria-busy');
            else host.setAttribute('aria-busy', busyBefore);
          }
          Nova.emit(host, 'nv:loaded');
        };
        Nova.animateOut(overlay, done);
      },
    };
    overlays.set(host, ctl);
    return ctl;
  }
  loading.hide = (container) => {
    if (typeof container === 'string') container = document.querySelector(container);
    const ctl = overlays.get(container || document.body);
    ctl && ctl.hide();
  };
  Nova.loading = loading;
})();

;
/* src/components/skeleton/skeleton.js */
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

;
/* src/components/empty/empty.js */
/* DomSprig-UI · Empty
 * - 按 data-image 注入内置线性插画（装饰性，aria-hidden）；已有 .nv-empty-image / .nv-empty-icon 时保留作者内容
 * - 没写标题/描述时补上该类型的默认文案；data-title / data-description 或 Nova.empty.texts 可覆盖
 * - data-image / data-title / data-description 变化时自动重绘
 * 扩展：Nova.empty.images.cart = (id) => '<svg …>'（可信字符串）；Nova.empty.texts.cart = { title, description }
 */
(() => {
  const { Nova } = window;

  const svg = (body) =>
    `<svg viewBox="0 0 160 120" fill="none" stroke-linecap="round" stroke-linejoin="round" focusable="false">${body}</svg>`;
  const BASE = '<circle class="nv-empty-halo" cx="80" cy="58" r="50"/><ellipse class="nv-empty-ground" cx="80" cy="106" rx="50" ry="5.5"/>';

  const IMAGES = {
    // 打开的空纸箱
    default: () => svg(`${BASE}
      <path class="nv-empty-shade" d="M56 50h48l10 12H46z"/>
      <path class="nv-empty-paper" d="M46 62 32 53l12-11 12 8z"/>
      <path class="nv-empty-paper" d="m114 62 14-9-12-11-12 8z"/>
      <path class="nv-empty-paper" d="M46 62h68v32a4 4 0 0 1-4 4H50a4 4 0 0 1-4-4z"/>
      <path class="nv-empty-stroke" d="M70 77h20"/>
      <circle class="nv-empty-accent-dot" cx="80" cy="32" r="3"/>
      <path class="nv-empty-accent" d="M61 22v7M57.5 25.5h7M99 16v5M96.5 18.5h5"/>`),
    // 文档 + 放大镜
    search: () => svg(`${BASE}
      <rect class="nv-empty-paper" x="40" y="20" width="62" height="78" rx="7"/>
      <path class="nv-empty-faint" d="M52 36h30M52 47h38M52 58h22M52 69h16"/>
      <path class="nv-empty-stroke" d="m113 86 13 13" stroke-width="6"/>
      <circle class="nv-empty-lens" cx="100" cy="72" r="18"/>
      <path class="nv-empty-accent" d="M90.5 66a11 11 0 0 1 7-5.5"/>
      <path class="nv-empty-stroke" d="m95.5 71.5 9 9m0-9-9 9"/>`),
    // 收件盘 + 信封
    inbox: () => svg(`${BASE}
      <path class="nv-empty-paper" d="m38 74 14-20h56l14 20v20a4 4 0 0 1-4 4H42a4 4 0 0 1-4-4z"/>
      <path class="nv-empty-shade" d="M53 55.5h54l11.6 17.5H99l-6 9H67l-6-9H41.4z"/>
      <path class="nv-empty-stroke" d="M38 74h22l6 9h28l6-9h22"/>
      <rect class="nv-empty-accent-soft" x="62" y="18" width="36" height="25" rx="4"/>
      <path class="nv-empty-accent" d="m63.5 21.5 16.5 11 16.5-11"/>
      <path class="nv-empty-faint" d="M80 49v3" stroke-width="2.5"/>
      <path class="nv-empty-faint" d="M52 26h4M104 26h4M55 36h3M102 36h3" stroke-width="2.5"/>`),
    // 浏览器窗口 + 警示
    error: () => svg(`${BASE}
      <rect class="nv-empty-paper" x="32" y="22" width="96" height="72" rx="8"/>
      <path class="nv-empty-stroke" d="M32 37h96"/>
      <circle class="nv-empty-dot" cx="42" cy="29.5" r="2"/><circle class="nv-empty-dot" cx="49" cy="29.5" r="2"/><circle class="nv-empty-dot" cx="56" cy="29.5" r="2"/>
      <path class="nv-empty-faint" d="M44 84h18M98 84h18" stroke-width="2.5"/>
      <path class="nv-empty-accent-soft" d="M80 46.5 97 77H63z"/>
      <path class="nv-empty-accent" d="M80 57v9" stroke-width="2.5"/>
      <circle class="nv-empty-accent-dot" cx="80" cy="71.5" r="1.8"/>`),
    // 断开的云
    network: (id) => svg(`${BASE}
      <mask id="${id}-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="160" height="120">
        <rect width="160" height="120" fill="#fff"/><path d="M58 24l46 70" stroke="#000" stroke-width="10"/>
      </mask>
      <g mask="url(#${id}-cut)">
        <path class="nv-empty-paper" transform="translate(32 10) scale(4)" vector-effect="non-scaling-stroke" d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
        <path class="nv-empty-faint" d="M62 74h36" stroke-width="2.5"/>
      </g>
      <path class="nv-empty-accent" d="M58 24l46 70" stroke-width="3"/>`),
  };

  const TEXTS = {
    default: { title: '暂无数据', description: '这里还没有任何内容。' },
    search: { title: '没有找到相关结果', description: '换个关键词，或减少筛选条件后再试试。' },
    inbox: { title: '暂无消息', description: '新的通知和消息会显示在这里。' },
    error: { title: '加载失败', description: '服务暂时不可用，请稍后重试。' },
    network: { title: '网络连接已断开', description: '请检查网络设置，恢复连接后刷新页面。' },
  };

  Nova.empty = {
    images: IMAGES,
    texts: TEXTS,
    /** 重绘指定元素；不传参数时重绘页面上全部空状态（注册新插画/改文案后调用） */
    refresh(el) {
      const list = el ? [typeof el === 'string' ? document.querySelector(el) : el] : document.querySelectorAll('.nv-empty');
      list.forEach((x) => x && Nova.get(x, 'empty')?.refresh());
    },
  };

  const own = (el, sel) => [...el.children].find((c) => c.matches(sel) && !c.hasAttribute('data-nv-injected')) || null;

  Nova.define('empty', '.nv-empty', (el) => {
    let nodes = []; // 本组件注入的节点

    function render() {
      nodes.forEach((n) => n.remove());
      nodes = [];
      const d = el.dataset;
      const name = d.image || 'default';
      const imageKey = Nova.empty.images[name] ? name : 'default';
      const texts = Nova.empty.texts[name] || Nova.empty.texts[imageKey] || Nova.empty.texts.default || {};

      // 插画
      let anchor = own(el, '.nv-empty-image, .nv-empty-icon');
      if (!anchor && name !== 'none') {
        const art = Nova.empty.images[imageKey];
        const html = typeof art === 'function' ? art(Nova.uid('nv-empty')) : String(art || '');
        if (html) {
          anchor = Nova.h('div', { class: 'nv-empty-image', 'aria-hidden': 'true', 'data-nv-injected': '', html });
          el.prepend(anchor);
          nodes.push(anchor);
        }
      }

      // 文案
      const title = own(el, '.nv-empty-title');
      const desc = own(el, '.nv-empty-desc');
      let after = title || anchor;
      if (!title) {
        const text = 'title' in d ? d.title : texts.title;
        if (text) {
          const t = Nova.h('div', { class: 'nv-empty-title', 'data-nv-injected': '', text });
          if (after) after.after(t); else el.prepend(t);
          nodes.push(t);
          after = t;
        }
      }
      if (!desc) {
        // 作者已写标题时不再补默认描述，避免文案不搭
        const text = 'description' in d ? d.description : title ? '' : texts.description;
        if (text) {
          const t = Nova.h('div', { class: 'nv-empty-desc', 'data-nv-injected': '', text });
          if (after) after.after(t); else el.prepend(t);
          nodes.push(t);
        }
      }
    }
    render();

    const mo = new MutationObserver(render);
    mo.observe(el, { attributes: true, attributeFilter: ['data-image', 'data-title', 'data-description'] });

    return {
      refresh: render,
      destroy() {
        mo.disconnect();
        nodes.forEach((n) => n.remove());
        nodes = [];
      },
    };
  });
})();

;
/* src/components/modal/modal.js */
/* DomSprig-UI · Modal 对话框
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

;
/* src/components/drawer/drawer.js */
/* DomSprig-UI · Drawer 抽屉
 * 与 Modal 共用同一套模态内核（Nova.modal._register）：焦点陷阱、滚动锁定、Esc / 遮罩关闭、嵌套、还焦、退场动画。
 * <div class="nv-drawer" id="d1" data-side="right" hidden aria-labelledby="d1-title"><div class="nv-drawer-panel">…</div></div>
 * 打开：[data-nv-drawer-open="#d1"] 或 Nova.drawer.open(el)；关闭：[data-nv-drawer-close] / .nv-drawer-close、Esc、遮罩
 * 事件：nv:open / nv:close（detail.reason）
 */
(() => {
  const { Nova } = window;
  Nova.drawer = Nova.modal._register('drawer');
})();

;
/* src/components/popover/popover.js */
/* DomSprig-UI · Popover 弹出层
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

;
/* src/components/tooltip/tooltip.js */
/* DomSprig-UI · Tooltip
 * 事件委托，无需初始化：任意元素加 data-tip="说明" 即可，动态渲染的内容也自动生效。
 * - 悬停 / 键盘聚焦 300ms 后显示（data-tip-delay 覆盖）；刚关闭 500ms 内移到下一个目标立即显示。
 * - 移出、失焦、Esc、按下、滚动、缩放时立即隐藏；全页只有一个提示节点（role=tooltip）。
 * - (hover:none) 的触摸设备不显示，关键信息不要只放在提示里。
 * Nova.tooltip.show(el) / .hide() / .config({ delay, skipDelay, offset }) / .current
 */
(() => {
  const { Nova } = window;
  const ID = 'nv-tooltip';
  const SEL = '[data-tip], [data-tip-overflow]';
  const cfg = { delay: 300, skipDelay: 500, offset: 9 };
  const noHover = window.matchMedia('(hover: none)');

  let node = null; // 共享提示节点（首次使用时创建）
  let cur = null; // 当前目标：等待显示或正在显示
  let timer = 0;
  let visible = false;
  let lastHide = 0; // 上一个可见提示关闭的时间，用于跳过延迟
  let pointerDown = false;
  let suppressed = null; // 按下过的目标：指针离开前不再显示
  let watcher = null; // 显示期间监听目标被移除

  const find = (t) => (t && t.closest ? t.closest(SEL) : null);
  const num = (v, d) => (v == null || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
  const content = (t) => {
    const tip = t.getAttribute('data-tip');
    if (tip && tip.trim()) return tip;
    return 'tipOverflow' in t.dataset ? t.textContent.trim() : '';
  };
  const truncated = (t) => t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > t.clientHeight + 1;
  const eligible = (t) => t.isConnected && !!content(t) && !('tipOverflow' in t.dataset && !truncated(t));

  function ensure() {
    if (!node) {
      node = Nova.h('div', { class: 'nv-tooltip', id: ID, role: 'tooltip', 'data-nv-layer-ignore': '', hidden: true });
    }
    if (!node.isConnected) document.body.appendChild(node);
    return node;
  }

  /* aria-describedby：保留元素原有的描述 id，只追加/移除自己的 */
  function link(t) {
    const ids = (t.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    if (!ids.includes(ID)) t.setAttribute('aria-describedby', [...ids, ID].join(' '));
  }
  function unlink(t) {
    const ids = (t.getAttribute('aria-describedby') || '').split(/\s+/).filter((x) => x && x !== ID);
    if (ids.length) t.setAttribute('aria-describedby', ids.join(' '));
    else t.removeAttribute('aria-describedby');
  }

  function fill(t) {
    const n = ensure();
    const title = t.getAttribute('data-tip-title');
    n.replaceChildren(
      ...(title ? [Nova.h('span', { class: 'nv-tooltip-title', text: title })] : []),
      Nova.h('span', { class: 'nv-tooltip-text', text: content(t) })
    );
    n.toggleAttribute('data-titled', !!title);
  }

  function reveal(instant) {
    timer = 0;
    const t = cur;
    if (!t || !t.isConnected) { hide(); return; }
    const n = ensure();
    Nova.portal(n, t); // 在 <dialog open> 内时挂到 dialog，避免被顶层遮住
    n.hidden = false;
    // 先回到原点再测量，避免上次的 left 压缩 max-content 宽度
    n.style.left = '0px';
    n.style.top = '0px';
    n.toggleAttribute('data-instant', !!instant);
    n.dataset.state = 'open';
    Nova.position(n, t, { placement: t.getAttribute('data-tip-placement') || 'top', offset: cfg.offset, padding: 8, arrow: true });
    visible = true;
    watch();
  }

  function watch() {
    if (watcher || !('MutationObserver' in window)) return;
    watcher = new MutationObserver(() => { if (cur && !cur.isConnected) hide(); });
    watcher.observe(document.body, { childList: true, subtree: true });
  }

  /** 立即隐藏；返回是否真的关掉了一个可见的提示 */
  function hide() {
    clearTimeout(timer);
    timer = 0;
    if (cur) { unlink(cur); cur = null; }
    if (watcher) { watcher.disconnect(); watcher = null; }
    if (!visible) return false;
    visible = false;
    lastHide = Date.now();
    const n = node;
    Nova.animateOut(n, () => { n.hidden = true; });
    return true;
  }

  function schedule(t, { force = false } = {}) {
    if (t === cur) return;
    hide();
    if ((!force && noHover.matches) || !eligible(t)) return;
    cur = t;
    fill(t); // 提前写入内容并关联，读屏在聚焦时即可读到描述
    link(t);
    const skip = Date.now() - lastHide < cfg.skipDelay;
    const delay = force || skip ? 0 : Math.max(0, num(t.getAttribute('data-tip-delay'), cfg.delay));
    if (delay === 0) reveal(skip && !force);
    else timer = setTimeout(() => reveal(false), delay);
  }

  /* —— 指针 —— */
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const t = find(e.target);
    if (t && t !== suppressed) schedule(t);
  });
  document.addEventListener('pointerout', (e) => {
    const rel = e.relatedTarget;
    if (suppressed && suppressed.contains(e.target) && !(rel && suppressed.contains(rel))) suppressed = null;
    if (!cur || !cur.contains(e.target) || (rel && cur.contains(rel))) return;
    hide();
  });
  document.addEventListener('pointerdown', (e) => {
    pointerDown = true;
    suppressed = find(e.target);
    hide();
  }, true);
  const release = () => setTimeout(() => { pointerDown = false; });
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);

  /* —— 键盘聚焦 —— */
  document.addEventListener('focusin', (e) => {
    if (pointerDown) return; // 鼠标点击引起的聚焦不显示
    const t = find(e.target);
    if (t) schedule(t);
  });
  document.addEventListener('focusout', (e) => {
    if (!cur || !cur.contains(e.target)) return;
    if (e.relatedTarget && cur.contains(e.relatedTarget)) return;
    hide();
  });

  /* Esc：窗口捕获阶段先于浮层栈执行。提示可见时只关提示，不让下面的弹窗/弹出层一起关闭 */
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.isComposing || !cur) return;
    if (hide()) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  /* 滚动 / 缩放：已显示的立即隐藏；等待中的不取消（键盘 Tab 引起的滚动不应吞掉提示，显示时会重新测量位置） */
  const onViewportChange = () => { if (visible) hide(); };
  window.addEventListener('scroll', onViewportChange, true);
  window.addEventListener('resize', onViewportChange);

  /* .nv-tip-icon 为空时填入 info 图标 */
  Nova.define('tip-icon', '.nv-tip-icon', (el) => {
    if (!el.firstElementChild && !el.textContent.trim()) el.innerHTML = Nova.icon('info', { size: 16, stroke: 1.8 });
    if (el.tagName === 'BUTTON' && !el.hasAttribute('type')) el.type = 'button';
  });

  Nova.tooltip = {
    /** 立即为 el 显示提示（忽略延迟与触摸设备限制，适合引导/演示） */
    show(el) {
      if (typeof el === 'string') el = document.querySelector(el);
      if (!el) return;
      if (el === cur) { if (!visible) { clearTimeout(timer); reveal(false); } return; }
      schedule(el, { force: true });
    },
    hide,
    /** 全局默认：delay 显示延迟、skipDelay 连续切换免延迟窗口、offset 与目标的间距 */
    config(o = {}) {
      Object.assign(cfg, o);
      return { ...cfg };
    },
    get current() { return visible ? cur : null; },
  };
})();

;
/* src/components/dropdown/dropdown.js */
/* DomSprig-UI · Dropdown 下拉菜单（WAI-ARIA APG Menu Button）
 * <button data-nv-dropdown="#m1">操作</button>
 * <div class="nv-menu" id="m1" hidden>
 *   <div class="nv-panel-label">分组标题</div>
 *   <button class="nv-item" role="menuitem">新建<kbd class="nv-item-kbd">Ctrl N</kbd></button>
 *   <button class="nv-item" role="menuitemcheckbox" aria-checked="true">显示网格</button>
 *   <div role="group"><button class="nv-item" role="menuitemradio" aria-checked="true">…</button></div>
 *   <button class="nv-item" role="menuitem" data-nv-submenu="#sub">分享到</button>
 *   <hr class="nv-panel-sep">
 *   <button class="nv-item" role="menuitem" data-color="danger">删除</button>
 * </div>
 * 右键菜单：<div data-nv-context-menu="#m1">…</div> 在指针位置打开。
 * 事件（在触发器 / 右键区域上）：nv:open、nv:close、nv:select（detail: { item, value, checked, target }）
 * Nova.dropdown.open(trigger) / close(trigger) / toggle(trigger) / isOpen(trigger)
 */
(() => {
  const { Nova } = window;
  const ITEM = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';
  const menus = new Map(); // 选择器 → 菜单元素（关闭后菜单会从 DOM 移除，这里保留引用）
  const owners = new WeakMap(); // 菜单 → 正在使用它的根控制器（同一菜单被多个触发器共用时互斥）
  const prepared = new WeakSet();

  const findMenu = (sel) => {
    if (!sel) return null;
    const el = document.querySelector(sel) || menus.get(sel) || null;
    if (el) menus.set(sel, el);
    return el;
  };
  const ownItems = (menu) => [...menu.querySelectorAll(ITEM)].filter((el) => el.closest('.nv-menu') === menu);
  const isDisabled = (el) => el.getAttribute('aria-disabled') === 'true';
  const labelOf = (item) => {
    const label = item.querySelector('.nv-item-label');
    if (label) return label.textContent.trim();
    const clone = item.cloneNode(true);
    clone.querySelectorAll('.nv-item-kbd, .nv-item-desc, .nv-menu-indicator, .nv-menu-sub-icon').forEach((n) => n.remove());
    return clone.textContent.trim();
  };

  function prepareMenu(menu) {
    if (!prepared.has(menu)) {
      prepared.add(menu);
      menu.classList.add('nv-panel');
      if (!menu.hasAttribute('role')) menu.setAttribute('role', 'menu');
      if (!menu.id) menu.id = Nova.uid('nv-menu');
      menu.tabIndex = -1;
    }
    // 每次打开都整理一遍菜单项，动态增删的项也能正确工作
    for (const item of ownItems(menu)) {
      item.classList.add('nv-item');
      item.tabIndex = -1;
      if (item.tagName === 'BUTTON' && !item.hasAttribute('type')) item.type = 'button';
      if (item.disabled) item.setAttribute('aria-disabled', 'true');
      const role = item.getAttribute('role');
      if ((role === 'menuitemcheckbox' || role === 'menuitemradio') && !item.querySelector(':scope > .nv-menu-indicator')) {
        if (!item.hasAttribute('aria-checked')) item.setAttribute('aria-checked', 'false');
        item.prepend(Nova.h('span', {
          class: 'nv-menu-indicator',
          'data-type': role === 'menuitemradio' ? 'radio' : 'checkbox',
          'aria-hidden': 'true',
          html: role === 'menuitemradio' ? '' : Nova.icon('check', { size: 14, stroke: 2.5 }),
        }));
      }
      if (item.hasAttribute('data-nv-submenu')) {
        item.setAttribute('aria-haspopup', 'menu');
        if (!item.hasAttribute('aria-expanded')) item.setAttribute('aria-expanded', 'false');
        if (!item.querySelector(':scope > .nv-menu-sub-icon')) {
          item.append(Nova.h('span', { class: 'nv-menu-sub-icon', 'aria-hidden': 'true', html: Nova.icon('chevron-right', { size: 16 }) }));
        }
      }
    }
    for (const sep of menu.querySelectorAll('.nv-panel-sep')) if (!sep.hasAttribute('role')) sep.setAttribute('role', 'separator');
    for (const label of menu.querySelectorAll('.nv-panel-label')) {
      // 分组标题：作为所在 role=group 的名称；不在分组内时对读屏隐藏（菜单内只允许菜单项）
      const group = label.closest('[role="group"]');
      if (group && group.closest('.nv-menu') === menu && !group.hasAttribute('aria-labelledby')) {
        if (!label.id) label.id = Nova.uid('nv-menu-label');
        group.setAttribute('aria-labelledby', label.id);
      } else if (!group && !label.hasAttribute('role')) label.setAttribute('role', 'presentation');
    }
  }

  /**
   * 打开一个菜单（根菜单或子菜单），返回控制器 ctl。
   * o: { placement, offset, parent, owner, focus: 'first'|'last'|'menu'|'none', target, onClose(reason, hadFocus) }
   */
  function openMenu(menu, anchor, o) {
    prepareMenu(menu);
    menu.hidden = false;
    menu.toggleAttribute('data-sub', !!o.parent);
    const ctl = { menu, anchor, parent: o.parent || null, child: null, owner: o.owner, target: o.target, subTimer: 0, closed: false };
    ctl.root = ctl.parent ? ctl.parent.root : ctl;
    const nav = Nova.roving(() => ownItems(menu), {
      onChange: (el) => el && el.focus({ preventScroll: true }),
    });
    ctl.nav = nav;

    const f = Nova.floating(menu, anchor, {
      placement: o.placement,
      offset: o.offset,
      onDismiss: (reason) => {
        if (reason === 'escape' && ctl.parent) ctl.close('escape', { focusAnchor: true });
        else ctl.close(reason);
      },
    });

    const openSub = (item, focus) => {
      clearTimeout(ctl.subTimer);
      if (ctl.child && ctl.child.anchor === item) {
        if (focus === 'first') ctl.child.nav.first();
        return;
      }
      if (ctl.child) ctl.child.close('switch');
      const sub = findMenu(item.dataset.nvSubmenu);
      if (!sub || isDisabled(item)) return;
      item.setAttribute('aria-expanded', 'true');
      ctl.child = openMenu(sub, item, { placement: 'right-start', offset: 4, parent: ctl, owner: ctl.owner, target: ctl.target, focus });
    };
    const closeSub = () => { clearTimeout(ctl.subTimer); if (ctl.child) ctl.child.close('switch'); };

    let lastKey = '';
    function activate(item) {
      const role = item.getAttribute('role');
      let checked;
      if (role === 'menuitemcheckbox') {
        checked = item.getAttribute('aria-checked') !== 'true';
        item.setAttribute('aria-checked', String(checked));
      } else if (role === 'menuitemradio') {
        const group = item.closest('[role="group"]') || menu;
        for (const r of group.querySelectorAll('[role="menuitemradio"]')) {
          if (r.closest('.nv-menu') === menu) r.setAttribute('aria-checked', String(r === item));
        }
        checked = true;
      }
      // 勾选项：点击与空格保持菜单打开、回车关闭；普通项选择后关闭（data-keep-open 可保持）
      const toggleItem = role === 'menuitemcheckbox' || role === 'menuitemradio';
      const keep = item.hasAttribute('data-keep-open') || (toggleItem && lastKey !== 'Enter');
      const detail = { item, value: item.dataset.value ?? labelOf(item), checked, target: ctl.target };
      const owner = ctl.owner;
      if (keep) { Nova.emit(owner, 'nv:select', detail); return; }
      if (item.tagName === 'A' && item.href) {
        // 链接：等浏览器完成跳转的默认行为后再关闭（同步移除会取消跳转）
        Nova.emit(owner, 'nv:select', detail);
        setTimeout(() => ctl.root.close('select'));
        return;
      }
      ctl.root.close('select'); // 先关闭并还焦，再派发事件：回调里打开对话框时焦点能正确回到触发器
      Nova.emit(owner, 'nv:select', detail);
    }

    const onKey = (e) => {
      if (e.isComposing) return;
      const item = nav.active;
      switch (e.key) {
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (!item) return;
          if (item.hasAttribute('data-nv-submenu')) { openSub(item, 'first'); return; }
          lastKey = e.key;
          item.click(); // 统一走 click：链接照常跳转
          lastKey = '';
          return;
        case 'ArrowRight':
          if (item && item.hasAttribute('data-nv-submenu')) { e.preventDefault(); openSub(item, 'first'); }
          return;
        case 'ArrowLeft':
          if (ctl.parent) { e.preventDefault(); ctl.close('left', { focusAnchor: true }); }
          return;
        case 'Tab':
          // APG：Tab 关闭菜单，焦点回到触发器后由浏览器默认行为移到下一个元素
          ctl.root.close('tab');
          return;
        default:
          nav.key(e);
          // 键盘移到其它项时收起已展开的子菜单
          if (ctl.child && nav.active !== ctl.child.anchor) closeSub();
      }
    };
    // 空格的默认激活发生在 keyup：已在 keydown 中处理，这里阻止，避免勾选项被切换两次
    const onKeyUp = (e) => { if (e.key === ' ') e.preventDefault(); };
    const onMove = (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      const item = e.target.closest(ITEM);
      if (!item || item.closest('.nv-menu') !== menu) return;
      if (isDisabled(item)) {
        if (nav.active) { nav.reset(); menu.focus({ preventScroll: true }); }
        return;
      }
      if (nav.active !== item) nav.set(item, { scroll: false });
      if (item.hasAttribute('data-nv-submenu')) {
        if (!ctl.child || ctl.child.anchor !== item) {
          clearTimeout(ctl.subTimer);
          ctl.subTimer = setTimeout(() => openSub(item, 'none'), 100);
        } else clearTimeout(ctl.subTimer);
      } else if (ctl.child) {
        clearTimeout(ctl.subTimer);
        ctl.subTimer = setTimeout(closeSub, 260); // 给斜向移入子菜单留出时间
      }
    };
    const onEnter = () => {
      if (!ctl.parent) return;
      clearTimeout(ctl.parent.subTimer);
      if (ctl.parent.nav.active !== anchor) ctl.parent.nav.set(anchor, { scroll: false });
    };
    const onLeave = (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      if (!ctl.child) clearTimeout(ctl.subTimer);
      if (!ctl.child && nav.active && menu.contains(document.activeElement)) { nav.reset(); menu.focus({ preventScroll: true }); }
    };
    const onClick = (e) => {
      const item = e.target.closest(ITEM);
      if (!item || item.closest('.nv-menu') !== menu) return;
      if (isDisabled(item)) { e.preventDefault(); return; }
      if (item.hasAttribute('data-nv-submenu')) { e.preventDefault(); openSub(item, e.detail === 0 ? 'first' : 'none'); return; }
      activate(item);
    };
    menu.addEventListener('keydown', onKey);
    menu.addEventListener('keyup', onKeyUp);
    menu.addEventListener('pointermove', onMove);
    menu.addEventListener('pointerenter', onEnter);
    menu.addEventListener('pointerleave', onLeave);
    menu.addEventListener('click', onClick);

    ctl.close = (reason, { focusAnchor = false } = {}) => {
      if (ctl.closed) return;
      const ae = document.activeElement;
      const hadFocus = !!(ae && (ae === document.body || (ae.closest && ae.closest('.nv-menu'))));
      ctl.closed = true;
      clearTimeout(ctl.subTimer);
      if (ctl.child) ctl.child.close(reason);
      f.close();
      nav.reset();
      menu.removeEventListener('keydown', onKey);
      menu.removeEventListener('keyup', onKeyUp);
      menu.removeEventListener('pointermove', onMove);
      menu.removeEventListener('pointerenter', onEnter);
      menu.removeEventListener('pointerleave', onLeave);
      menu.removeEventListener('click', onClick);
      if (ctl.parent) {
        ctl.parent.child = null;
        anchor.setAttribute('aria-expanded', 'false');
        if (focusAnchor) { ctl.parent.nav.set(anchor); anchor.focus({ preventScroll: true }); }
      }
      if (o.onClose) o.onClose(reason, hadFocus);
    };

    if (o.focus === 'first') nav.first();
    else if (o.focus === 'last') nav.last();
    else if (o.focus === 'menu') menu.focus({ preventScroll: true });
    return ctl;
  }

  // 同一菜单只允许一处打开：打开前关闭之前的使用者
  const claim = (menu, ctlRef) => {
    const prev = owners.get(menu);
    if (prev && prev !== ctlRef && !prev.closed) prev.close('replace');
  };

  /* ————————————— 下拉菜单触发器 ————————————— */
  Nova.define('dropdown', '[data-nv-dropdown]', (trigger) => {
    const menu = findMenu(trigger.dataset.nvDropdown);
    if (!menu) { console.warn('[Nova] dropdown：找不到菜单', trigger.dataset.nvDropdown); return {}; }
    prepareMenu(menu);
    const o = Nova.opts(trigger, Nova.opts(menu, { placement: 'bottom-start', offset: 6 }));
    if (!trigger.id) trigger.id = Nova.uid('nv-menu-trigger');
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', menu.id);
    let ctl = null;
    const disabled = () => trigger.disabled || trigger.getAttribute('aria-disabled') === 'true';

    function open(focus = 'first') {
      if (disabled()) return;
      if (ctl) {
        if (focus === 'first') ctl.nav.first();
        else if (focus === 'last') ctl.nav.last();
        return;
      }
      claim(menu, null);
      menu.setAttribute('aria-labelledby', trigger.id);
      ctl = openMenu(menu, trigger, {
        placement: o.placement,
        offset: o.offset,
        owner: trigger,
        focus,
        onClose: (reason, hadFocus) => {
          ctl = null;
          trigger.setAttribute('aria-expanded', 'false');
          delete trigger.dataset.state;
          if (reason !== 'replace' && (reason !== 'outside' || hadFocus) && trigger.isConnected) trigger.focus({ preventScroll: true });
          Nova.emit(trigger, 'nv:close', { reason });
        },
      });
      owners.set(menu, ctl);
      trigger.setAttribute('aria-expanded', 'true');
      trigger.dataset.state = 'open';
      Nova.emit(trigger, 'nv:open', { menu });
    }
    const close = (reason = 'api') => ctl && ctl.close(reason);

    const onClick = (e) => {
      if (disabled()) return;
      if (trigger.tagName === 'A') e.preventDefault();
      if (ctl) close('trigger');
      else open(e.detail === 0 ? 'first' : 'menu'); // 键盘（Enter / 空格）聚焦首项；鼠标只聚焦菜单
    };
    const onKey = (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        open(e.key === 'ArrowDown' ? 'first' : 'last');
      } else if (trigger.tagName !== 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        if (ctl) close('trigger'); else open('first');
      }
    };
    trigger.addEventListener('click', onClick);
    trigger.addEventListener('keydown', onKey);
    return {
      open: () => open('first'),
      close: () => close('api'),
      toggle: () => (ctl ? close('api') : open('first')),
      get isOpen() { return !!ctl; },
      menu,
      destroy() {
        close('destroy');
        trigger.removeEventListener('click', onClick);
        trigger.removeEventListener('keydown', onKey);
      },
    };
  });

  /* ————————————— 右键菜单 ————————————— */
  Nova.define('context-menu', '[data-nv-context-menu]', (area) => {
    const menu = findMenu(area.dataset.nvContextMenu);
    if (!menu) { console.warn('[Nova] context-menu：找不到菜单', area.dataset.nvContextMenu); return {}; }
    prepareMenu(menu);
    let ctl = null;
    let stopScroll = null;

    function openAt(x, y, { target = area, viaKeyboard = false } = {}) {
      if (area.getAttribute('aria-disabled') === 'true') return;
      if (ctl) ctl.close('replace');
      claim(menu, null);
      const restoreTo = document.activeElement;
      menu.removeAttribute('aria-labelledby');
      if (!menu.hasAttribute('aria-label')) menu.setAttribute('aria-label', area.dataset.menuLabel || '右键菜单');
      const rect = { left: x, right: x, top: y, bottom: y, width: 0, height: 0 };
      const mine = openMenu(menu, rect, {
        placement: 'bottom-start',
        offset: 2,
        owner: area,
        target,
        focus: viaKeyboard ? 'first' : 'menu',
        onClose: (reason, hadFocus) => {
          if (ctl === mine) ctl = null;
          if (stopScroll && !ctl) { stopScroll(); stopScroll = null; }
          if (reason !== 'replace' && hadFocus && restoreTo && restoreTo !== document.body && restoreTo.isConnected) restoreTo.focus({ preventScroll: true });
          Nova.emit(area, 'nv:close', { reason });
        },
      });
      ctl = mine;
      owners.set(menu, ctl);
      // 与系统菜单一致：页面滚动或窗口缩放时关闭（菜单内部滚动除外）
      if (!stopScroll) {
        const onScroll = (e) => { if (ctl && !(e.target.closest && e.target.closest('.nv-menu'))) ctl.close('scroll'); };
        const onResize = () => ctl && ctl.close('resize');
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onResize);
        stopScroll = () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onResize); };
      }
      Nova.emit(area, 'nv:open', { menu, target, x, y });
    }

    const onContext = (e) => {
      if (area.getAttribute('aria-disabled') === 'true') return;
      e.preventDefault();
      // 键盘（菜单键 / Shift+F10）触发：Chrome 为 PointerEvent，button = -1 且 pointerType 仍是 mouse；
      // Firefox 为 button 0 的 MouseEvent。此时在目标元素左下方打开并聚焦首项
      const viaKeyboard = e.button === -1 || (e.button !== 2 && !['mouse', 'touch', 'pen'].includes(e.pointerType));
      let { clientX: x, clientY: y } = e;
      if (viaKeyboard || (!x && !y)) {
        const r = (e.target.getBoundingClientRect ? e.target : area).getBoundingClientRect();
        x = r.left + Math.min(16, r.width / 2);
        y = r.top + Math.min(r.height, 32);
      }
      openAt(x, y, { target: e.target, viaKeyboard });
    };
    area.addEventListener('contextmenu', onContext);
    return {
      openAt,
      close: () => ctl && ctl.close('api'),
      get isOpen() { return !!ctl; },
      menu,
      destroy() {
        if (ctl) ctl.close('destroy');
        area.removeEventListener('contextmenu', onContext);
      },
    };
  });

  const get = (t, name) => {
    const el = typeof t === 'string' ? document.querySelector(t) : t;
    if (!el) return null;
    return Nova.get(el, name) || (Nova.init(el), Nova.get(el, name));
  };
  Nova.dropdown = {
    open: (t) => get(t, 'dropdown')?.open(),
    close: (t) => get(t, 'dropdown')?.close(),
    toggle: (t) => get(t, 'dropdown')?.toggle(),
    isOpen: (t) => !!get(t, 'dropdown')?.isOpen,
    /** 在指定坐标打开右键菜单：Nova.dropdown.openContext(area, x, y) */
    openContext: (t, x, y) => get(t, 'context-menu')?.openAt(x, y),
  };
})();

;
/* src/components/command/command.js */
/* DomSprig-UI · Command 命令面板
 * 命令式：const h = Nova.command.open({ items, placeholder, emptyText }); h.close()
 *   items: [{ id, label, group, icon, keywords, shortcut, desc, disabled, onSelect }]
 * 内嵌：<div class="nv-command" data-nv-command> <input class="nv-command-input"> <div class="nv-command-list"> .nv-item[data-value]… </div></div>
 *   选择时在根元素派发 nv:select（detail: { value, item }）
 * 模糊匹配：完全一致 > 前缀 > 词首 > 连续子串 > 子序列；同时匹配 keywords（关键词命中不高亮）
 */
(() => {
  const { Nova } = window;

  /* ————————————————— 模糊匹配 ————————————————— */
  const SEP_RE = /[\s\-_/\\.:,;|+·•，。、；：（）()[\]{}<>"'“”‘’!?！？@#&=*~]/;
  const CJK_RE = /[⺀-鿿豈-﫿가-힯぀-ヿ]/;
  const ALNUM_RE = /[a-z0-9]/i;
  /** 逐个 UTF-16 单元转小写，保证下标与原文一一对应（高亮用） */
  const lower = (s) => Array.prototype.map.call(String(s), (c) => c.toLowerCase().charAt(0) || c).join('');
  const norm = (q) => lower(String(q == null ? '' : q).trim().replace(/\s+/g, ' '));
  const span = (from, n) => Array.from({ length: n }, (_, k) => from + k);

  /** 第 i 个字符是否为「词首」：开头、分隔符之后、驼峰、字母/数字切换、中日韩文字 */
  const isWordStart = (t, i) => {
    if (i <= 0) return true;
    const p = t[i - 1];
    const c = t[i];
    if (SEP_RE.test(p) || CJK_RE.test(c) || CJK_RE.test(p)) return true;
    if (p !== p.toUpperCase() && c !== c.toLowerCase()) return true;
    const pd = p >= '0' && p <= '9';
    const cd = c >= '0' && c <= '9';
    return pd !== cd && ALNUM_RE.test(p) && ALNUM_RE.test(c);
  };

  /** 子序列匹配；preferStarts 时优先落在词首或紧接上一个命中字符（缩写匹配：gp → Git Push） */
  function subsequence(q, lt, t, preferStarts) {
    const pos = [];
    let from = 0;
    for (let k = 0; k < q.length; k++) {
      const ch = q[k];
      let found = -1;
      if (preferStarts) {
        const last = pos.length ? pos[pos.length - 1] : -2;
        for (let i = from; i < lt.length; i++) {
          if (lt[i] === ch && (i === last + 1 || isWordStart(t, i))) { found = i; break; }
        }
      }
      if (found < 0) found = lt.indexOf(ch, from);
      if (found < 0) return null;
      pos.push(found);
      from = found + 1;
    }
    let score = 200;
    let prev = -2;
    for (const i of pos) {
      if (i === prev + 1) score += 12;
      else if (prev >= 0) score -= Math.min(i - prev - 1, 10) * 2;
      if (isWordStart(t, i)) score += 18;
      prev = i;
    }
    score -= Math.min(pos[0], 20);
    return { score: Nova.clamp(score, 1, 399), positions: pos };
  }

  /** q 已规范化（小写、去首尾空白）。分档：1000 完全一致 / 800+ 前缀 / 600+ 词首 / 400+ 子串 / 1–399 子序列 */
  function matchText(q, text) {
    const t = String(text == null ? '' : text);
    const lt = lower(t);
    const n = q.length;
    if (!n || !lt) return null;
    if (lt === q) return { score: 1000, positions: span(0, n) };
    if (lt.startsWith(q)) return { score: 900 - Math.min(lt.length - n, 99), positions: span(0, n) };
    const first = lt.indexOf(q);
    if (first > 0) {
      for (let i = first; i >= 0; i = lt.indexOf(q, i + 1)) {
        if (isWordStart(t, i)) return { score: 700 - Math.min(i, 99), positions: span(i, n) };
      }
      return { score: 500 - Math.min(first, 99), positions: span(first, n) };
    }
    const a = subsequence(q, lt, t, true);
    const b = subsequence(q, lt, t, false);
    if (!a || !b) return a || b;
    return a.score >= b.score ? a : b;
  }

  /** 标签 + 关键词综合评分；多个词时要求每个词都命中 */
  function scoreTarget(q, label, keywords) {
    let best = null;
    const m = matchText(q, label);
    if (m) best = m;
    for (const k of keywords) {
      const km = matchText(q, k);
      if (km && (!best || km.score * 0.9 > best.score)) best = { score: km.score * 0.9, positions: m ? m.positions : [] };
    }
    if (best || !q.includes(' ')) return best;
    let min = Infinity;
    const positions = new Set();
    for (const tok of q.split(' ')) {
      if (!tok) continue;
      const r = scoreTarget(tok, label, keywords);
      if (!r) return null;
      min = Math.min(min, r.score);
      r.positions.forEach((p) => positions.add(p));
    }
    return { score: min * 0.8, positions: [...positions].sort((x, y) => x - y) };
  }

  const kwOf = (k) => (Array.isArray(k) ? k.map(String) : k == null ? [] : String(k).split(/[\s,，、]+/)).filter(Boolean);
  const keysOf = (s) => (Array.isArray(s) ? s.map(String) : String(s).split(/\s+|(?<=\S)\+(?=\S)/)).filter(Boolean);

  /** 用 DOM 重建标签文字并高亮命中字符（不经过 innerHTML） */
  function paint(el, text, positions) {
    el.textContent = '';
    if (!positions || !positions.length) { el.textContent = text; return; }
    const hit = new Set(positions);
    let i = 0;
    while (i < text.length) {
      const on = hit.has(i);
      let j = i;
      while (j < text.length && hit.has(j) === on) j++;
      const chunk = text.slice(i, j);
      el.append(on ? Nova.h('mark', { class: 'nv-command-hl' }, chunk) : chunk);
      i = j;
    }
  }

  /* ————————————————— 列表引擎（命令面板与内嵌版共用） —————————————————
   * groups: [{ el, items: [{ el, labelEl, label, keywords, index }], index }]
   * onPick(el, via)：via = 'key' | 'click'
   */
  function createList({ input, list, empty, live, sortGroups, texts, onPick, signal }) {
    let groups = [];
    let selected = null;
    let query = null;
    let liveTimer = 0;
    const nav = Nova.roving(() => list.querySelectorAll('[role="option"]'), {
      typeahead: false,
      onChange(el) {
        if (selected) selected.setAttribute('aria-selected', 'false');
        selected = el;
        if (el) {
          el.setAttribute('aria-selected', 'true');
          input.setAttribute('aria-activedescendant', el.id);
        } else input.removeAttribute('aria-activedescendant');
      },
    });

    const reorder = (parent, nodes) => {
      const current = [...parent.children].filter((c) => nodes.includes(c));
      if (current.length === nodes.length && current.every((c, i) => c === nodes[i])) return;
      nodes.forEach((n) => parent.append(n));
    };

    function syncSeparators() {
      let seen = false;
      let pending = null;
      for (const c of list.children) {
        if (c.classList.contains('nv-panel-sep')) {
          c.hidden = true;
          if (seen) pending = c;
        } else if (c.classList.contains('nv-command-group') && !c.hidden) {
          if (pending) pending.hidden = false;
          pending = null;
          seen = true;
        }
      }
    }

    function filter(raw, { force = false } = {}) {
      const q = norm(raw);
      if (q === query && !force) return;
      query = q;
      let total = 0;
      for (const g of groups) {
        const hits = [];
        for (const r of g.items) {
          const m = q ? scoreTarget(q, r.label, r.keywords) : null;
          const show = !q || !!m;
          r.el.hidden = !show;
          paint(r.labelEl, r.label, m && m.positions);
          if (show) hits.push({ r, s: m ? m.score : 0 });
        }
        if (q) hits.sort((a, b) => b.s - a.s || a.r.index - b.r.index);
        const visible = hits.map((h) => h.r);
        reorder(g.el, [...visible, ...g.items.filter((r) => r.el.hidden)].map((r) => r.el));
        g.best = hits.length ? hits[0].s : -Infinity;
        g.el.hidden = !hits.length;
        total += hits.length;
      }
      if (sortGroups) {
        const order = q ? [...groups].sort((a, b) => b.best - a.best || a.index - b.index) : groups;
        reorder(list, order.map((g) => g.el));
      } else syncSeparators();

      list.hidden = !total;
      empty.hidden = !!total;
      input.setAttribute('aria-expanded', String(total > 0));
      list.scrollTop = 0;
      nav.set(nav.enabled()[0] || null, { scroll: false });

      clearTimeout(liveTimer);
      if (q) liveTimer = setTimeout(() => {
        live.textContent = total ? texts.countText.replace('{n}', total) : texts.emptyText;
      }, 450);
      else live.textContent = '';
    }

    input.addEventListener('input', () => filter(input.value), { signal });
    input.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      const k = e.key;
      if (k === 'Enter') {
        const a = nav.active;
        if (a) { e.preventDefault(); onPick(a, 'key'); }
        return;
      }
      if (e.shiftKey && (k === 'Home' || k === 'End')) return;
      if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'].includes(k)) nav.key(e);
    }, { signal });

    const optionOf = (e) => {
      const el = e.target.closest && e.target.closest('[role="option"]');
      return el && list.contains(el) && el.getAttribute('aria-disabled') !== 'true' ? el : null;
    };
    // 按下列表项时保持焦点在输入框
    list.addEventListener('mousedown', (e) => {
      if (!e.target.closest('[role="option"]')) return;
      e.preventDefault();
      if (document.activeElement !== input) input.focus({ preventScroll: true });
    }, { signal });
    list.addEventListener('pointermove', (e) => {
      const el = optionOf(e);
      if (el && el !== nav.active) nav.set(el, { scroll: false });
    }, { signal });
    list.addEventListener('click', (e) => {
      const el = optionOf(e);
      if (el) onPick(el, 'click');
    }, { signal });

    return {
      nav,
      filter,
      setGroups(next) { groups = next; },
      get query() { return query || ''; },
      ensureActive() { if (!nav.active) nav.set(nav.enabled()[0] || null, { scroll: false }); },
      stop() { clearTimeout(liveTimer); },
    };
  }

  const searchRow = (input, extra) =>
    Nova.h('div', { class: 'nv-command-search', html: Nova.icon('search', { size: 18 }) }, input, extra);

  const comboAttrs = (input, listId) => {
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-controls', listId);
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
  };

  /* ————————————————— 命令面板（命令式） ————————————————— */
  const DEFAULT_HINTS = [
    { keys: ['↑', '↓'], label: '选择' },
    { keys: ['↵'], label: '确认' },
    { keys: ['Esc'], label: '关闭' },
  ];
  let currentPalette = null;

  function buildItem(item, index) {
    const label = String(item.label != null ? item.label : item.id != null ? item.id : '');
    const labelEl = Nova.h('span', { class: 'nv-item-label' }, label);
    let icon = null;
    if (item.icon && item.icon.nodeType) icon = Nova.h('span', { class: 'nv-command-item-icon' }, item.icon.cloneNode(true));
    else if (item.icon) icon = Nova.h('span', { class: 'nv-command-item-icon', html: Nova.icon(String(item.icon), { size: 16 }) });
    const keys = item.shortcut ? keysOf(item.shortcut) : [];
    const el = Nova.h('div', {
      class: 'nv-item nv-command-item',
      role: 'option',
      id: Nova.uid('nv-cmd-opt'),
      'aria-selected': 'false',
      'aria-disabled': item.disabled ? 'true' : null,
      'data-value': item.id == null ? null : String(item.id),
    },
    icon,
    Nova.h('span', { class: 'nv-command-item-text' },
      labelEl,
      item.desc ? Nova.h('span', { class: 'nv-command-item-desc' }, String(item.desc)) : null),
    keys.length ? Nova.h('span', { class: 'nv-command-kbds' }, keys.map((k) => Nova.h('kbd', { class: 'nv-command-kbd' }, k))) : null);
    return { el, labelEl, label, keywords: kwOf(item.keywords), index, item };
  }

  function open(options = {}) {
    if (currentPalette) currentPalette.close();
    const o = {
      placeholder: '输入命令或搜索…',
      emptyText: '没有找到相关结果',
      label: '命令面板',
      countText: '{n} 条结果',
      closeText: '关闭',
      footer: true,
      query: '',
      ...options,
    };
    const items = Array.isArray(o.items) ? o.items : [];
    const listId = Nova.uid('nv-cmd-list');

    const input = Nova.h('input', {
      class: 'nv-command-input',
      type: 'text',
      placeholder: o.placeholder,
      'aria-label': o.label,
      enterkeyhint: 'go',
    });
    comboAttrs(input, listId);
    const escBtn = Nova.h('button', { type: 'button', class: 'nv-command-esc', tabindex: '-1', 'aria-label': o.closeText }, 'Esc');
    const list = Nova.h('div', { class: 'nv-command-list', role: 'listbox', id: listId, 'aria-label': o.label });
    const empty = Nova.h('div', { class: 'nv-panel-empty nv-command-empty', hidden: true }, o.emptyText);
    const live = Nova.h('div', { class: 'nv-sr-only', role: 'status', 'aria-live': 'polite' });
    const hints = o.footer === false ? null : Array.isArray(o.footer) ? o.footer : DEFAULT_HINTS;
    const footer = hints && Nova.h('div', { class: 'nv-command-footer', 'aria-hidden': 'true' },
      hints.map((h) => Nova.h('span', { class: 'nv-command-hint' },
        keysOf(h.keys || []).map((k) => Nova.h('kbd', { class: 'nv-command-kbd' }, k)),
        h.label == null ? null : String(h.label))));

    // 分组：按首次出现的顺序；未分组的项放进无标题分组
    const records = new Map();
    const groupMap = new Map();
    const groups = [];
    items.forEach((item, index) => {
      if (!item) return;
      const key = item.group == null ? '' : String(item.group);
      let g = groupMap.get(key);
      if (!g) {
        const labelId = key ? Nova.uid('nv-cmd-group') : null;
        g = {
          el: Nova.h('div', { class: 'nv-command-group', role: key ? 'group' : 'presentation', 'aria-labelledby': labelId }),
          items: [],
          index: groups.length,
        };
        if (key) g.el.append(Nova.h('div', { class: 'nv-panel-label', id: labelId, 'aria-hidden': 'true' }, key));
        groupMap.set(key, g);
        groups.push(g);
        list.append(g.el);
      }
      const rec = buildItem(item, index);
      g.items.push(rec);
      g.el.append(rec.el);
      records.set(rec.el, rec);
    });

    const panel = Nova.h('div', { class: 'nv-command', role: 'dialog', 'aria-modal': 'true', 'aria-label': o.label },
      searchRow(input, escBtn), list, empty, footer, live);
    const root = Nova.h('div', { class: 'nv-command-dialog', 'data-state': 'open' }, panel);

    let closed = false;
    const ac = new AbortController();
    const ctrl = createList({
      input, list, empty, live, sortGroups: true, texts: o, signal: ac.signal,
      onPick: (el) => pick(el),
    });
    ctrl.setGroups(groups);

    const unlock = Nova.lockScroll();
    document.body.append(root);
    input.value = o.query || '';
    ctrl.filter(input.value, { force: true });
    const release = Nova.trapFocus(panel, { initial: input });
    const pop = Nova.layer.push({ el: panel, onDismiss: () => close() });
    escBtn.addEventListener('click', () => close());

    function close() {
      if (closed) return;
      closed = true;
      ctrl.stop();
      ac.abort();
      pop();
      // inert：阻止 trapFocus 尚未执行的初始聚焦落到正在退场的面板上
      root.inert = true;
      release();
      unlock();
      if (currentPalette === handle) currentPalette = null;
      Nova.animateOut(root, () => root.remove());
      if (typeof o.onClose === 'function') o.onClose();
    }
    function pick(el) {
      const rec = records.get(el);
      if (!rec || closed) return;
      close();
      if (typeof rec.item.onSelect === 'function') rec.item.onSelect(rec.item);
      if (typeof o.onSelect === 'function') o.onSelect(rec.item);
    }

    const handle = { close, get closed() { return closed; } };
    currentPalette = handle;
    return handle;
  }

  /* ————————————————— 内嵌版 ————————————————— */
  const ITEM_SEL = '[data-value]';
  const isGroup = (c) => c.matches('.nv-command-group, [role="group"]');
  const isSep = (c) => c.matches('.nv-panel-sep, hr, [role="separator"]');

  function prepItem(el, index) {
    el.classList.add('nv-item', 'nv-command-item');
    el.setAttribute('role', 'option');
    if (!el.id) el.id = Nova.uid('nv-cmd-opt');
    el.setAttribute('aria-selected', 'false');
    if (el.hasAttribute('disabled') || el.hasAttribute('data-disabled')) el.setAttribute('aria-disabled', 'true');
    let labelEl = el.querySelector('.nv-item-label');
    if (!labelEl) {
      const texts = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
      labelEl = Nova.h('span', { class: 'nv-item-label' }, texts.map((t) => t.textContent).join(''));
      if (texts.length) texts[0].replaceWith(labelEl);
      else el.append(labelEl);
      texts.slice(1).forEach((t) => t.remove());
    }
    const label = labelEl.textContent.replace(/\s+/g, ' ').trim();
    return { el, labelEl, label, keywords: kwOf(el.dataset.keywords), index };
  }

  /** 扁平写法（标题 / 选项 / 分隔线）自动包成分组；已有 .nv-command-group 时直接使用 */
  function parseGroups(list) {
    const els = [];
    let g = null;
    const make = (before) => {
      const el = Nova.h('div', { class: 'nv-command-group' });
      before.before(el);
      els.push(el);
      return el;
    };
    for (const c of [...list.children]) {
      if (isGroup(c)) { els.push(c); g = null; }
      else if (isSep(c)) { c.classList.add('nv-panel-sep'); c.setAttribute('aria-hidden', 'true'); g = null; }
      else if (c.matches('.nv-panel-label')) { g = make(c); g.append(c); }
      else if (c.matches(ITEM_SEL)) { if (!g) g = make(c); g.append(c); }
    }
    return els.map((el, gi) => {
      el.classList.add('nv-command-group');
      const lab = el.querySelector(':scope > .nv-panel-label');
      if (lab) {
        if (!lab.id) lab.id = Nova.uid('nv-cmd-group');
        lab.setAttribute('aria-hidden', 'true');
        el.setAttribute('role', 'group');
        el.setAttribute('aria-labelledby', lab.id);
      } else el.setAttribute('role', 'presentation');
      return { el, items: [...el.querySelectorAll(ITEM_SEL)].map(prepItem), index: gi };
    });
  }

  Nova.define('command', '[data-nv-command]', (root) => {
    const o = Nova.opts(root, { placeholder: '搜索…', emptyText: '没有找到相关结果', countText: '{n} 条结果' });
    let input = root.querySelector('input.nv-command-input') || root.querySelector('input');
    if (!input) input = Nova.h('input', { type: 'text' });
    input.classList.add('nv-command-input');
    let search = input.closest('.nv-command-search');
    if (!search || !root.contains(search)) {
      const placeholder = root.contains(input) ? input : null;
      search = searchRow(null);
      if (placeholder) placeholder.replaceWith(search);
      else root.prepend(search);
      search.append(input);
    }
    let list = root.querySelector('.nv-command-list');
    if (!list) {
      list = Nova.h('div', { class: 'nv-command-list' });
      [...root.children].filter((c) => c !== search && (isGroup(c) || isSep(c) || c.matches(`.nv-panel-label, ${ITEM_SEL}`)))
        .forEach((c) => list.append(c));
      search.after(list);
    }
    if (!list.id) list.id = Nova.uid('nv-cmd-list');
    list.setAttribute('role', 'listbox');
    const name = root.getAttribute('aria-label');
    if (name && !list.hasAttribute('aria-label')) list.setAttribute('aria-label', name);
    comboAttrs(input, list.id);
    if (!input.placeholder) input.placeholder = o.placeholder;
    if (!input.hasAttribute('aria-label') && !(input.labels && input.labels.length)) input.setAttribute('aria-label', name || input.placeholder);

    let empty = root.querySelector('.nv-command-empty');
    if (!empty) {
      empty = Nova.h('div', { class: 'nv-panel-empty nv-command-empty', hidden: true }, o.emptyText);
      list.after(empty);
    }
    const live = Nova.h('div', { class: 'nv-sr-only', role: 'status', 'aria-live': 'polite' });
    root.append(live);

    const ac = new AbortController();
    const select = (el) => Nova.emit(root, 'nv:select', { value: el.dataset.value, item: el });
    const ctrl = createList({
      input, list, empty, live, sortGroups: false, texts: o, signal: ac.signal,
      onPick(el, via) {
        // 链接项按 Enter 时走原生点击（会触发跳转与下面的 click 分支）
        if (via === 'key' && el.matches('a[href]')) el.click();
        else select(el);
      },
    });
    const refresh = () => {
      ctrl.setGroups(parseGroups(list));
      ctrl.filter(input.value, { force: true });
    };
    refresh();
    input.addEventListener('focus', () => ctrl.ensureActive(), { signal: ac.signal });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && input.value && !e.isComposing) {
        input.value = '';
        ctrl.filter('');
      }
    }, { signal: ac.signal });

    return {
      refresh,
      filter(q) { input.value = q == null ? '' : String(q); ctrl.filter(input.value); },
      focus() { input.focus(); },
      get query() { return input.value; },
      destroy() { ctrl.stop(); ac.abort(); live.remove(); },
    };
  });

  Nova.command = {
    open,
    close: () => { if (currentPalette) currentPalette.close(); },
    refresh: (el) => { const inst = Nova.get(el, 'command'); if (inst) inst.refresh(); },
    /** 评分工具：Nova.command.match('gp', 'Git Push', ['keyword']) → { score, positions } | null */
    match(query, text, keywords) {
      const q = norm(query);
      if (!q) return { score: 0, positions: [] };
      return scoreTarget(q, text, kwOf(keywords));
    },
  };
})();

;
/* src/components/breadcrumb/breadcrumb.js */
/* DomSprig-UI · Breadcrumb
 * - 最后一项没有 aria-current 时自动补上（最后一个 li 里的链接或文字视为当前页）。
 * - data-max="N"：项目数超过 N 时保留第一项和最后 N-2 项，中间折叠成「…」按钮。
 *   有 Dropdown 组件时点开是菜单（被折叠的链接依次列出）；没有时点击直接展开全部。
 * Nova.get(nav, 'breadcrumb').refresh()：增删项目后重新计算折叠。
 */
(() => {
  Nova.define('breadcrumb', '.nv-breadcrumb', (nav) => {
    const list = nav.querySelector(':scope > ol, :scope > ul');
    if (!list) return {};
    if (!nav.hasAttribute('aria-label')) nav.setAttribute('aria-label', '面包屑');
    let moreLi = null;
    let menu = null;

    const items = () => [...list.children].filter((li) => li !== moreLi);

    const markCurrent = () => {
      const all = items();
      const last = all[all.length - 1];
      if (!last || list.querySelector('[aria-current]')) return;
      const target = last.querySelector('a, span') || last;
      if (target === last) {
        const span = Nova.h('span', { 'aria-current': 'page' }, ...last.childNodes);
        last.append(span);
      } else target.setAttribute('aria-current', 'page');
    };

    const cleanup = () => {
      moreLi?.remove();
      menu?.remove();
      moreLi = menu = null;
      items().forEach((li) => { li.hidden = false; });
    };

    const refresh = () => {
      cleanup();
      markCurrent();
      const max = Number(nav.dataset.max) || 0;
      const all = items();
      if (!max || max < 3 || all.length <= max) return;
      const hidden = all.slice(1, all.length - (max - 2));
      hidden.forEach((li) => { li.hidden = true; });

      const btn = Nova.h('button', {
        type: 'button',
        class: 'nv-breadcrumb-more',
        'aria-label': `显示其余 ${hidden.length} 级`,
        html: Nova.icon('more', { size: 16 }),
      });
      moreLi = Nova.h('li', { 'data-nv-breadcrumb-more': '' }, btn);

      if (Nova.dropdown) {
        menu = Nova.h('div', { class: 'nv-menu', id: Nova.uid('nv-crumb-menu'), hidden: true },
          hidden.map((li) => {
            const link = li.querySelector('a');
            const text = (link || li).textContent.trim();
            return link
              ? Nova.h('a', { class: 'nv-item', role: 'menuitem', href: link.getAttribute('href') }, text)
              : Nova.h('div', { class: 'nv-item', role: 'menuitem', 'aria-disabled': 'true' }, text);
          }));
        nav.append(menu);
        btn.setAttribute('data-nv-dropdown', `#${menu.id}`);
      } else {
        btn.addEventListener('click', () => {
          hidden.forEach((li) => { li.hidden = false; });
          const first = hidden[0]?.querySelector('a');
          moreLi.remove();
          moreLi = null;
          first?.focus();
        });
      }
      all[0].after(moreLi);
      // 首屏初始化期间插入的节点不会被 MutationObserver 捕获，手动升级一次（重复调用是幂等的）
      Nova.init(moreLi);
    };

    refresh();
    return { refresh, destroy: cleanup };
  });
})();

;
/* src/components/tabs/tabs.js */
/* DomSprig-UI · Tabs
 * 作者只写 .nv-tabs > .nv-tabs-list > .nv-tab[data-value] 与 .nv-tab-panel[data-value]；
 * 本文件补齐 role / id / aria-*、滑动指示器、WAI-ARIA APG 键盘、溢出渐隐与面板淡入。
 *
 * 配置（写在 .nv-tabs 上）：data-value 初始值 · data-activation="manual" 手动激活 · data-orientation="vertical"
 * 事件：nv:change { value, previous, tab, panel }
 * 实例：Nova.get(el, 'tabs') → { select(value, { focus }), value, refresh(), destroy() }
 */
(() => {
  const { Nova } = window;

  Nova.icons.send = Nova.icons.send || '<path d="M21.5 2.5 10.5 13.5M21.5 2.5l-7 19-4-8-8-4z"/>';

  const isDisabled = (t) => t.disabled || t.getAttribute('aria-disabled') === 'true';

  Nova.define('tabs', '.nv-tabs', (root) => {
    const list = root.querySelector(':scope > .nv-tabs-list');
    if (!list) return {};
    const o = Nova.opts(root, { value: '', activation: 'auto' });
    const ac = new AbortController();
    const on = (el, type, fn, opt) => el.addEventListener(type, fn, { signal: ac.signal, ...opt });

    const indicator = Nova.h('span', { class: 'nv-tabs-indicator', 'aria-hidden': 'true' });
    list.prepend(indicator);
    list.setAttribute('role', 'tablist');

    const tabs = () => [...list.querySelectorAll(':scope > .nv-tab')];
    const panels = () => [...root.querySelectorAll(':scope > .nv-tab-panel')];
    const vertical = () => root.dataset.orientation === 'vertical';
    const rtl = () => getComputedStyle(list).direction === 'rtl';
    const find = (value) => tabs().find((t) => t.dataset.value === String(value));
    let current = null;

    /* —— 结构与 ARIA —— */
    const ro = 'ResizeObserver' in window ? new ResizeObserver(() => place()) : null;
    ro && ro.observe(list);
    function wire() {
      const ps = panels();
      tabs().forEach((tab, i) => {
        if (tab.dataset.value == null) tab.dataset.value = String(i);
        const panel = ps.find((p, j) => (p.dataset.value ?? String(j)) === tab.dataset.value);
        tab.setAttribute('role', 'tab');
        if (tab.tagName === 'BUTTON' && !tab.hasAttribute('type')) tab.type = 'button';
        if (!tab.id) tab.id = Nova.uid('nv-tab');
        if (!tab.hasAttribute('aria-selected')) tab.setAttribute('aria-selected', 'false');
        if (panel) {
          if (!panel.id) panel.id = Nova.uid('nv-tabpanel');
          panel.setAttribute('role', 'tabpanel');
          panel.setAttribute('aria-labelledby', tab.id);
          if (!panel.hasAttribute('tabindex')) panel.tabIndex = 0;
          tab.setAttribute('aria-controls', panel.id);
        }
        ro && ro.observe(tab);
      });
      list.setAttribute('aria-orientation', vertical() ? 'vertical' : 'horizontal');
    }

    /* —— 指示器：交互时与尺寸变化时测量（隐藏容器里为 0，等 ResizeObserver 再来） —— */
    function place() {
      const tab = current != null && find(current);
      const w = tab ? tab.offsetWidth : 0;
      const h = tab ? tab.offsetHeight : 0;
      if (!w || !h) { root.removeAttribute('data-ready'); return; }
      indicator.style.width = `${w}px`;
      indicator.style.height = `${h}px`;
      indicator.style.setProperty('--_ix', `${tab.offsetLeft}px`);
      indicator.style.setProperty('--_iy', `${tab.offsetTop}px`);
      if (!root.hasAttribute('data-ready')) {
        void indicator.offsetWidth; // 先落位再开启过渡，首帧不滑动
        root.setAttribute('data-ready', '');
      }
      fade();
    }

    /* —— 溢出渐隐：哪一侧还有内容，哪一侧就渐隐 —— */
    function fade() {
      const max = list.scrollWidth - list.clientWidth;
      const overflow = !vertical() && max > 1;
      list.toggleAttribute('data-overflow', overflow);
      if (!overflow) { list.removeAttribute('data-fade-left'); list.removeAttribute('data-fade-right'); return; }
      const s = Math.abs(list.scrollLeft);
      const fromStart = s > 1;
      const toEnd = s < max - 1;
      const r = rtl();
      list.toggleAttribute('data-fade-left', r ? toEnd : fromStart);
      list.toggleAttribute('data-fade-right', r ? fromStart : toEnd);
    }

    /* 让标签完整露出（留出渐隐宽度）；只滚动标签栏本身，不牵动页面 */
    function reveal(tab, smooth) {
      if (vertical() || list.scrollWidth - list.clientWidth <= 1 || rtl()) return;
      const pad = 40;
      const left = tab.offsetLeft;
      const right = left + tab.offsetWidth;
      let to = null;
      if (left - pad < list.scrollLeft) to = left - pad;
      else if (right + pad > list.scrollLeft + list.clientWidth) to = right + pad - list.clientWidth;
      if (to != null) list.scrollTo({ left: Math.max(0, to), behavior: smooth && !Nova.reducedMotion() ? 'smooth' : 'auto' });
    }

    function enter(panel) {
      if (Nova.reducedMotion()) return;
      panel.removeAttribute('data-enter');
      void panel.offsetWidth;
      panel.setAttribute('data-enter', '');
      const done = (e) => {
        if (e && e.target !== panel) return;
        panel.removeAttribute('data-enter');
        panel.removeEventListener('animationend', done);
      };
      panel.addEventListener('animationend', done);
      setTimeout(done, 600);
    }

    function select(value, { focus = false, silent = false } = {}) {
      const tab = find(value);
      if (!tab || isDisabled(tab)) return false;
      const previous = current;
      const changed = previous !== tab.dataset.value;
      current = tab.dataset.value;
      for (const t of tabs()) {
        const sel = t === tab;
        t.setAttribute('aria-selected', String(sel));
        t.tabIndex = sel ? 0 : -1;
      }
      const panelId = tab.getAttribute('aria-controls');
      let panel = null;
      for (const p of panels()) {
        const show = p.id === panelId;
        if (show) panel = p;
        if (show && p.hidden && previous != null) enter(p);
        p.hidden = !show;
      }
      root.dataset.value = current;
      place();
      reveal(tab, previous != null);
      if (focus) tab.focus({ preventScroll: true });
      if (changed && previous != null && !silent) Nova.emit(root, 'nv:change', { value: current, previous, tab, panel });
      return true;
    }

    /* —— 鼠标 —— */
    on(list, 'click', (e) => {
      const tab = e.target.closest('.nv-tab');
      if (!tab || tab.parentElement !== list || isDisabled(tab)) return;
      select(tab.dataset.value);
    });

    /* —— 键盘（APG Tabs）：方向键在标签间移动并循环，Home/End 到首尾；
     *   自动激活：聚焦即切换；手动激活：Enter / Space 才切换 —— */
    on(list, 'keydown', (e) => {
      const tab = e.target.closest('.nv-tab');
      if (!tab || tab.parentElement !== list || e.altKey || e.ctrlKey || e.metaKey) return;
      const all = tabs();
      const enabled = all.filter((t) => !isDisabled(t));
      if (!enabled.length) return;
      const v = vertical();
      const flip = !v && rtl();
      const prevKey = v ? 'ArrowUp' : flip ? 'ArrowRight' : 'ArrowLeft';
      const nextKey = v ? 'ArrowDown' : flip ? 'ArrowLeft' : 'ArrowRight';
      const step = (dir) => {
        let i = all.indexOf(tab);
        for (let n = 0; n < all.length; n++) {
          i = (i + dir + all.length) % all.length;
          if (!isDisabled(all[i])) return all[i];
        }
        return tab;
      };
      let next = null;
      if (e.key === nextKey) next = step(1);
      else if (e.key === prevKey) next = step(-1);
      else if (e.key === 'Home') next = enabled[0];
      else if (e.key === 'End') next = enabled[enabled.length - 1];
      else if ((e.key === 'Enter' || e.key === ' ') && tab.tagName !== 'BUTTON') {
        e.preventDefault();
        if (!isDisabled(tab)) select(tab.dataset.value);
        return;
      }
      if (!next) return;
      e.preventDefault();
      if (o.activation !== 'manual') select(next.dataset.value, { focus: true });
      else { next.focus({ preventScroll: true }); reveal(next, true); }
    });

    /* —— 滚动：更新渐隐；竖向滚轮在可滚动时转为横向 —— */
    on(list, 'scroll', fade, { passive: true });
    on(list, 'wheel', (e) => {
      if (vertical() || e.ctrlKey || rtl() || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      const max = list.scrollWidth - list.clientWidth;
      if (max <= 1) return;
      if ((e.deltaY < 0 && list.scrollLeft <= 0) || (e.deltaY > 0 && list.scrollLeft >= max - 1)) return;
      e.preventDefault();
      list.scrollLeft += e.deltaY;
    }, { passive: false });

    /* —— 动态增删标签/面板 —— */
    const mo = new MutationObserver((records) => {
      if (!records.some((r) => [...r.addedNodes, ...r.removedNodes].some((n) => n.nodeType === 1 && n.matches('.nv-tab, .nv-tab-panel')))) return;
      refresh();
    });
    mo.observe(list, { childList: true });
    mo.observe(root, { childList: true });

    function refresh() {
      wire();
      const tab = (current != null && find(current)) || tabs().find((t) => !isDisabled(t));
      if (tab) { current = null; select(tab.dataset.value, { silent: true }); }
    }

    // 初始值：data-value > aria-selected="true" > 第一个可用标签
    wire();
    const all = tabs();
    const initial = (o.value && find(o.value) && !isDisabled(find(o.value)) && o.value)
      || (all.find((t) => t.getAttribute('aria-selected') === 'true' && !isDisabled(t)) || all.find((t) => !isDisabled(t)) || {}).dataset?.value;
    if (initial != null) select(initial, { silent: true });

    return {
      select: (value, opts) => select(value, opts),
      get value() { return current; },
      refresh,
      destroy() {
        ac.abort();
        ro && ro.disconnect();
        mo.disconnect();
        indicator.remove();
        root.removeAttribute('data-ready');
      },
    };
  });

  /** 命令式：Nova.tabs.select('#settings-tabs', 'billing') */
  Nova.tabs = {
    select: (el, value, opts) => { const inst = Nova.get(el, 'tabs'); return inst ? inst.select(value, opts) : false; },
    value: (el) => { const inst = Nova.get(el, 'tabs'); return inst ? inst.value : null; },
  };
})();

;
/* src/components/steps/steps.js */
/* DomSprig-UI · Steps
 * 整理结构（图标 + 文字）、推导状态、可点击切换、窄屏自动转纵向。
 * 根元素配置：data-current（从 0 开始；等于步骤数表示全部完成）· data-current-status="error"
 *            data-clickable（"" 全部可点 | "finished" 只能回到已完成步骤）· data-responsive="false" 关闭自动纵向
 *            读屏文案：data-finish-text data-process-text data-wait-text data-error-text
 * 每步：data-status 手动指定状态 · data-icon="图标名" 自定义图标 · data-disabled 禁止点击
 * 事件：nv:change { index, previous }（可取消）
 * 实例：Nova.get(el, 'steps') → { set(i), next(), prev(), current, refresh(), destroy() }
 */
(() => {
  const { Nova } = window;
  const STATUSES = ['finish', 'process', 'wait', 'error'];

  Nova.icons.truck = Nova.icons.truck || '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>';
  Nova.icons['shopping-cart'] = Nova.icons['shopping-cart'] || '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2 2.5h2.5l2.7 12.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 1.9-1.5l1.7-7H5.6"/>';

  Nova.define('steps', '.nv-steps', (root) => {
    const o = Nova.opts(root, {
      currentStatus: 'process',
      responsive: true,
      finishText: '已完成',
      processText: '进行中',
      waitText: '未开始',
      errorText: '出错',
    });
    const clickable = root.hasAttribute('data-clickable') ? root.dataset.clickable || 'all' : null;
    const ac = new AbortController();
    const steps = () => [...root.querySelectorAll(':scope > .nv-step')];
    const overrides = new Map(); // 作者写在步骤上的 data-status，直到 set() 前有效

    function build(step, i) {
      let main = step.querySelector(':scope > .nv-step-main');
      if (!main) {
        main = Nova.h(clickable ? 'button' : 'div', { class: 'nv-step-main', type: clickable ? 'button' : null });
        const content = [...step.querySelectorAll(':scope > .nv-step-content')];
        let icon = step.querySelector(':scope > .nv-step-icon');
        const body = Nova.h('div', { class: 'nv-step-body' });
        for (const n of [...step.childNodes]) {
          if (n === icon || content.includes(n)) continue;
          if (n.nodeType === 3 && !n.textContent.trim()) { n.remove(); continue; }
          body.append(n);
        }
        // 只写了文字时，把它当作标题
        if (!body.querySelector('.nv-step-title')) {
          const loose = [...body.childNodes].filter((n) => !(n.nodeType === 1 && n.classList.contains('nv-step-desc')));
          const title = Nova.h('span', { class: 'nv-step-title' });
          loose.forEach((n) => title.append(n));
          body.prepend(title);
        }
        if (!icon) {
          icon = Nova.h('span', { class: 'nv-step-icon', 'aria-hidden': 'true' });
          if (step.dataset.icon) {
            icon.dataset.custom = '';
            icon.innerHTML = Nova.icon(step.dataset.icon);
          }
        } else {
          icon.dataset.custom = '';
          icon.setAttribute('aria-hidden', 'true');
        }
        if (!icon.hasAttribute('data-custom')) {
          icon.append(Nova.h('span', { class: 'nv-step-num' }));
          icon.insertAdjacentHTML('beforeend', Nova.icon('check', { cls: 'nv-step-check', stroke: 2.5 }) + Nova.icon('x', { cls: 'nv-step-x', stroke: 2.5 }));
        }
        main.append(icon, body, Nova.h('span', { class: 'nv-sr-only nv-step-sr' }));
        step.prepend(main);
      }
      const num = main.querySelector('.nv-step-num');
      if (num) num.textContent = String(i + 1);
      const own = step.getAttribute('data-status');
      if (STATUSES.includes(own) && !step.hasAttribute('data-nv-derived')) overrides.set(step, own);
    }

    let current = 0;
    function initialCurrent() {
      const list = steps();
      if (root.dataset.current != null && root.dataset.current !== '') return Nova.clamp(Number(root.dataset.current) || 0, 0, list.length);
      const active = list.findIndex((s) => ['process', 'error'].includes(overrides.get(s)));
      if (active >= 0) return active;
      const firstOpen = list.findIndex((s) => overrides.get(s) !== 'finish');
      return firstOpen < 0 ? list.length : firstOpen;
    }

    function apply() {
      const list = steps();
      list.forEach((step, i) => {
        const derived = i < current ? 'finish' : i === current ? (STATUSES.includes(o.currentStatus) ? o.currentStatus : 'process') : 'wait';
        const status = overrides.get(step) || derived;
        step.dataset.status = status;
        step.toggleAttribute('data-nv-derived', !overrides.has(step));
        if (i === current) step.setAttribute('aria-current', 'step');
        else step.removeAttribute('aria-current');
        const sr = step.querySelector('.nv-step-sr');
        if (sr) sr.textContent = `（${o[`${status}Text`]}）`;
        const main = step.querySelector(':scope > .nv-step-main');
        if (main && main.tagName === 'BUTTON') {
          const allowed = !step.hasAttribute('data-disabled') && (clickable !== 'finished' || i < current);
          main.disabled = !allowed;
        }
      });
      root.dataset.current = String(current);
    }

    function set(index, { silent = false } = {}) {
      const list = steps();
      const i = Nova.clamp(Math.round(Number(index) || 0), 0, list.length);
      if (i === current && !overrides.size) return false;
      const previous = current;
      if (i !== previous && !silent && !Nova.emit(root, 'nv:change', { index: i, previous })) return false;
      overrides.clear();
      current = i;
      apply();
      return true;
    }

    /* —— 点击切换 —— */
    if (clickable) {
      root.addEventListener('click', (e) => {
        const main = e.target.closest('.nv-step-main');
        if (!main || main.disabled || main.parentElement.parentElement !== root) return;
        const i = steps().indexOf(main.parentElement);
        if (i >= 0 && i !== current) set(i);
      }, { signal: ac.signal });
    }

    /* —— 窄屏自动转纵向：横向排不下（整体溢出，或某步标题被挤得放不下）时加 data-collapsed，
     *    宽度恢复到估算的所需宽度后再还原 —— */
    let needW = 0;
    let raf = 0;
    const shortfall = () => {
      const list = steps();
      let title = 0;
      list.forEach((s) => {
        const t = s.querySelector('.nv-step-title');
        if (t) title = Math.max(title, Math.max(t.scrollWidth, t.offsetWidth) - t.parentElement.clientWidth);
        // 说明文字被挤成窄条（≥3 行且宽度不足 5 个字）也视为放不下
        const d = s.querySelector('.nv-step-desc');
        if (d && d.getClientRects().length) {
          const cs = getComputedStyle(d);
          const fs = parseFloat(cs.fontSize) || 14;
          const lh = parseFloat(cs.lineHeight) || fs * 1.5;
          if (d.offsetHeight > lh * 2.5 && d.clientWidth < fs * 5) title = Math.max(title, fs * 5 - d.clientWidth);
        }
      });
      const extra = Math.max(0, root.scrollWidth - root.clientWidth) + (title > 1 ? title * list.length : 0);
      return extra > 1 ? extra : 0;
    };
    const fit = () => {
      raf = 0;
      if (!o.responsive || root.dataset.orientation === 'vertical') { root.removeAttribute('data-collapsed'); return; }
      const w = root.clientWidth;
      if (!w) return;
      if (root.hasAttribute('data-collapsed')) {
        if (w < needW) return;
        root.removeAttribute('data-collapsed');
      }
      const extra = shortfall();
      if (extra) {
        needW = w + extra + 8;
        root.setAttribute('data-collapsed', '');
      }
    };
    const ro = 'ResizeObserver' in window ? new ResizeObserver(() => { if (!raf) raf = requestAnimationFrame(fit); }) : null;
    ro && ro.observe(root);

    function refresh() {
      steps().forEach(build);
      apply();
      needW = 0;
      if (!raf) raf = requestAnimationFrame(fit);
    }

    const mo = new MutationObserver((records) => {
      if (records.some((r) => [...r.addedNodes, ...r.removedNodes].some((n) => n.nodeType === 1 && n.classList.contains('nv-step')))) refresh();
    });
    mo.observe(root, { childList: true });

    steps().forEach(build);
    current = initialCurrent();
    apply();

    return {
      set: (i) => set(i),
      next: () => set(current + 1),
      prev: () => set(current - 1),
      get current() { return current; },
      refresh,
      destroy() { ac.abort(); ro && ro.disconnect(); mo.disconnect(); cancelAnimationFrame(raf); },
    };
  });

  const call = (m) => (el, ...a) => { const inst = Nova.get(el, 'steps'); return inst ? inst[m](...a) : false; };
  Nova.steps = { set: call('set'), next: call('next'), prev: call('prev') };
})();

;
/* src/components/shimmer-button/shimmer-button.js */
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

;
/* src/components/border-beam/border-beam.js */
/* DomSprig-UI · Border Beam
 * 为 .nv-border-beam 注入装饰层（aria-hidden）：
 * <span class="nv-border-beam-track"><span class="nv-border-beam-light"></span>…</span>
 * - 读取卡片圆角，让光束路径与边框贴合（ResizeObserver 触发时重新读取，兼容隐藏容器内初始化）
 * - 离开视口时暂停动画（data-paused），回到视口继续
 * 实例方法：refresh() 重新读取圆角与光束数；destroy()
 */
(() => {
  const { Nova } = window;

  Nova.define('border-beam', '.nv-border-beam', (el) => {
    let track = el.querySelector(':scope > .nv-border-beam-track');
    const own = !track;
    if (own) {
      track = Nova.h('span', { class: 'nv-border-beam-track', 'aria-hidden': 'true' });
      el.append(track);
    }

    const refresh = () => {
      const n = Nova.clamp(Math.round(Number(el.dataset.beams) || 1), 1, 4);
      const lights = track.querySelectorAll('.nv-border-beam-light');
      for (let i = lights.length; i < n; i++) track.append(Nova.h('span', { class: 'nv-border-beam-light' }));
      for (let i = n; i < lights.length; i++) lights[i].remove();
      track.querySelectorAll('.nv-border-beam-light').forEach((l, k) => l.style.setProperty('--_k', k));
      track.style.setProperty('--_n', n);
      // 圆角：getComputedStyle 在 display:none 时也能取到计算值
      const r = getComputedStyle(el).borderTopLeftRadius.split(' ')[0];
      if (r) track.style.setProperty('--_r', r);
    };
    refresh();

    const ro = 'ResizeObserver' in window ? new ResizeObserver(refresh) : null;
    ro && ro.observe(el);
    const stop = Nova.inView(el, (visible) => el.toggleAttribute('data-paused', !visible), { once: false, threshold: 0 });

    return {
      refresh,
      destroy() {
        stop();
        ro && ro.disconnect();
        el.removeAttribute('data-paused');
        if (own) track.remove();
      },
    };
  });
})();

;
/* src/components/spotlight/spotlight.js */
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

;
/* src/components/tilt/tilt.js */
/* DomSprig-UI · Tilt / Magnetic
 * 两者都用同一个阻尼弹簧在 rAF 中积分：指针静止且弹簧到位后循环立即停止，离开时弹回原位。
 * - 倾斜写 transform（复位后清空，恢复元素原有样式）；磁吸写独立的 translate 属性，可与 transform 叠加。
 * - 每帧先读位置、后写样式；触屏指针与减少动态时不做任何运动。
 */
(() => {
  const { Nova } = window;
  const { clamp } = Nova;

  /** 阻尼弹簧：stiffness 刚度，zeta 阻尼比（<1 会回弹） */
  const spring = (x0, stiffness, zeta) => {
    const damping = 2 * Math.sqrt(stiffness) * zeta;
    return {
      x: x0,
      v: 0,
      step(target, dt) {
        this.v += (stiffness * (target - this.x) - damping * this.v) * dt;
        this.x += this.v * dt;
      },
      settled(target, eps = 0.01) { return Math.abs(this.x - target) < eps && Math.abs(this.v) < eps; },
      snap(target) { this.x = target; this.v = 0; },
    };
  };
  const frameDt = (now, last) => clamp((now - last) / 1000, 0.001, 0.032);

  /* ———————————————— 3D 倾斜 ———————————————— */
  Nova.define('tilt', '[data-nv-tilt]', (el) => {
    const o = Nova.opts(el, { max: 10, perspective: 900, scale: 1.03, spring: 0.5, reverse: false, glare: false });
    const zeta = 1 - 0.75 * clamp(o.spring, 0, 1);
    const rx = spring(0, 170, zeta);
    const ry = spring(0, 170, zeta);
    const sc = spring(1, 170, Math.max(zeta, 0.6));
    let glare = null;
    let glareInner = null;
    if (o.glare) {
      glareInner = Nova.h('span');
      glare = Nova.h('span', { class: 'nv-tilt-glare', 'aria-hidden': 'true' }, glareInner);
      el.append(glare);
    }

    let raf = 0;
    let last = 0;
    let hovering = false;
    let px = 0;
    let py = 0;
    let w = 1;
    let h = 1;
    const target = { x: 0, y: 0, s: 1 };

    const tick = (now) => {
      const dt = frameDt(now, last);
      last = now;
      let gx = 0;
      let gy = 0;
      if (hovering) {
        const r = el.getBoundingClientRect(); // 只读；中心点不受倾斜影响
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const nx = clamp((px - cx) / (w / 2), -1, 1);
        const ny = clamp((py - cy) / (h / 2), -1, 1);
        const dir = o.reverse ? -1 : 1;
        target.y = nx * o.max * dir;
        target.x = -ny * o.max * dir;
        target.s = o.scale;
        gx = px - cx;
        gy = py - cy;
      }
      rx.step(target.x, dt);
      ry.step(target.y, dt);
      sc.step(target.s, dt);
      const done = rx.settled(target.x) && ry.settled(target.y) && sc.settled(target.s, 0.0005);
      if (done && !hovering) {
        rx.snap(0); ry.snap(0); sc.snap(1);
        el.style.transform = '';
        raf = 0;
        return;
      }
      el.style.transform = `perspective(${o.perspective}px) rotateX(${rx.x.toFixed(2)}deg) rotateY(${ry.x.toFixed(2)}deg) scale(${sc.x.toFixed(4)})`;
      if (glareInner && hovering) glareInner.style.transform = `translate3d(${gx.toFixed(1)}px, ${gy.toFixed(1)}px, 0)`;
      raf = done ? 0 : requestAnimationFrame(tick);
    };
    const start = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };

    const onEnter = (e) => {
      if (e.pointerType === 'touch' || Nova.reducedMotion()) return;
      hovering = true;
      w = el.offsetWidth || 1;
      h = el.offsetHeight || 1;
      el.setAttribute('data-active', '');
      onMove(e);
    };
    const onMove = (e) => {
      if (!hovering) return;
      px = e.clientX;
      py = e.clientY;
      start();
    };
    const onLeave = () => {
      if (!hovering) return;
      hovering = false;
      el.removeAttribute('data-active');
      target.x = 0; target.y = 0; target.s = 1;
      start();
    };
    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave);

    return {
      reset() { hovering = false; cancelAnimationFrame(raf); raf = 0; rx.snap(0); ry.snap(0); sc.snap(1); el.style.transform = ''; el.removeAttribute('data-active'); },
      destroy() {
        this.reset();
        el.removeEventListener('pointerenter', onEnter);
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerleave', onLeave);
        glare && glare.remove();
      },
    };
  });

  /* ———————————————— 磁吸（所有实例共享一个 document 监听） ———————————————— */
  const mags = new Set();
  let mraf = 0;
  let mlast = 0;
  let mx = -1e6;
  let my = -1e6;

  const mtick = (now) => {
    const dt = frameDt(now, mlast);
    mlast = now;
    const list = [...mags];
    const rects = list.map((m) => m.el.getBoundingClientRect()); // 先批量读
    let moving = false;
    list.forEach((m, i) => { // 再批量写
      const r = rects[i];
      const left = r.left - m.x.x; // 去掉自身位移，得到原始位置
      const top = r.top - m.y.x;
      const R = m.o.radius;
      const near = !Nova.reducedMotion() && mx >= left - R && mx <= left + r.width + R && my >= top - R && my <= top + r.height + R;
      const tx = near ? (mx - (left + r.width / 2)) * m.o.strength : 0;
      const ty = near ? (my - (top + r.height / 2)) * m.o.strength : 0;
      m.x.step(tx, dt);
      m.y.step(ty, dt);
      if (near !== m.near) { m.near = near; m.el.toggleAttribute('data-active', near); }
      if (!near && m.x.settled(0, 0.05) && m.y.settled(0, 0.05)) {
        if (m.x.x || m.y.x) { m.x.snap(0); m.y.snap(0); m.el.style.translate = ''; }
        return;
      }
      m.el.style.translate = `${m.x.x.toFixed(2)}px ${m.y.x.toFixed(2)}px`;
      if (!(m.x.settled(tx, 0.05) && m.y.settled(ty, 0.05))) moving = true;
    });
    mraf = moving ? requestAnimationFrame(mtick) : 0;
  };
  const kick = () => {
    if (mraf || !mags.size) return;
    mlast = performance.now();
    mraf = requestAnimationFrame(mtick);
  };
  const onDocMove = (e) => {
    if (e.pointerType === 'touch') return;
    mx = e.clientX;
    my = e.clientY;
    kick();
  };
  const onDocOut = (e) => {
    if (e.relatedTarget) return; // 只处理指针离开窗口
    mx = -1e6;
    my = -1e6;
    kick();
  };

  Nova.define('magnetic', '[data-nv-magnetic]', (el) => {
    const o = Nova.opts(el, { strength: 0.35, radius: 60 });
    o.strength = clamp(o.strength, 0, 1);
    const m = { el, o, near: false, x: spring(0, 220, 0.55), y: spring(0, 220, 0.55) };
    if (!mags.size) {
      document.addEventListener('pointermove', onDocMove, { passive: true });
      document.addEventListener('pointerout', onDocOut);
    }
    mags.add(m);
    return {
      destroy() {
        mags.delete(m);
        el.style.translate = '';
        el.removeAttribute('data-active');
        if (!mags.size) {
          document.removeEventListener('pointermove', onDocMove);
          document.removeEventListener('pointerout', onDocOut);
        }
      },
    };
  });
})();

;
/* src/components/text-fx/text-fx.js */
/* DomSprig-UI · Text FX
 * 拆分类特效（blur-in / scramble）共用一个模式：动画期间把原文节点暂存起来，显示拆分后的副本（aria-hidden），
 * 并放一份 .nv-sr-only 原文供读屏；动画结束后把原始节点放回去，DOM 恢复成作者写的样子（字距、换行、选中复制都正常）。
 * 打字机 / 轮换：读屏读 .nv-sr-only 中的完整文案（或 data-label），动画层 aria-hidden。
 * 减少动态：blur-in / scramble 不拆分直接显示原文；打字机直接显示第一个词（不循环）；轮换停在第一个词。
 */
(() => {
  const { Nova } = window;
  const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null;
  const words = (s) => String(s || '').split('|').map((w) => w.trim()).filter(Boolean);

  /** 把文本拆成 [片段, 是否空白]：按词（中文按词典分词）或按字 */
  function tokens(text, mode) {
    if (mode === 'char') return [...text].map((ch) => [ch, /\s/.test(ch)]);
    if (segmenter) return [...segmenter.segment(text)].map((s) => [s.segment, !s.segment.trim()]);
    return text.split(/(\s+)/).filter(Boolean).map((t) => [t, !t.trim()]);
  }

  /**
   * 暂存原文，返回拆分后的视觉副本。makeUnit(text, index) 返回替换一个片段的节点。
   * restore() 把原始节点放回去。
   */
  function splitText(el, mode, makeUnit) {
    const original = document.createDocumentFragment();
    original.append(...el.childNodes);
    const visual = Nova.h('span', { 'aria-hidden': 'true', class: 'nv-text-split' });
    const copy = original.cloneNode(true);
    copy.querySelectorAll?.('[id]').forEach((n) => n.removeAttribute('id'));
    let i = 0;
    const walk = (node) => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          for (const [t, space] of tokens(child.data, mode)) frag.append(space ? t : makeUnit(t, i++));
          child.replaceWith(frag);
        } else if (child.nodeType === 1) {
          if (child.id) child.removeAttribute('id');
          walk(child);
        }
      }
    };
    walk(copy);
    visual.append(copy);
    const sr = Nova.h('span', { class: 'nv-sr-only' }, original.textContent.replace(/\s+/g, ' ').trim());
    el.append(sr, visual);
    return {
      count: i,
      visual,
      restore() {
        sr.remove();
        visual.remove();
        el.append(original);
      },
    };
  }

  /* ———————————————— 逐词模糊淡入 ———————————————— */
  Nova.define('text-blur-in', '[data-nv-text="blur-in"]', (el) => {
    const o = Nova.opts(el, { split: 'word', duration: 700, stagger: 60, delay: 0, threshold: 0.3 });
    if (Nova.reducedMotion()) { el.dataset.state = 'done'; return {}; }
    let split = null;
    let timer = 0;
    const prepare = () => {
      split && split.restore();
      el.dataset.state = 'reset';
      split = splitText(el, o.split, (t, i) => Nova.h('span', { class: 'nv-text-unit', style: `--_i:${i}` }, t));
      el.style.setProperty('--_d', `${o.duration}ms`);
      el.style.setProperty('--_stagger', `${o.stagger}ms`);
    };
    const play = () => {
      clearTimeout(timer);
      if (!split) prepare();
      el.getBoundingClientRect(); // 提交初始状态
      timer = setTimeout(() => {
        el.dataset.state = 'in';
        timer = setTimeout(() => {
          split.restore();
          split = null;
          el.dataset.state = 'done';
          Nova.emit(el, 'nv:done');
        }, o.duration + o.stagger * Math.max(0, split.count - 1) + 60);
      }, Math.max(0, o.delay));
    };
    prepare();
    const stop = Nova.inView(el, play, { threshold: o.threshold });
    return {
      replay() { prepare(); play(); },
      destroy() { stop(); clearTimeout(timer); split && split.restore(); split = null; delete el.dataset.state; },
    };
  });

  /* ———————————————— 乱码解码 ———————————————— */
  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#%&*+=?<>/\\{}[]';
  Nova.define('text-scramble', '[data-nv-text="scramble"]', (el) => {
    const o = Nova.opts(el, { duration: 900, delay: 0, chars: GLYPHS, replay: true, trigger: 'view' });
    if (Nova.reducedMotion()) return {};
    const pool = [...o.chars];
    const rand = () => pool[(Math.random() * pool.length) | 0];
    let raf = 0;
    let split = null;

    const run = () => {
      if (raf || Nova.reducedMotion()) return;
      const cells = [];
      split = splitText(el, 'word', (t) => {
        const word = Nova.h('span', { class: 'nv-scramble-word' });
        for (const ch of t) {
          const glyph = Nova.h('span', { class: 'nv-scramble-glyph' }, rand());
          const ghost = Nova.h('span', { class: 'nv-scramble-ghost' }, ch);
          const cell = Nova.h('span', { class: 'nv-scramble-ch', 'data-busy': '' }, ghost, glyph);
          cells.push({ cell, glyph, ch });
          word.append(cell);
        }
        return word;
      });
      const n = cells.length || 1;
      const t0 = performance.now() + o.delay;
      let lastSwap = 0;
      el.dataset.state = 'running';
      const step = (now) => {
        const t = now - t0;
        const swap = now - lastSwap > 45; // 乱码约 22 次/秒，避免闪得太快
        if (swap) lastSwap = now;
        let pending = 0;
        for (let i = 0; i < cells.length; i++) {
          const c = cells[i];
          if (!c.cell.hasAttribute('data-busy')) continue;
          const at = (i / n) * o.duration * 0.75 + o.duration * 0.25; // 先整体乱一会儿，再从左到右依次定格
          if (t >= at) {
            c.glyph.textContent = c.ch;
            c.cell.removeAttribute('data-busy');
          } else {
            pending++;
            if (swap) c.glyph.textContent = rand();
          }
        }
        if (pending) { raf = requestAnimationFrame(step); return; }
        raf = 0;
        split.restore();
        split = null;
        el.dataset.state = 'done';
        Nova.emit(el, 'nv:done');
      };
      raf = requestAnimationFrame(step);
    };

    const stop = o.trigger === 'view' ? Nova.inView(el, run, { threshold: 0.4 }) : () => {};
    const onEnter = (e) => { if (e.pointerType !== 'touch') run(); };
    const replayTarget = el.closest('a, button, [tabindex]') || el;
    if (o.replay) {
      replayTarget.addEventListener('pointerenter', onEnter);
      replayTarget.addEventListener('focus', run);
    }
    return {
      replay: run,
      destroy() {
        stop();
        cancelAnimationFrame(raf);
        raf = 0;
        split && split.restore();
        replayTarget.removeEventListener('pointerenter', onEnter);
        replayTarget.removeEventListener('focus', run);
      },
    };
  });

  /* ———————————————— 打字机 ———————————————— */
  Nova.define('text-type', '[data-nv-text="type"]', (el) => {
    const o = Nova.opts(el, {
      words: '', speed: 70, deleteSpeed: 35, pause: 1600, delay: 300, loop: true, caret: true, reserve: false, label: '',
    });
    const list = words(o.words);
    if (!list.length) list.push(el.textContent.trim());
    const loop = o.loop && list.length > 1;
    const label = o.label || list.join('、');
    const reduced = Nova.reducedMotion();

    el.textContent = '';
    const sr = Nova.h('span', { class: 'nv-sr-only' }, label);
    const line = Nova.h('span', { class: 'nv-type-line', 'aria-hidden': 'true' });
    const text = document.createTextNode(reduced ? list[0] : '');
    line.append(text);
    if (o.caret) line.append(Nova.h('span', { class: 'nv-type-caret' }));
    el.append(sr);
    if (o.reserve) {
      const longest = list.reduce((a, b) => ([...b].length > [...a].length ? b : a), '');
      el.append(Nova.h('span', { class: 'nv-type-ghost', 'aria-hidden': 'true' }, longest));
    }
    el.append(line);
    if (reduced) { el.dataset.state = 'done'; return {}; }

    let timer = 0;
    let wi = 0;
    let ci = 0;
    let deleting = false;
    let visible = true;
    let waiting = false; // 离开视口时暂停，回来后继续
    const chars = () => [...list[wi]];

    const tick = () => {
      timer = 0;
      if (!visible) { waiting = true; return; }
      const cs = chars();
      if (!deleting) {
        ci++;
        text.data = cs.slice(0, ci).join('');
        el.dataset.state = 'typing';
        if (ci < cs.length) { timer = setTimeout(tick, o.speed * (0.6 + Math.random() * 0.8)); return; }
        el.dataset.state = loop || wi < list.length - 1 ? 'pause' : 'done';
        if (!loop && wi >= list.length - 1) { Nova.emit(el, 'nv:done'); return; }
        deleting = true;
        timer = setTimeout(tick, o.pause);
        return;
      }
      ci--;
      text.data = cs.slice(0, ci).join('');
      el.dataset.state = 'typing';
      if (ci > 0) { timer = setTimeout(tick, o.deleteSpeed); return; }
      deleting = false;
      wi = (wi + 1) % list.length;
      el.dataset.state = 'pause';
      timer = setTimeout(tick, o.speed * 4);
    };

    el.dataset.state = 'pause';
    let started = false;
    const stop = Nova.inView(el, (v) => {
      visible = v;
      if (!v || timer) return;
      if (waiting) { waiting = false; timer = setTimeout(tick, 0); }
      else if (!started) { started = true; timer = setTimeout(tick, Math.max(0, o.delay)); }
    }, { once: false, threshold: 0 });

    return {
      destroy() { stop(); clearTimeout(timer); },
    };
  });

  /* ———————————————— 词语轮换 ———————————————— */
  Nova.define('text-rotate', '[data-nv-text="rotate"]', (el) => {
    const o = Nova.opts(el, { words: '', interval: 2200, label: '' });
    const list = words(o.words);
    if (!list.length) list.push(...el.textContent.split('|').map((w) => w.trim()).filter(Boolean));
    if (!list.length) return {};
    el.textContent = '';
    el.append(Nova.h('span', { class: 'nv-sr-only' }, o.label || list.join('、')));
    const nodes = list.map((w, i) => Nova.h('span', { class: 'nv-rotate-word', 'aria-hidden': 'true', 'data-state': i === 0 ? 'active' : null }, w));
    el.append(...nodes);
    if (Nova.reducedMotion() || list.length < 2) return {};

    let i = 0;
    let timer = 0;
    const next = () => {
      const cur = nodes[i];
      i = (i + 1) % nodes.length;
      const nxt = nodes[i];
      cur.dataset.state = 'out';
      // 先把下一个词放回底部起点（无过渡），下一帧再进场
      nxt.style.transition = 'none';
      nxt.removeAttribute('data-state');
      nxt.getBoundingClientRect();
      nxt.style.transition = '';
      nxt.dataset.state = 'active';
      timer = setTimeout(() => {
        if (cur.dataset.state === 'out') cur.removeAttribute('data-state');
      }, 700);
      Nova.emit(el, 'nv:change', { index: i, word: list[i] });
    };
    let iv = 0;
    const stop = Nova.inView(el, (v) => {
      clearInterval(iv);
      if (v) iv = setInterval(next, Math.max(800, o.interval));
    }, { once: false, threshold: 0 });
    return {
      next,
      destroy() { stop(); clearInterval(iv); clearTimeout(timer); },
    };
  });

  Nova.textFx = {
    /** 重播 blur-in / scramble */
    replay(el) {
      if (typeof el === 'string') el = document.querySelector(el);
      const inst = Nova.get(el, 'text-blur-in') || Nova.get(el, 'text-scramble');
      inst && inst.replay && inst.replay();
    },
  };
})();

;
/* src/components/marquee/marquee.js */
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

;
/* src/components/confetti/confetti.js */
/* DomSprig-UI · Confetti 彩带
 * Nova.confetti({ x, y, particleCount, spread, angle, velocity, gravity, drag, scalar, colors, shapes }) → Promise
 *   x / y 是视口比例（0–1），默认 0.5 / 0.6（屏幕中央偏下）；angle 90 表示朝上，spread 为扇形张角（度）。
 * Nova.confetti.burst(el, opts)   从元素中心喷出（颜色读取该元素所在处的 --nv-hue）
 * Nova.confetti.reset()           立即清空并移除画布
 * <button data-confetti>          点击时从按钮喷出；data-confetti="screen" 从屏幕中央偏下喷出；
 *                                 其余配置写成 data-particle-count / data-spread / data-colors="a|b" 等
 * - 一张共享画布（按 devicePixelRatio 缩放，最高 2 倍），所有粒子落完即停止 rAF 并移除画布
 * - 物理：初速度 + 空气阻力 + 重力（接近终端速度后缓慢飘落）+ 左右摆动 + 旋转 + 翻面（按 cos 缩放）
 * - 减少动态偏好：不播放，Promise 立即 resolve
 */
(() => {
  const { Nova } = window;
  const SHAPES = ['square', 'circle', 'strip'];
  const DEFAULTS = {
    x: 0.5, y: 0.6, particleCount: 80, spread: 60, angle: 90,
    velocity: 30, gravity: 1, drag: 0.92, scalar: 1, colors: null, shapes: SHAPES,
  };
  // 默认配色：主色 + 主色相两侧偏移 + 语义色，全部从 token 推导，随 --nv-hue 与明暗主题变化
  const PALETTE = [
    'var(--nv-primary)',
    'oklch(0.72 0.18 calc(var(--nv-hue) + 60))',
    'oklch(0.68 0.19 calc(var(--nv-hue) - 60))',
    'var(--nv-warning)',
    'var(--nv-success)',
  ];
  const FRAME = 1000 / 60;
  const MAX_DPR = 2;

  let canvas = null;
  let ctx = null;
  let raf = 0;
  let last = 0;
  let dpr = 1;
  let W = 0;
  let H = 0;
  let dirty = true;
  let parts = [];
  let waiters = [];

  const onResize = () => { dirty = true; };

  /** 把任意 CSS 颜色表达式（含 var() / light-dark()）解析成画布可用的颜色串 */
  function resolveColors(list, ctxEl) {
    const host = ctxEl && ctxEl.isConnected ? ctxEl : document.body;
    const probe = Nova.h('span', { 'aria-hidden': 'true', hidden: true });
    host.append(probe);
    const out = [];
    for (const c of list) {
      probe.style.color = '';
      probe.style.color = c;
      if (probe.style.color) out.push(getComputedStyle(probe).color);
    }
    probe.remove();
    return out.length ? out : ['currentColor'];
  }

  function ensureCanvas() {
    if (canvas) return;
    canvas = Nova.h('canvas', { class: 'nv-confetti-canvas', 'aria-hidden': 'true', popover: 'manual' });
    document.body.append(canvas);
    // 进入顶层，保证在模态对话框之上也可见；不支持 popover 时依赖 CSS 的 z-index
    try { canvas.showPopover && canvas.showPopover(); } catch (e) { /* 忽略 */ }
    ctx = canvas.getContext('2d');
    dirty = true;
    window.addEventListener('resize', onResize);
  }

  function teardown() {
    cancelAnimationFrame(raf);
    raf = 0;
    parts = [];
    if (canvas) {
      window.removeEventListener('resize', onResize);
      canvas.remove();
      canvas = ctx = null;
    }
    const list = waiters;
    waiters = [];
    list.forEach((fn) => fn());
  }

  function fit() {
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    dirty = false;
  }

  function frame(now) {
    raf = 0;
    if (!canvas) return;
    if (dirty) fit();
    const dt = Math.min(now - last, 50);
    last = now;
    const k = dt / FRAME;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let alive = 0;
    for (const p of parts) {
      p.age += dt;
      const d = Math.pow(p.drag, k);
      p.vx *= d;
      p.vy = p.vy * d + p.g * k;
      p.wob += p.wobSpeed * k;
      p.x += (p.vx + Math.cos(p.wob) * p.sway) * k;
      p.y += p.vy * k;
      p.rot += p.spin * k;
      p.flip += p.flipSpeed * k;
      const fade = Math.min(1, (p.life - p.age) / 700);
      if (fade <= 0 || p.y > H + 40) continue;
      parts[alive++] = p;

      const c = Math.cos(p.rot) * dpr;
      const s = Math.sin(p.rot) * dpr;
      const f = Math.cos(p.flip);
      ctx.setTransform(c, s, -s * f, c * f, p.x * dpr, p.y * dpr);
      ctx.globalAlpha = fade;
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'strip') {
        ctx.fillRect(-p.size * 0.22, -p.size * 0.85, p.size * 0.44, p.size * 1.7);
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      }
    }
    parts.length = alive;
    ctx.globalAlpha = 1;
    if (alive) raf = requestAnimationFrame(frame);
    else teardown();
  }

  function fire(opts = {}, ctxEl) {
    const o = { ...DEFAULTS, ...opts };
    if (Nova.reducedMotion()) return Promise.resolve();
    const count = Nova.clamp(Math.round(Number(o.particleCount) || 0), 0, 600);
    if (!count) return Promise.resolve();
    const toList = (v) => (Array.isArray(v) ? v : String(v).split('|')).map((s) => String(s).trim()).filter(Boolean);
    const colors = resolveColors(o.colors ? toList(o.colors) : PALETTE, ctxEl);
    let shapes = toList(o.shapes || SHAPES).filter((s) => SHAPES.includes(s));
    if (!shapes.length) shapes = SHAPES;

    ensureCanvas();
    if (dirty) fit();
    const ox = Number(o.x) * W;
    const oy = Number(o.y) * H;
    const angle = (Number(o.angle) * Math.PI) / 180;
    const spread = (Number(o.spread) * Math.PI) / 180;
    const drag = Nova.clamp(Number(o.drag), 0.5, 0.995);
    const g = 0.32 * Number(o.gravity);
    const scalar = Math.max(0.1, Number(o.scalar) || 1);
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const speed = Number(o.velocity) * (0.55 + Math.random() * 0.45);
      parts.push({
        x: ox, y: oy,
        vx: Math.cos(a) * speed,
        vy: -Math.sin(a) * speed,
        g: g * (0.75 + Math.random() * 0.5),
        drag,
        size: (6 + Math.random() * 5) * scalar,
        color: colors[i % colors.length],
        shape: shapes[Math.floor(Math.random() * shapes.length)],
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.3,
        flip: Math.random() * Math.PI * 2,
        flipSpeed: 0.08 + Math.random() * 0.12,
        wob: Math.random() * Math.PI * 2,
        wobSpeed: 0.04 + Math.random() * 0.06,
        sway: 0.3 + Math.random() * 0.5,
        age: 0,
        life: 3000 + Math.random() * 1600,
      });
    }
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    return new Promise((resolve) => waiters.push(resolve));
  }

  const confetti = (opts) => fire(opts, null);

  confetti.burst = (el, opts = {}) => {
    if (typeof el === 'string') el = document.querySelector(el);
    if (!el) return Promise.resolve();
    const r = el.getBoundingClientRect();
    return fire({
      particleCount: 60, spread: 70, velocity: 24,
      ...opts,
      x: (r.left + r.width / 2) / window.innerWidth,
      y: (r.top + r.height / 2) / window.innerHeight,
    }, el);
  };

  confetti.reset = () => teardown();

  Nova.confetti = confetti;

  // 声明式：<button data-confetti>，配置从 data-* 读取
  const DATA = { particleCount: 0, spread: 0, angle: 0, velocity: 0, gravity: 0, drag: 0, scalar: 0, colors: '', shapes: '', x: 0, y: 0 };
  document.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('[data-confetti]');
    if (!el || el.matches(':disabled, [aria-disabled="true"]')) return;
    const read = Nova.opts(el, DATA);
    const o = {};
    for (const key in DATA) if (key in el.dataset && el.dataset[key] !== '') o[key] = read[key];
    if (el.dataset.confetti === 'screen') fire(o, el);
    else confetti.burst(el, o);
  });
})();

;
/* src/components/backdrop/backdrop.js */
/* DomSprig-UI · Backdrop
 * [data-nv-meteors="12"]  生成 12 颗流星（.nv-meteor，aria-hidden）；起点、时长、延迟随机，
 *                         飞行距离按容器尺寸计算（ResizeObserver 更新）；离开视口暂停（data-paused）。
 *                         可选 data-speed（时长倍率，默认 1，越大越慢）。实例方法：refresh() / destroy()
 * .nv-bg-aurora           纯 CSS；这里只负责离开视口时暂停动画。
 * 减少动态偏好：不生成流星，极光由 CSS 定格。
 */
(() => {
  const { Nova } = window;

  const pauseOffscreen = (el) => Nova.inView(el, (v) => el.toggleAttribute('data-paused', !v), { once: false, threshold: 0 });

  Nova.define('meteors', '[data-nv-meteors]', (el) => {
    el.setAttribute('aria-hidden', 'true');
    let ro = null;
    const stop = pauseOffscreen(el);

    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w && h) el.style.setProperty('--_dist', `${Math.round(Math.hypot(w, h) * 0.9)}px`);
    };

    const refresh = () => {
      el.querySelectorAll(':scope > .nv-meteor').forEach((m) => m.remove());
      if (Nova.reducedMotion()) return;
      const n = Nova.clamp(Math.round(Number(el.dataset.nvMeteors) || 12), 0, 60);
      const speed = Math.max(0.2, Number(el.dataset.speed) || 1);
      const frag = document.createDocumentFragment();
      for (let i = 0; i < n; i++) {
        const m = Nova.h('span', { class: 'nv-meteor' });
        // 起点铺在顶边与右侧（含容器外），让流星从右上斜向划入
        const onTop = Math.random() < 0.7;
        m.style.setProperty('--_x', `${(onTop ? 10 + Math.random() * 100 : 100 + Math.random() * 15).toFixed(1)}%`);
        m.style.setProperty('--_y', `${(onTop ? -6 - Math.random() * 6 : Math.random() * 55).toFixed(1)}%`);
        m.style.setProperty('--_dur', `${((6 + Math.random() * 6) * speed).toFixed(2)}s`);
        m.style.setProperty('--_delay', `${(-Math.random() * 12 + i * 0.35).toFixed(2)}s`);
        frag.append(m);
      }
      el.append(frag);
      measure();
    };

    refresh();
    if ('ResizeObserver' in window) {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }

    return {
      refresh,
      destroy() {
        stop();
        ro && ro.disconnect();
        el.querySelectorAll(':scope > .nv-meteor').forEach((m) => m.remove());
        el.removeAttribute('data-paused');
      },
    };
  });

  Nova.define('aurora', '.nv-bg-aurora', (el) => {
    const stop = pauseOffscreen(el);
    return { destroy() { stop(); el.removeAttribute('data-paused'); } };
  });
})();
