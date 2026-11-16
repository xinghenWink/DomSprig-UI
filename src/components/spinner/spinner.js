/* Nova UI · Spinner / Loader
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
