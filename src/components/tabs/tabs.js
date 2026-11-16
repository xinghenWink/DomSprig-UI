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
