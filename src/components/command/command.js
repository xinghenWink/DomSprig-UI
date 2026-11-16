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
