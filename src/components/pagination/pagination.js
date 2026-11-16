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
