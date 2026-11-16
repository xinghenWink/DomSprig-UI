/* Nova UI · Select
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
