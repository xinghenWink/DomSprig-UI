/* Nova UI · Tooltip
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
