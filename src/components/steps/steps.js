/* Nova UI · Steps
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
