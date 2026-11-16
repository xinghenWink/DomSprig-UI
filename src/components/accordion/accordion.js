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
