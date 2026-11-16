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
