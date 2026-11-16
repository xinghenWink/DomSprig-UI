/* Nova UI · Combobox 自动补全
 * <input class="nv-combobox" list="cities" aria-label="城市">  +  <datalist id="cities"><option value="北京">首都</option></datalist>
 * 增强后 input 包进 .nv-control.nv-combobox-box，浏览器原生的 datalist 下拉换成 .nv-panel 建议面板。
 * 按 option 的 value 做不区分大小写的包含匹配，匹配段加粗；option 的文字或 label 作为右侧说明，data-icon 显示图标。
 * datalist 内容变化会自动刷新（适合边输入边请求远程建议）。
 * data-clearable   有值时显示清除按钮
 * data-empty       无匹配时的提示，默认「无匹配项」；"none" 表示不提示，直接收起
 * data-min-length  至少输入几个字符才弹出，默认 0
 * data-size        sm | md | lg
 * 事件：选中或清除时派发原生 input / change；选中时派发 nv:select { value, label }
 * 实例：Nova.get(input, 'combobox') → { open(), close(), refresh(), destroy() }
 */
(() => {
  const { h } = Nova;

  // 匹配段包进 <mark>，其余保持纯文本节点，不拼 HTML
  const highlight = (text, q) => {
    const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
    if (i < 0) return [text];
    return [text.slice(0, i), h('mark', { class: 'nv-combobox-mark' }, text.slice(i, i + q.length)), text.slice(i + q.length)];
  };

  Nova.define('combobox', 'input.nv-combobox', (input) => {
    const o = Nova.opts(input, { clearable: false, empty: '无匹配项', minLength: 0, size: '' });
    const listAttr = input.getAttribute('list');
    const autoAttr = input.getAttribute('autocomplete');
    const listId = Nova.uid('nv-combobox-list');
    const datalist = () => (listAttr ? document.getElementById(listAttr) : null);

    // 去掉 list 属性，避免原生建议和自定义面板同时出现
    input.removeAttribute('list');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', listId);

    const box = h('span', { class: 'nv-control nv-combobox-box', 'data-size': o.size || null });
    const clearBtn = o.clearable
      ? h('button', { type: 'button', class: 'nv-combobox-clear', tabindex: '-1', 'aria-label': '清除', hidden: true, html: Nova.icon('x') })
      : null;
    const arrow = listAttr ? h('span', { class: 'nv-combobox-arrow', 'aria-hidden': 'true', html: Nova.icon('chevron-down') }) : null;
    input.before(box);
    box.append(input);
    if (clearBtn) box.append(clearBtn);
    if (arrow) box.append(arrow);

    let panel = null;
    let list = null;
    let empty = null;
    let floating = null;
    let floatOpts = null;
    let silent = false; // 自己派发 input 事件时不重新过滤
    let typed = false; // 用户输入过、还没选中或主动关闭；datalist 异步填充后据此自动弹出

    const nav = Nova.roving(() => (list ? list.querySelectorAll('[role="option"]') : []), {
      typeahead: false, // 字符键交给输入框，不做首字母跳转
      onChange: (el) => {
        if (el) input.setAttribute('aria-activedescendant', el.id);
        else input.removeAttribute('aria-activedescendant');
      },
    });

    const usable = () => !input.disabled && !input.readOnly;
    const longEnough = () => [...input.value].length >= o.minLength;
    const options = () => {
      const dl = datalist();
      return dl ? [...dl.querySelectorAll('option')].filter((op) => op.value) : [];
    };
    const syncClear = () => { if (clearBtn) clearBtn.hidden = !input.value || !usable(); };
    const fire = () => {
      silent = true;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      silent = false;
    };

    /* —— 面板 —— */
    function build() {
      list = h('div', {
        class: 'nv-combobox-list nv-scroll',
        role: 'listbox',
        id: listId,
        'aria-label': input.getAttribute('aria-label') || null,
      });
      empty = h('div', { class: 'nv-combobox-empty', hidden: true });
      panel = h('div', { class: 'nv-panel nv-combobox-panel', 'data-size': o.size || null }, list, empty);
      // 点面板不让输入框失焦
      panel.addEventListener('mousedown', (e) => e.preventDefault());
      list.addEventListener('pointermove', (e) => {
        const it = e.target.closest('[role="option"]');
        if (it && it !== nav.active && it.getAttribute('aria-disabled') !== 'true') nav.set(it, { scroll: false });
      });
      list.addEventListener('click', (e) => {
        const it = e.target.closest('[role="option"]');
        if (it) choose(it);
      });
    }

    // 按当前输入重建选项；返回 false 表示没有可显示的内容
    function render() {
      const q = input.value.trim();
      const ql = q.toLowerCase();
      const hits = options().filter((op) => !ql || op.value.toLowerCase().includes(ql));
      const prev = nav.active ? nav.active.dataset.value : null;
      nav.reset();
      list.replaceChildren(...hits.map((op, i) => {
        const value = op.value;
        const label = op.label.trim();
        const desc = label && label !== value ? label : '';
        const icon = op.dataset.icon ? Nova.icon(op.dataset.icon) : '';
        return h('div', {
          class: 'nv-item nv-combobox-option',
          role: 'option',
          id: `${listId}-${i}`,
          'aria-selected': String(value === input.value),
          'aria-disabled': op.disabled ? 'true' : null,
          'data-value': value,
        },
        icon ? h('span', { class: 'nv-item-icon', 'aria-hidden': 'true', html: icon }) : null,
        h('span', { class: 'nv-item-label' }, highlight(value, q)),
        desc ? h('span', { class: 'nv-item-desc' }, desc) : null,
        h('span', { class: 'nv-item-check', 'aria-hidden': 'true', html: Nova.icon('check') }));
      }));
      list.hidden = !hits.length;
      empty.hidden = hits.length > 0 || o.empty === 'none';
      empty.textContent = o.empty;
      if (prev != null && floating) {
        const again = [...list.children].find((x) => x.dataset.value === prev);
        if (again) nav.set(again);
      }
      return hits.length > 0 || o.empty !== 'none';
    }

    function open() {
      if (floating || !usable() || !datalist() || !longEnough()) return false;
      build();
      if (!render()) { panel = list = empty = null; return false; }
      floatOpts = { placement: 'bottom-start', offset: 6, onDismiss: () => { typed = false; close(); } };
      floating = Nova.floating(panel, box, floatOpts);
      // 记住首次展开的方向，过滤导致高度变化时不上下跳
      floatOpts.placement = `${panel.dataset.side || 'bottom'}-start`;
      input.setAttribute('aria-expanded', 'true');
      box.setAttribute('data-open', '');
      return true;
    }
    function close() {
      if (!floating) return;
      nav.reset();
      floating.close();
      floating = null;
      panel = list = empty = null;
      input.setAttribute('aria-expanded', 'false');
      box.removeAttribute('data-open');
    }
    function update() {
      if (!floating) return open();
      if (!longEnough() || !render()) return close();
      floating.update();
      return true;
    }

    function choose(item) {
      if (!item || item.getAttribute('aria-disabled') === 'true') return;
      const value = item.dataset.value;
      const label = item.querySelector('.nv-item-desc')?.textContent || '';
      typed = false;
      close();
      if (input.value !== value) { input.value = value; fire(); }
      syncClear();
      input.focus({ preventScroll: true });
      Nova.emit(input, 'nv:select', { value, label });
    }

    /* —— 事件 —— */
    const onInput = (e) => {
      syncClear();
      if (silent || e.isComposing) return;
      typed = true;
      update();
    };
    const onCompositionEnd = () => { typed = true; update(); };
    const onKey = (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      const k = e.key;
      if (k === 'ArrowDown' || k === 'ArrowUp') {
        e.preventDefault();
        if (floating) { nav.key(e); return; }
        if (!open()) return;
        const items = nav.enabled();
        const cur = items.find((x) => x.getAttribute('aria-selected') === 'true');
        nav.set(cur || (k === 'ArrowDown' ? items[0] : items[items.length - 1]));
        return;
      }
      if (!floating) return;
      // PageUp / PageDown 总是翻列表；Home / End 只在已经高亮某项时跳列表，否则留给输入框移动光标
      if (k === 'PageUp' || k === 'PageDown' || ((k === 'Home' || k === 'End') && nav.active)) { nav.key(e); return; }
      if (k === 'Enter') {
        if (nav.active) { e.preventDefault(); choose(nav.active); }
        else close();
        return;
      }
      if (k === 'Tab') close();
    };
    const onClick = () => { if (!floating) open(); };
    const onFocus = () => syncClear();
    const onBlur = () => { typed = false; close(); };
    // 点外框空白处或箭头：聚焦输入框并切换面板
    const onBoxDown = (e) => {
      if (e.button !== 0 || e.target === input || (clearBtn && clearBtn.contains(e.target))) return;
      e.preventDefault();
      input.focus();
      if (floating) close();
      else open();
    };
    const onClearDown = (e) => e.preventDefault();
    const onClear = () => {
      input.value = '';
      fire();
      syncClear();
      input.focus();
      if (floating) update();
    };

    input.addEventListener('input', onInput);
    input.addEventListener('compositionend', onCompositionEnd);
    input.addEventListener('keydown', onKey);
    input.addEventListener('click', onClick);
    input.addEventListener('focus', onFocus);
    input.addEventListener('blur', onBlur);
    box.addEventListener('pointerdown', onBoxDown);
    clearBtn?.addEventListener('mousedown', onClearDown);
    clearBtn?.addEventListener('click', onClear);

    const form = input.form;
    const onReset = () => setTimeout(syncClear);
    form?.addEventListener('reset', onReset);

    // datalist 被脚本改写时刷新；面板未打开但用户刚输入过时自动弹出
    const mo = new MutationObserver(() => {
      if (floating) update();
      else if (typed && document.activeElement === input) open();
    });
    const observe = () => {
      mo.disconnect();
      const dl = datalist();
      if (dl) mo.observe(dl, { childList: true, subtree: true, attributes: true, characterData: true });
    };
    observe();
    syncClear();

    return {
      open,
      close,
      refresh() { observe(); syncClear(); if (floating) update(); },
      destroy() {
        close();
        mo.disconnect();
        input.removeEventListener('input', onInput);
        input.removeEventListener('compositionend', onCompositionEnd);
        input.removeEventListener('keydown', onKey);
        input.removeEventListener('click', onClick);
        input.removeEventListener('focus', onFocus);
        input.removeEventListener('blur', onBlur);
        box.removeEventListener('pointerdown', onBoxDown);
        form?.removeEventListener('reset', onReset);
        box.before(input);
        box.remove();
        if (listAttr) input.setAttribute('list', listAttr);
        if (autoAttr == null) input.removeAttribute('autocomplete');
        else input.setAttribute('autocomplete', autoAttr);
        ['role', 'aria-autocomplete', 'aria-expanded', 'aria-controls', 'aria-activedescendant'].forEach((a) => input.removeAttribute(a));
      },
    };
  });
})();
