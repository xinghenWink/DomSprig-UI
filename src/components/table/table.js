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
